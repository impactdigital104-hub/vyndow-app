// api/seo/strategy/generateKeywordPool.js

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

// -------------------- MAIN HANDLER --------------------
export default async function handler(req, res) {
  try {
if (req.method !== "POST") {
  return res.status(405).json({ error: "Method not allowed" });
}


const uid = await getUidFromRequest(req);


const {
  websiteId,
  seeds = [],
  geo_mode,
  location_name,
  language_code,
} = req.body || {};

if (!websiteId) {
  return res.status(400).json({ error: "Missing websiteId" });
}

if (!Array.isArray(seeds) || seeds.length === 0) {
  return res.status(400).json({ error: "Missing seeds[]" });
}

if (!geo_mode || (geo_mode !== "country" && geo_mode !== "local")) {
  return res.status(400).json({ error: "Missing or invalid geo_mode (country|local)" });
}

if (!location_name || !String(location_name).trim()) {
  return res.status(400).json({ error: "Missing location_name" });
}

if (!language_code) {
  return res.status(400).json({ error: "Missing language_code" });
}





    const { effectiveUid, effectiveWebsiteId } =
      await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();

    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );

    const existingSnap = await keywordPoolRef.get();

    // -------------------- LOCK CHECK --------------------
if (existingSnap.exists) {
  return res.status(200).json({
    ok: true,
    generationLocked: true,
    source: "existing",
    data: existingSnap.data(),
  });
}


    // -------------------- DATAFORSEO CALL --------------------
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    const auth = Buffer.from(`${login}:${password}`).toString("base64");

let endpoint;
let payload;
let source;

if (geo_mode === "country") {
  // Use DataForSEO Labs Keyword Ideas
  endpoint =
    "https://api.dataforseo.com/v3/dataforseo_labs/keyword_ideas/live";

  payload = [
    {
      location_name: String(location_name).trim(),
      language_code,
      keywords: seeds,
      limit: 500,
      offset: 0,
      order_by: ["keyword_info.search_volume,desc"],
      include_serp_info: false,
      closely_variants: false,
    },
  ];

  source = "labs";
} else {
  // Use Google Ads endpoint for local targeting
  endpoint =
    "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live";

  payload = [
    {
      location_name: String(location_name).trim(),
      language_code,
      keywords: seeds,
      include_adult_keywords: false,
      sort_by: "relevance",
      limit: 2000,
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
      return res.status(500).json({
        error: "DataForSEO error",
        raw: json,
      });
    }

const task = json?.tasks?.[0];
if (!task || task.status_code !== 20000) {
  const status_message =
    task?.status_message ||
    json?.status_message ||
    "DataForSEO task error";

  // Explicit STOP — do not fallback, do not save anything
  return res.status(400).json({
    error: "DataForSEO task error",
    status_code: task?.status_code ?? json?.status_code ?? null,
    status_message,
    geo_mode,
    location_name: String(location_name).trim(),
    source,
  });
}

    // If location_name is invalid/unresolvable, DataForSEO often returns empty/no result payload.
if (!Array.isArray(task?.result) || task.result.length === 0) {
  return res.status(400).json({
    error: "Invalid or unresolvable location_name",
    location_name: String(location_name).trim(),
    geo_mode,
  });
}


const apiCost = task?.cost ?? null;

let items = [];

if (source === "labs") {
  items =
    Array.isArray(task?.result?.[0]?.items)
      ? task.result[0].items
      : [];

} else {
  const resultsRaw = Array.isArray(task.result) ? task.result : [];
  items =
    Array.isArray(resultsRaw?.[0]?.items)
      ? resultsRaw[0].items
      : resultsRaw;
}
    // STOP if location_name is invalid/unresolvable OR no items returned (no fallback)
if (!Array.isArray(items) || items.length === 0) {
  return res.status(400).json({
    error: "Invalid or unresolvable location_name (no keyword items returned)",
    location_name: String(location_name).trim(),
    geo_mode,
    source,
  });
}


function competitionLabelFromFloat(v) {
  if (v == null) return null;
  if (v < 0.33) return "LOW";
  if (v < 0.67) return "MEDIUM";
  return "HIGH";
}

const parsed = items.map((item) => {
  if (source === "labs") {
    const ki = item?.keyword_info || {};
    const compFloat = ki?.competition ?? null;
    const compIndex =
      compFloat == null ? null : Math.round(compFloat * 100);

    return {
      keyword: item?.keyword ?? null,
      volume: ki?.search_volume ?? null,
      competition: competitionLabelFromFloat(compFloat),
      competition_index: compIndex,
      cpc: ki?.cpc ?? null,
      language_code,
    };
  } else {
    return {
      keyword: item?.keyword ?? null,
      volume: item?.search_volume ?? null,
      competition: item?.competition ?? null,
      competition_index: item?.competition_index ?? null,
      cpc: item?.cpc ?? null,
      language_code,
    };
  }
});



    // -------------------- SORT BY VOLUME DESC --------------------
    parsed.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    const allKeywords = parsed.slice(0, 500);
    const topKeywords = parsed.slice(0, 200);

    // -------------------- STORE --------------------
await keywordPoolRef.set({
  allKeywords,
  topKeywords,
  generationLocked: true,
  generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  geo_mode,
  location_name: String(location_name).trim(),
  language_code,
  seeds,                 // ✅ NEW: persist seeds for Step 4.5 + resume
  seedCount: seeds.length,
  source,
  resultCount: parsed.length,
  apiCost,
});




    return res.status(200).json({
      ok: true,
      generationLocked: true,
      source: "newly_generated",
      storedCount: allKeywords.length,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Unhandled server error",
      message: e?.message || String(e),
    });
  }
}
