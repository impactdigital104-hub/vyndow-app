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

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function serializeSelfProfile(data) {
  const selfProfile = data || {};
  return {
    domain: String(selfProfile.domain || "").trim(),
    normalizedDomain: normalizeDomain(selfProfile.normalizedDomain || selfProfile.domain || ""),
    referringDomains: asNum(selfProfile.referringDomains, null),
    totalBacklinks: asNum(selfProfile.totalBacklinks, null),
    authorityBuckets:
      selfProfile.authorityBuckets && typeof selfProfile.authorityBuckets === "object"
        ? selfProfile.authorityBuckets
        : null,
    source: String(selfProfile.source || "").trim(),
    lastAnalyzedAt: serializeTimestamp(selfProfile.lastAnalyzedAt),
    updatedAt: serializeTimestamp(selfProfile.updatedAt),
  };
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
    result,
    referringDomains: asNum(
      result?.referring_domains ?? result?.referring_main_domains,
      null
    ),
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

    const { effectiveUid, effectiveWebsiteId, website } = await resolveEffectiveContext(uid, websiteId);

    const rawDomain = String(
      website?.domain || website?.website || website?.url || website?.name || website?.label || ""
    ).trim();

    const normalizedDomain = normalizeDomain(rawDomain);

    if (!normalizedDomain) {
      return res.status(400).json({
        error: "Missing website domain for backlink analysis.",
      });
    }

    const summary = await postDataForSeoSummary(normalizedDomain);

    if (summary.referringDomains == null && summary.totalBacklinks == null) {
      return res.status(400).json({
        error: "No clean backlink summary metrics were returned.",
      });
    }

    const db = admin.firestore();
    const backlinksModuleRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks`
    );

    const writePayload = {
      selfProfile: {
        domain: rawDomain,
        normalizedDomain,
        referringDomains: summary.referringDomains,
        totalBacklinks: summary.totalBacklinks,
        authorityBuckets: null,
        source: "dataforseo_backlinks_summary_live",
        lastAnalyzedAt: nowTs(),
        updatedAt: nowTs(),
      },
      updatedAt: nowTs(),
    };

    await backlinksModuleRef.set(writePayload, { merge: true });

    const nowIso = new Date().toISOString();

    return res.status(200).json({
      ok: true,
      profile: {
        domain: rawDomain,
        normalizedDomain,
        referringDomains: summary.referringDomains,
        totalBacklinks: summary.totalBacklinks,
        authorityBuckets: null,
        source: "dataforseo_backlinks_summary_live",
        lastAnalyzedAt: nowIso,
        updatedAt: nowIso,
      },
    });
  } catch (e) {
    console.error("analyze-self error:", e);
    return res.status(500).json({
      error: "We could not analyze your backlink profile right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
