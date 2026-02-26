// api/seo/strategy/generateKeywordPool.js

const firebaseAdminModule = require("../../firebaseAdmin");
// Support both export styles: module.exports = admin  OR  exports.default = admin  OR  exports.admin = admin
const admin =
  firebaseAdminModule?.default ||
  firebaseAdminModule?.admin ||
  firebaseAdminModule;
const { safeJsonParse } = require("../../_lib/seoKeywordIntelligence");
const https = require("https");
const { URL } = require("url");





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
// -------------------- DOMAIN PURITY (AI HARD FILTER) --------------------

// Split array into chunks of size n
function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function requireOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
  return apiKey;
}
function withTimeout(promise, ms, label = "Operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}
function postJson(urlStr, headers, bodyObj, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);

    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: u.pathname + (u.search || ""),
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          // Try JSON parse; if fails, return raw text too
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (_) {}

          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: parsed,
            text: data,
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`POST ${u.hostname} timed out after ${timeoutMs}ms`));
    });

    req.write(body);
    req.end();
  });
}
async function callOpenAIJson({ system, user, model = "gpt-4o-mini", temperature = 0 }) {
  const apiKey = requireOpenAIKey();

  const resp = await postJson(
    "https://api.openai.com/v1/chat/completions",
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    {
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    45000
  );

  if (!resp.ok) {
    const msg =
      resp.json?.error?.message ||
      resp.text?.slice(0, 300) ||
      "OpenAI request failed.";
    throw new Error(msg);
  }

  const json = resp.json;
  return json?.choices?.[0]?.message?.content || "";
}

async function domainPurityHardFilterBatched({ businessProfileSummary, seedKeywords, keywords, batchSize = 250 }) {
  const keepSet = new Set();
  const maybeSet = new Set();

  for (let i = 0; i < keywords.length; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);

    const system = `
You are a senior SEO strategist and commercial intent analyst.

You will classify keywords into 3 buckets:
- KEEP: strongly aligned with the core paid service in the Business Profile (rehab/rehabilitation, de-addiction, detox, addiction treatment, recovery program, inpatient/outpatient rehab, luxury rehab, location variants, “best/near me/cost/fees”, etc). Do NOT require the word centre/center.
- MAYBE: belongs to the same domain but is informational or research intent (what/how/why/where/symptoms/meaning/guide) OR softer intent.
- DROP: clearly irrelevant / different industry / bars, pubs, shopping centres, salons, nightlife, random places, etc.

Rules:
- Do NOT require exact seed word matches. Allow synonyms and close variants.
- Location modifiers are valid.
- If unclear but still plausibly in-domain, put in MAYBE (not DROP).
- Output MUST be valid JSON with keys: keep, maybe, drop.
- Each array must contain only keywords from the provided list.
`.trim();

    const user = `
Business Profile:
${businessProfileSummary}

Seed Keywords:
${(seedKeywords || []).join(", ")}

Keywords to classify:
${batch.join("\n")}
`.trim();

      const content = await callOpenAIJson({ system, user });
    const raw = safeJsonParse(content);

    const keep = Array.isArray(raw?.keep) ? raw.keep : [];
    const maybe = Array.isArray(raw?.maybe) ? raw.maybe : [];

    // SAFETY: if the model returns empty/invalid buckets, do NOT drop the whole batch.
    // Put the entire batch into MAYBE so we can still keep in-domain terms.
    if (keep.length === 0 && maybe.length === 0) {
      for (const k of batch) {
        const norm = String(k || "").trim().toLowerCase();
        if (norm) maybeSet.add(norm);
      }
      continue;
    }

    for (const k of keep) keepSet.add(String(k).trim().toLowerCase());
    for (const k of maybe) maybeSet.add(String(k).trim().toLowerCase());
  }

  return { keepSet, maybeSet };
}

