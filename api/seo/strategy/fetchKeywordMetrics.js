// api/seo/strategy/fetchKeywordMetrics.js
//
// Step 5 (Human edit): Fetch metrics for ONE keyword using DataForSEO (same approach as Step 4 keyword pool).
// If metrics cannot be fetched, return ok:false with reason. Do NOT fake numbers.

import admin from "../../firebaseAdmin";

// Reuse your existing DataForSEO helper (same one used by generateKeywordPool.js).
// IMPORTANT: If your repo uses a different path/name, tell me and I’ll adjust.
// In most Vyndow SEO routes, it’s in api/_lib/dataForSeo.js or similar.
import { fetchKeywordDataForSeo } from "../../_lib/dataForSeo";

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
  if (!snap.exists) return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  const w = snap.data() || {};
  return {
    effectiveUid: w.ownerUid || uid,
    effectiveWebsiteId: w.ownerWebsiteId || websiteId,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);

    const { websiteId, keyword, geo_mode, location_name, language_code } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });
    if (!keyword || !String(keyword).trim()) return res.status(400).json({ error: "Missing keyword" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);

    // Optional: verify keywordPool exists so geo context is consistent
    const db = admin.firestore();
    const kpRef = db.doc(`users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`);
    const kpSnap = await kpRef.get();
    if (!kpSnap.exists) {
      return res.status(400).json({ error: "keywordPool missing. Complete Step 4 first." });
    }

    // Use provided geo values or fallback from keywordPool
    const kp = kpSnap.data() || {};
    const gm = geo_mode || kp.geo_mode || "country";
    const ln = location_name || kp.location_name || "";
    const lc = language_code || kp.language_code || "en";

    // Fetch from DataForSEO (single keyword)
    const metrics = await fetchKeywordDataForSeo({
      keyword: String(keyword).trim(),
      geo_mode: gm,
      location_name: ln,
      language_code: lc,
    });

    if (!metrics) {
      return res.status(200).json({ ok: false, reason: "no_metrics" });
    }

    // Standardize output fields
    return res.status(200).json({
      ok: true,
      keyword: String(keyword).trim(),
      volume: metrics.volume ?? null,
      cpc: metrics.cpc ?? null,
      competition: metrics.competition ?? null,
      competition_index: metrics.competition_index ?? null,
    });
  } catch (e) {
    console.error("fetchKeywordMetrics error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
