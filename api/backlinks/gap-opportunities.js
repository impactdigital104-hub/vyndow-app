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

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

async function postDataForSeoReferringDomainsPage(normalizedDomain, offset = 0, limit = 1000) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("Missing DATAFORSEO credentials on server.");
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const response = await fetch("https://api.dataforseo.com/v3/backlinks/referring_domains/live", {
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
        exclude_internal_backlinks: true,
        internal_list_limit: 10,
        limit,
        offset,
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
  const items = Array.isArray(result?.items) ? result.items : [];

  return {
    items,
    totalCount: Number.isFinite(Number(result?.total_count)) ? Number(result.total_count) : null,
  };
}

async function fetchAllReferringDomains(normalizedDomain) {
  const pageSize = 1000;
  const maxPages = 20;

  const seen = new Set();
  let offset = 0;
  let page = 0;

  while (page < maxPages) {
    const { items } = await postDataForSeoReferringDomainsPage(normalizedDomain, offset, pageSize);

    if (!items.length) break;

    for (const item of items) {
      const candidate = normalizeDomain(item?.domain || item?.referring_domain || item?.target || "");
      if (!isLikelyDomain(candidate)) continue;
      seen.add(candidate);
    }

    if (items.length < pageSize) break;

    offset += pageSize;
    page += 1;
  }

  return Array.from(seen);
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

    const db = admin.firestore();
    const backlinksModuleRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks`
    );

    const backlinksSnap = await backlinksModuleRef.get();
    const backlinksData = backlinksSnap.exists ? backlinksSnap.data() || {} : {};

    const selfDomain = normalizeDomain(
      backlinksData?.selfProfile?.normalizedDomain || backlinksData?.selfProfile?.domain || ""
    );

    const competitorProfiles = Array.isArray(backlinksData?.competitorProfiles)
      ? backlinksData.competitorProfiles
      : [];

    const competitorDomains = uniqueStrings(
      competitorProfiles
        .map((item) => normalizeDomain(item?.normalizedDomain || item?.originalDomain || item?.domain || ""))
        .filter((value) => isLikelyDomain(value))
    );

    if (!selfDomain || !competitorDomains.length) {
      return res.status(400).json({
        error: "Backlink context is not ready yet. Please complete backlink analysis first.",
      });
    }

    const selfReferringDomains = await fetchAllReferringDomains(selfDomain);
    const selfReferringDomainSet = new Set(selfReferringDomains);

    const gapMap = new Map();
    const competitorFailed = [];

    for (const competitorDomain of competitorDomains) {
      try {
        const competitorReferringDomains = await fetchAllReferringDomains(competitorDomain);

        for (const referringDomain of competitorReferringDomains) {
          const normalizedReferringDomain = normalizeDomain(referringDomain);
          if (!isLikelyDomain(normalizedReferringDomain)) continue;
          if (selfReferringDomainSet.has(normalizedReferringDomain)) continue;

          const existing = gapMap.get(normalizedReferringDomain);

          if (existing) {
            if (!existing.linkedCompetitors.includes(competitorDomain)) {
              existing.linkedCompetitors.push(competitorDomain);
              existing.linkedCompetitorCount = existing.linkedCompetitors.length;
              existing.updatedAt = new Date().toISOString();
            }
            continue;
          }

          gapMap.set(normalizedReferringDomain, {
            referringDomain: normalizedReferringDomain,
            normalizedDomain: normalizedReferringDomain,
            linkedCompetitors: [competitorDomain],
            linkedCompetitorCount: 1,
            source: "competitor_gap",
            discoveredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error("Gap analysis competitor failed:", competitorDomain, e);
        competitorFailed.push(competitorDomain);
      }
    }

    const competitorSuccessCount = competitorDomains.length - competitorFailed.length;

    if (competitorSuccessCount <= 0) {
      return res.status(500).json({
        error: "We could not generate backlink opportunities right now. Please try again.",
      });
    }

    const gapOpportunities = Array.from(gapMap.values())
      .map((item) => ({
        ...item,
        linkedCompetitors: uniqueStrings(item.linkedCompetitors).sort(),
        linkedCompetitorCount: uniqueStrings(item.linkedCompetitors).length,
      }))
      .sort((a, b) => {
        if (b.linkedCompetitorCount !== a.linkedCompetitorCount) {
          return b.linkedCompetitorCount - a.linkedCompetitorCount;
        }
        return a.normalizedDomain.localeCompare(b.normalizedDomain);
      });

    const gapMeta = {
      selfDomain,
      competitorCountAnalyzed: competitorDomains.length,
      competitorSuccessCount,
      competitorFailedCount: competitorFailed.length,
      totalGapDomains: gapOpportunities.length,
      generatedAt: nowTs(),
      updatedAt: nowTs(),
    };

    await backlinksModuleRef.set(
      {
        gapOpportunities,
        gapMeta,
        enrichedGapOpportunities: admin.firestore.FieldValue.delete(),
        enrichmentMeta: admin.firestore.FieldValue.delete(),
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      gapOpportunities,
      gapMeta: {
        selfDomain,
        competitorCountAnalyzed: competitorDomains.length,
        competitorSuccessCount,
        competitorFailedCount: competitorFailed.length,
        totalGapDomains: gapOpportunities.length,
        generatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      partial: competitorFailed.length > 0,
    });
  } catch (e) {
    console.error("gap-opportunities error:", e);
    return res.status(500).json({
      error: "We could not generate backlink opportunities right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