// -------------------- MAIN HANDLER --------------------
module.exports = async function handler(req, res) {

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
// -------------------- LOAD BUSINESS PROFILE (for purity filter) --------------------
const businessProfileRef = db.doc(
  `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessProfile`
);

const businessProfileSnap = await businessProfileRef.get();
if (!businessProfileSnap.exists) {
  return res.status(400).json({
    error: "Missing businessProfile. Please complete Step 1 (Business Profile) first.",
  });
}
const businessProfile = businessProfileSnap.data() || {};
    // -------------------- BUSINESS PROFILE SUMMARY (compressed for OpenAI) --------------------
const bp = businessProfile || {};
const line = (v) => String(v || "").replace(/\s+/g, " ").trim();

const businessProfileSummary = [
  `Business Profile Summary: ${line(bp.businessName || bp.name || bp.title || "")}`,
  `Core Services: ${line(bp.coreServices || bp.services || bp.offering || bp.description || "")}`,
  `Audience/ICP: ${line(bp.audience || bp.icp || bp.targetCustomers || "")}`,
  `Includes/Excludes (only if stated): ${line(bp.includesExcludes || bp.scopeNotes || "")}`,
  `Seed Keywords: ${(Array.isArray(seeds) ? seeds : []).map((s) => String(s || "").trim()).filter(Boolean).join(", ")}`,
  `Geo Context: mode=${geo_mode}, location=${String(location_name).trim()}, language=${language_code}`,
].filter((x) => !x.endsWith(":")).join("\n");


// -------------------- DATAFORSEO CALL --------------------
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    const auth = Buffer.from(`${login}:${password}`).toString("base64");

    // Helper: call DataForSEO and return { items, cost }
    async function callDataForSeoLive(endpoint, payloadArray) {
      const r = await postJson(
        endpoint,
        {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        payloadArray,
        45000
      );

      const json = r.json;
      if (!json) {
        return { error: "DataForSEO non-JSON response", rawText: r.text?.slice(0, 300) || null };
      }

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

      // 2) Keyword Suggestions (phrase-expansion long-tail; includes seed keyword)
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

// -------------------- DOMAIN PURITY HARD FILTER (AI) --------------------
const rawCount = parsed.length;

let keptParsed = parsed;

// IMPORTANT:
// - keepSet = strict + best match (for Top 200)
// - maybeSet = relevant but less strict (allowed in All Keywords, not Top 200)
let keepSet = new Set();
let maybeSet = new Set();

try {
  const keywordStrings = parsed
    .map((x) => (x?.keyword || "").toString().trim())
    .filter(Boolean);

const result = await domainPurityHardFilterBatched({
  keywords: keywordStrings,
  businessProfileSummary: businessProfileSummary, // ✅ key matches function
  seedKeywords: seeds,
  geo_mode,
  location_name: String(location_name || "").trim(),
  language_code,
  batchSize: 60,
});

  // Support both return styles:
  // - old style: returns Set
  // - new style: returns { keepSet, maybeSet }
  if (result instanceof Set) {
    keepSet = result;
    maybeSet = new Set();
  } else {
    keepSet = result?.keepSet instanceof Set ? result.keepSet : new Set();
    maybeSet = result?.maybeSet instanceof Set ? result.maybeSet : new Set();
  }

  const strictParsed = parsed.filter((x) => {
    const k = (x?.keyword || "").toString().trim().toLowerCase();
    return k && keepSet.has(k);
  });

  const maybeParsed = parsed.filter((x) => {
    const k = (x?.keyword || "").toString().trim().toLowerCase();
    return k && !keepSet.has(k) && maybeSet.has(k);
  });

  // For storage:
  // - strict first (best quality)
  // - then maybe (still relevant, but not top-tier)
  keptParsed = strictParsed.concat(maybeParsed);

  // Top 200 should be ONLY strict
  var topKeywordsStrict = strictParsed.slice(0, 200);

} catch (e) {
  return res.status(500).json({
    error: "Domain purity filtering failed.",
    message: e.message || String(e),
  });
}

const keptCount = keptParsed.length;
const droppedCount = rawCount - keptCount;

// Preserve existing behavior: keep order, then slice for storage size
const allKeywords = source === "labs" ? keptParsed.slice(0, 1500) : keptParsed.slice(0, 500);

// TOP 200 = strict only
const topKeywords = (typeof topKeywordsStrict !== "undefined" && topKeywordsStrict)
  ? topKeywordsStrict
  : keptParsed.slice(0, 200);



    // -------------------- STORE --------------------
await keywordPoolRef.set({
  allKeywords,
  topKeywords,
  generationLocked: true,
  generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  geo_mode,
  location_name: String(location_name).trim(),
  language_code,
  seeds,
  seedCount: seeds.length,
  source,
  rawCount,
  keptCount,
  droppedCount,
  resultCount: keptCount,
  apiCost,

  // ---------------- DEBUG (temporary) ----------------
  debug_rawKeywords: parsed
    .map((x) => String(x?.keyword || "").trim())
    .filter(Boolean),

  debug_droppedKeywords: parsed
    .map((x) => String(x?.keyword || "").trim())
    .filter(Boolean)
    .filter((k) => !keepSet.has(k.toLowerCase()) && !maybeSet.has(k.toLowerCase())),
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

