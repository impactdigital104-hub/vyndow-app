// api/seo/strategy/fetchKeywordMetrics.js
//
// Step 5 (Human edit): Fetch metrics for ONE keyword using the SAME DataForSEO approach as generateKeywordPool.js
// - Uses keywordPool geo_mode/location_name/language_code so user edits stay consistent.
// - NEVER fakes numbers. If we can't fetch, returns ok:false.

import admin from "../../firebaseAdmin";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- EFFECTIVE CONTEXT --------------------
async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  }

  const w = snap.data() || {};
  const effectiveUid = w.ownerUid || uid;
  const effectiveWebsiteId = w.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId };
}

function competitionLabelFromFloat(v) {
  if (v == null) return null;
  if (v < 0.33) return "LOW";
  if (v < 0.67) return "MEDIUM";
  return "HIGH";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, keyword } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const kw = String(keyword || "").trim();
    if (!kw) return res.status(400).json({ error: "Missing keyword" });

    const { effectiveUid, effectiveWebsiteId } =
      await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();

    // Reuse geo context from keywordPool (so it matches Step 4 exactly)
    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );

    const kpSnap = await keywordPoolRef.get();
    if (!kpSnap.exists) {
      return res.status(400).json({
        error: "keywordPool missing. Complete Step 4 first.",
      });
    }

    const kp = kpSnap.data() || {};
    const geo_mode = kp.geo_mode || "country";
    const location_name = String(kp.location_name || "").trim();
    const language_code = kp.language_code || "en";

    if (!location_name) {
      return res.status(400).json({ error: "keywordPool.location_name missing." });
    }

    // -------------------- DATAFORSEO CALL (same as generateKeywordPool.js) --------------------
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    const auth = Buffer.from(`${login}:${password}`).toString("base64");

    let endpoint;
    let payload;
    let source;

    if (geo_mode === "country") {
      // Labs keyword ideas (same endpoint as Step 4)
      endpoint = "https://api.dataforseo.com/v3/dataforseo_labs/keyword_ideas/live";

      payload = [
        {
          location_name,
          language_code,
          keywords: [kw],
          limit: 50,
          offset: 0,
          order_by: ["keyword_info.search_volume,desc"],
          include_serp_info: false,
          closely_variants: false,
        },
      ];

      source = "labs";
    } else {
      // Google Ads endpoint for local targeting (same endpoint as Step 4)
      endpoint =
        "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live";

      payload = [
        {
          location_name,
          language_code,
          keywords: [kw],
          include_adult_keywords: false,
          sort_by: "relevance",
          limit: 50,
          offset: 0,
        },
      ];

      source = "google_ads";
    }

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await r.json();

    if (json?.status_code !== 20000) {
      return res.status(200).json({
        ok: false,
        reason: "dataforseo_error",
        rawStatus: json?.status_code ?? null,
      });
    }

    const task = json?.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      return res.status(200).json({
        ok: false,
        reason: "dataforseo_task_error",
        status_code: task?.status_code ?? null,
        status_message: task?.status_message ?? null,
        geo_mode,
        location_name,
        source,
      });
    }

    // Parse items exactly like Step 4
    let items = [];

    if (source === "labs") {
      items = Array.isArray(task?.result?.[0]?.items) ? task.result[0].items : [];
    } else {
      const resultsRaw = Array.isArray(task.result) ? task.result : [];
      items = Array.isArray(resultsRaw?.[0]?.items) ? resultsRaw[0].items : resultsRaw;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(200).json({
        ok: false,
        reason: "no_items",
        geo_mode,
        location_name,
        source,
      });
    }

    // Pick best match:
    // Prefer exact keyword match (case-insensitive), else take first item.
    const lowered = kw.toLowerCase();
    let chosen = items.find((it) => String(it?.keyword || "").trim().toLowerCase() === lowered);
    if (!chosen) chosen = items[0];

    // Normalize to Step 4 field shape
    let out;
    if (source === "labs") {
      const ki = chosen?.keyword_info || {};
      const compFloat = ki?.competition ?? null;
      const compIndex = compFloat == null ? null : Math.round(compFloat * 100);

      out = {
        keyword: String(chosen?.keyword || kw).trim(),
        volume: ki?.search_volume ?? null,
        competition: competitionLabelFromFloat(compFloat),
        competition_index: compIndex,
        cpc: ki?.cpc ?? null,
        language_code,
      };
    } else {
      out = {
        keyword: String(chosen?.keyword || kw).trim(),
        volume: chosen?.search_volume ?? null,
        competition: chosen?.competition ?? null,
        competition_index: chosen?.competition_index ?? null,
        cpc: chosen?.cpc ?? null,
        language_code,
      };
    }

    const allNull =
      out.volume == null &&
      out.cpc == null &&
      out.competition == null &&
      out.competition_index == null;

    if (allNull) {
      return res.status(200).json({
        ok: false,
        reason: "metrics_unavailable",
        keyword: kw,
      });
    }

    return res.status(200).json({
      ok: true,
      ...out,
      geo_mode,
      location_name,
      source,
    });
  } catch (e) {
    console.error("fetchKeywordMetrics error:", e);
    return res.status(500).json({
      error: "Unhandled server error",
      message: e?.message || String(e),
    });
  }
}
