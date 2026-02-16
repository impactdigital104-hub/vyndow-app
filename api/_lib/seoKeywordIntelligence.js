// api/_lib/seoKeywordIntelligence.js
//
// STEP 5 — Intelligent Keyword Filtering, Scoring, Clustering & Pillar Engine
// Helper utilities ONLY (no Firestore writes here).
//
// IMPORTANT:
// - Do NOT import this from GEO or blog generator.
// - Keep this file dependency-free (no npm libs).
// - Uses OpenAI for embeddings + batch LLM calls.

// -------------------- OPENAI (Embeddings) --------------------

const EMBEDDING_MODEL = "text-embedding-3-small";

function requireOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
  return apiKey;
}

async function openaiEmbeddings({ texts }) {
  const apiKey = requireOpenAIKey();

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI embeddings request failed.");
  }

  const data = Array.isArray(json?.data) ? json.data : [];
  return data.map((d) => d.embedding);
}

export async function embedTexts(texts, { batchSize = 96 } = {}) {
  // OpenAI embeddings rejects empty strings. Ensure every item is non-empty.
  const clean = (texts || []).map((t) => {
    const s = String(t ?? "").trim();
    return s.length ? s : " "; // safe non-empty placeholder
  });

  if (!clean.length) return [];

  const out = [];

  for (let i = 0; i < clean.length; i += batchSize) {
    const chunk = clean.slice(i, i + batchSize);
    const vectors = await openaiEmbeddings({ texts: chunk });
    out.push(...vectors);
  }

  return out;
}


// -------------------- MATH --------------------

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!denom) return 0;
  return dot / denom;
}

export function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function minMaxNormalize(values) {
  const arr = (values || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return arr.map(() => 0);
  }
  return arr.map((v) => (v - min) / (max - min));
}

// -------------------- SCORING --------------------

export function intentToWeight(intent) {
  const k = String(intent || "").toLowerCase();
  if (k === "transactional") return 1.0;
  if (k === "commercial") return 0.8;
  if (k === "informational") return 0.6;
  if (k === "navigational") return 0.4;
  return 0.5; // other
}

export function geoModeWeights(geoMode) {
  const gm = String(geoMode || "").toLowerCase();
  if (gm === "local") {
    return {
      volume: 0.2,
      fit: 0.35,
      intent: 0.25,
      commercial: 0.2,
    };
  }
  // default to country weights
  return {
    volume: 0.35,
    fit: 0.3,
    intent: 0.2,
    commercial: 0.15,
  };
}

export function computeStrategyScore({
  geoMode,
  normalizedVolume,
  businessFitScore,
  intent,
  normalizedCommercialSignal,
}) {
  const w = geoModeWeights(geoMode);
  const iw = intentToWeight(intent);

  const score =
    w.volume * clamp01(normalizedVolume) +
    w.fit * clamp01(businessFitScore) +
    w.intent * clamp01(iw) +
    w.commercial * clamp01(normalizedCommercialSignal);

  return clamp01(score);
}

// -------------------- SIMPLE K-MEANS (COSINE) --------------------

function pickRandomIndices(n, k) {
  const idx = Array.from({ length: n }, (_, i) => i);
  // Fisher-Yates shuffle partial
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

function meanVector(vectors, indices) {
  if (!indices.length) return null;
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const ix of indices) {
    const v = vectors[ix];
    for (let d = 0; d < dim; d++) out[d] += v[d] || 0;
  }
  const inv = 1 / indices.length;
  for (let d = 0; d < dim; d++) out[d] *= inv;
  return out;
}

function assignClusters(vectors, centroids) {
  const k = centroids.length;
  const assignments = new Array(vectors.length).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    let best = 0;
    let bestSim = -Infinity;
    for (let c = 0; c < k; c++) {
      const sim = cosineSimilarity(vectors[i], centroids[c]);
      if (sim > bestSim) {
        bestSim = sim;
        best = c;
      }
    }
    assignments[i] = best;
  }
  return assignments;
}

function recomputeCentroids(vectors, assignments, k) {
  const groups = Array.from({ length: k }, () => []);
  for (let i = 0; i < assignments.length; i++) {
    groups[assignments[i]].push(i);
  }
  return groups.map((g) => meanVector(vectors, g) || vectors[Math.floor(Math.random() * vectors.length)]);
}

function clusteringQuality(vectors, assignments, centroids) {
  // Simple quality metric: average similarity to own centroid
  let sum = 0;
  for (let i = 0; i < vectors.length; i++) {
    sum += cosineSimilarity(vectors[i], centroids[assignments[i]]);
  }
  return sum / Math.max(1, vectors.length);
}

