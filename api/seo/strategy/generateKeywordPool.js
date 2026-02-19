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

    // Helper: call DataForSEO and return { items, cost }
    async function callDataForSeoLive(endpoint, payloadArray) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadArray),
      });

      const json = await r.json();

      if (json?.status_code !== 20000) {
        return { error: "DataForSEO error", raw: json };
      }

      const task = json?.tasks?.[0];
      if (!task || task.status_code !== 20000) {
        const status_message =
          task?.status_message ||
          json?.status_message ||
          "DataForSEO task error";

        return {
          error: "DataForSEO task error",
          status_code: task?.status_code ?? json?.status_code ?? null,
          status_message,
          raw: json,
        };
      }

      // If location_name is invalid/unresolvable, DataForSEO often returns empty/no result payload.
      if (!Array.isArray(task?.result) || task.result.length === 0) {
        return {
          error: "Invalid or unresolvable location_name",
          location_name: String(location_name).trim(),
          geo_mode,
          raw: json,
        };
      }

      const cost = task?.cost ?? null;

      // Standardize items extraction across endpoints
      const resultsRaw = Array.isArray(task.result) ? task.result : [];
      const items =
        Array.isArray(resultsRaw?.[0]?.items)
          ? resultsRaw[0].items
          : resultsRaw;

      return { items, cost };
    }

    let items = [];
    let source = null;
    let apiCost = null;

    if (geo_mode === "country") {
      source = "labs";

      // 1) Keyword Ideas (relevance first, then volume)
      const ideasEndpoint =
        "https://api.dataforseo.com/v3/dataforseo_labs/keyword_ideas/live";

      const ideasPayload = [
        {
          location_name: String(location_name).trim(),
          language_code,
          keywords: seeds,
          limit: 1000,
          offset: 0,
          order_by: ["relevance,desc", "keyword_info.search_volume,desc"],
          include_serp_info: false,
          closely_variants: false,
        },
      ];

      const ideasResp = await callDataForSeoLive(ideasEndpoint, ideasPayload);

      if (ideasResp?.error) {
        // Explicit STOP — do not fallback, do not save anything
        return res.status(400).json({
          error: ideasResp.error,
          status_code: ideasResp.status_code ?? null,
          status_message: ideasResp.status_message ?? null,
          geo_mode,
          location_name: String(location_name).trim(),
          source,
          raw: ideasResp.raw ?? null,
        });
      }

      // 2) Keyword Suggestions (long-tail, split across seeds to avoid huge cost)
      const suggestionsEndpoint =
        "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live";

      const cleanSeeds = Array.isArray(seeds) ? seeds.filter(Boolean) : [];
      const seedCount = cleanSeeds.length || 1;

      // Total cap ~500 suggestions, distributed across seeds
      const limitPerSeed = Math.max(1, Math.floor(500 / seedCount));

      const suggestionCalls = cleanSeeds.map((seedKw) => {
        const suggestionsPayload = [
          {
            keyword: String(seedKw).trim(),
            location_name: String(location_name).trim(),
            language_code,
            limit: limitPerSeed,
            offset: 0,
            include_serp_info: false,
          },
        ];
        return callDataForSeoLive(suggestionsEndpoint, suggestionsPayload);
      });

      const suggestionsResps = await Promise.all(suggestionCalls);

      // If any suggestion call errors, STOP (no partial saves)
      const bad = suggestionsResps.find((x) => x?.error);
      if (bad) {
        return res.status(400).json({
          error: bad.error,
          status_code: bad.status_code ?? null,
          status_message: bad.status_message ?? null,
          geo_mode,
          location_name: String(location_name).trim(),
          source,
          raw: bad.raw ?? null,
        });
      }

      // Merge + dedupe by keyword string (case-insensitive)
      const allItems = []
        .concat(Array.isArray(ideasResp.items) ? ideasResp.items : [])
        .concat(
          suggestionsResps.flatMap((x) =>
            Array.isArray(x?.items) ? x.items : []
          )
        );

      const seen = new Set();
      const merged = [];

      for (const it of allItems) {
        const k = (it?.keyword || "").toString().trim().toLowerCase();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(it);
      }

      items = merged;

      // Track combined cost
      const ideasCost = ideasResp?.cost ? Number(ideasResp.cost) : 0;
      const suggCost = suggestionsResps.reduce(
        (sum, x) => sum + (x?.cost ? Number(x.cost) : 0),
        0
      );
      apiCost = ideasCost + suggCost;
    } else {
      // Use Google Ads endpoint for local targeting
      source = "google_ads";

      const endpoint =
        "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live";

      const payload = [
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

      const adsResp = await callDataForSeoLive(endpoint, payload);

      if (adsResp?.error) {
        // Explicit STOP — do not fallback, do not save anything
        return res.status(400).json({
          error: adsResp.error,
          status_code: adsResp.status_code ?? null,
          status_message: adsResp.status_message ?? null,
          geo_mode,
          location_name: String(location_name).trim(),
          source,
          raw: adsResp.raw ?? null,
        });
      }

      items = Array.isArray(adsResp.items) ? adsResp.items : [];
      apiCost = adsResp?.cost ?? null;
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



// -------------------- SORT / CAP --------------------
    // IMPORTANT:
    // - For country mode (labs), DataForSEO Keyword Ideas is already relevance-sorted.
    //   So we keep the returned order to preserve relevance.
    // - For local mode (google_ads), we sort by volume (as before).

    if (source !== "labs") {
      parsed.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }

    const allKeywords = source === "labs" ? parsed.slice(0, 1500) : parsed.slice(0, 500);
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
