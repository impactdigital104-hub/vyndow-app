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

  // TEMP TEST MODE - bypass auth
const uid = "iiwQlPX1gaHMzit3BrIa";


// TEMP TEST MODE (will remove after verification)
const websiteId = "iiwQlPX1gaHMzit3BrIa";
const seeds = ["plumbing services"];
const location_code = 2840;
const language_code = "en";


    if (!Array.isArray(seeds) || seeds.length === 0) {
      return res.status(400).json({ error: "Missing seeds[]" });
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

    const endpoint =
      "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live";

    const payload = [
      {
        location_code,
        language_code,
        keywords: seeds,
        include_adult_keywords: false,
        sort_by: "relevance",
      },
    ];

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
      return res.status(500).json({
        error: "DataForSEO task error",
        raw: json,
      });
    }

    const results = Array.isArray(task.result) ? task.result : [];

    const parsed = results.map((item) => ({
      keyword: item?.keyword ?? null,
      volume: item?.search_volume ?? null,
      competition: item?.competition ?? null,
      competition_index: item?.competition_index ?? null,
      cpc: item?.cpc ?? null,
      location_code,
      language_code,
    }));

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
      location_code,
      language_code,
      seedCount: seeds.length,
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