export function kMeansCosine(vectors, k, { maxIters = 20 } = {}) {
  if (!vectors?.length) return { assignments: [], centroids: [] };
  if (k <= 1) return { assignments: new Array(vectors.length).fill(0), centroids: [meanVector(vectors, vectors.map((_, i) => i))] };

  const seeds = pickRandomIndices(vectors.length, k);
  let centroids = seeds.map((ix) => vectors[ix]);
  let assignments = assignClusters(vectors, centroids);

  for (let iter = 0; iter < maxIters; iter++) {
    const nextCentroids = recomputeCentroids(vectors, assignments, k);
    const nextAssignments = assignClusters(vectors, nextCentroids);

    let changed = 0;
    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== nextAssignments[i]) changed++;
    }

    centroids = nextCentroids;
    assignments = nextAssignments;
    if (changed === 0) break;
  }

  return { assignments, centroids, quality: clusteringQuality(vectors, assignments, centroids) };
}

export function autoClusterEmbeddings(vectors, { minK = 3, maxK = 6, retries = 3 } = {}) {
  const n = vectors?.length || 0;
  if (n === 0) return { k: 0, assignments: [], centroids: [] };

  // If too few points, reduce k.
  const upper = Math.min(maxK, Math.max(1, Math.floor(n / 6)));
  const lower = Math.min(minK, upper);

  let best = null;
  for (let k = lower; k <= upper; k++) {
    for (let r = 0; r < retries; r++) {
      const run = kMeansCosine(vectors, k);
      if (!best || (run.quality || 0) > (best.quality || 0)) {
        best = { ...run, k };
      }
    }
  }

  return best || { k: 1, assignments: new Array(n).fill(0), centroids: [] };
}

// -------------------- OPENAI (Batch LLM helpers) --------------------

async function callOpenAIChat({ system, user, temperature = 0.2, model = "gpt-4o" }) {
  const apiKey = requireOpenAIKey();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI chat request failed.");
  }
  return json?.choices?.[0]?.message?.content || "";
}

export function safeJsonParse(str) {
  const raw = String(str || "").trim();
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(stripped);
}

export async function classifyIntentBatch({ keywords, businessSummaryText }) {
  const list = (keywords || []).map((k) => String(k || "").trim()).filter(Boolean);
  if (!list.length) return {};

  const system =
    "You classify SEO keywords by user intent. Return STRICT JSON only (no markdown).";

  const user = `
Business summary (context):\n${businessSummaryText}\n\n
Classify EACH keyword into one of: informational, commercial, transactional, navigational, other.
Return STRICT JSON with this shape:
{
  "items": [
    {"keyword":"...","intent":"informational|commercial|transactional|navigational|other"}
  ]
}
Keywords:\n${list.map((k) => `- ${k}`).join("\n")}
`;

  const content = await callOpenAIChat({ system, user, temperature: 0.1 });
  const parsed = safeJsonParse(content);
  const out = {};
  for (const it of parsed?.items || []) {
    const kw = String(it?.keyword || "").trim();
    const intent = String(it?.intent || "other").toLowerCase();
    if (kw) out[kw.toLowerCase()] = intent;
  }
  return out;
}

export async function labelPillarsAndClusters({
  businessContext,
  geoMode,
  locationName,
  pillars,
}) {
  const system =
    "You are an SEO strategist. You will name pillars and clusters as STRATEGIC THEMES (not keyword phrases). Return STRICT JSON only.";

  const user = `
Business context (AI version):\n${JSON.stringify(
    {
      primary_services: businessContext?.aiVersion?.primary_services || [],
      secondary_themes: businessContext?.aiVersion?.secondary_themes || [],
      positioning: businessContext?.aiVersion?.positioning || "",
      summaryText: businessContext?.finalVersion?.summaryText || businessContext?.aiVersion?.summaryText || "",
    },
    null,
    2
  )}\n\n
Geo mode: ${geoMode}\nLocation: ${locationName}\n\n
You will receive pillars with centroid keywords and clusters.
Return STRICT JSON:
{
  "pillars": [
    {
      "pillarId": "p1",
      "name": "3-6 words",
      "description": "one line",
      "clusters": [
        {"clusterId":"c1","name":"2-6 words"}
      ]
    }
  ]
}
Pillars input:\n${JSON.stringify(pillars, null, 2)}
`;

  const content = await callOpenAIChat({ system, user, temperature: 0.2 });
  return safeJsonParse(content);
}
