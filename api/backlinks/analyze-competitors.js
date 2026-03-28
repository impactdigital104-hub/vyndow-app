import admin from "../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId, website: null };
  }

  const website = snap.data() || {};
  const effectiveUid = website.ownerUid || uid;
  const effectiveWebsiteId = website.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId, website };
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function asNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function isLikelyDomain(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  if (v.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);
}

function normalizeCompetitors(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          return String(item.domain || item.url || item.website || item.name || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

async function postDataForSeoSummary(normalizedDomain) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("Missing DATAFORSEO credentials on server.");
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const response = await fetch("https://api.dataforseo.com/v3/backlinks/summary/live", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        target: normalizedDomain,
        include_subdomains: true,
        include_indirect_links: true,
        exclude_internal_backlinks: false,
        internal_list_limit: 10,
      },
    ]),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }

  if (!json) {
    throw new Error("DataForSEO returned a non-JSON response.");
  }

  if (json?.status_code !== 20000) {
    throw new Error(json?.status_message || "DataForSEO request failed.");
  }

  const task = json?.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message || "DataForSEO task failed.");
  }

  const result = Array.isArray(task?.result) ? task.result[0] || {} : {};

  return {
    referringDomains: asNum(result?.referring_domains ?? result?.referring_main_domains, null),
    totalBacklinks: asNum(result?.backlinks, null),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};

    if (!websiteId) {
      return res.status(400).json({ error: "Missing websiteId" });
    }

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);

    const businessProfileRef = admin
      .firestore()
      .doc(`users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessProfile`);

    const businessProfileSnap = await businessProfileRef.get();
    const businessProfile = businessProfileSnap.exists ? businessProfileSnap.data() || {} : {};

    const rawCompetitors = normalizeCompetitors(businessProfile?.competitors);

    const seen = new Set();
    const validCompetitors = [];
    let invalidCount = 0;

    for (const entry of rawCompetitors) {
      const normalizedDomain = normalizeDomain(entry);

      if (!isLikelyDomain(normalizedDomain)) {
        if (String(entry || "").trim()) invalidCount += 1;
        continue;
      }

      if (seen.has(normalizedDomain)) continue;
      seen.add(normalizedDomain);

      validCompetitors.push({
        originalDomain: String(entry || "").trim(),
        normalizedDomain,
      });
    }

    const backlinksModuleRef = admin
      .firestore()
      .doc(`users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks`);

    if (!validCompetitors.length) {
      await backlinksModuleRef.set(
        {
          competitorProfiles: [],
          competitorProfilesMeta: {
            invalidCount,
            failedCount: 0,
            successCount: 0,
            lastAnalyzedAt: nowTs(),
            updatedAt: nowTs(),
          },
          updatedAt: nowTs(),
        },
        { merge: true }
      );

      return res.status(200).json({
        ok: true,
        profiles: [],
        invalidCount,
        failedCount: 0,
        successCount: 0,
      });
    }

    const profiles = [];
    let failedCount = 0;

    for (const competitor of validCompetitors) {
      try {
        const summary = await postDataForSeoSummary(competitor.normalizedDomain);

        if (summary.referringDomains == null && summary.totalBacklinks == null) {
          failedCount += 1;
          continue;
        }

        profiles.push({
          originalDomain: competitor.originalDomain,
          normalizedDomain: competitor.normalizedDomain,
          referringDomains: summary.referringDomains,
          totalBacklinks: summary.totalBacklinks,
          authorityBuckets: null,
          source: "dataforseo_backlinks_summary_live",
          lastAnalyzedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Competitor backlink summary failed:", competitor.normalizedDomain, e);
        failedCount += 1;
      }
    }

    await backlinksModuleRef.set(
      {
        competitorProfiles: profiles,
        competitorProfilesMeta: {
          invalidCount,
          failedCount,
          successCount: profiles.length,
          lastAnalyzedAt: nowTs(),
          updatedAt: nowTs(),
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      profiles,
      invalidCount,
      failedCount,
      successCount: profiles.length,
    });
  } catch (e) {
    console.error("analyze-competitors error:", e);
    return res.status(500).json({
      error: "We could not analyze competitor backlinks right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
