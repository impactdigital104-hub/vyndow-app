// api/seo/strategy/generateKeywordMapping.js
//
// STEP 6 — Keyword-to-URL Mapping & Deployment Blueprint Engine
//
// HARD RULE: refuse unless keywordClustering.approved === true
// HARD RULE: refuse unless keywordClustering.finalVersion exists
// HARD RULE: no regen if keywordMapping doc already exists (must delete doc manually)
//
// Reads:
// - strategy/keywordClustering.finalVersion (pillars/shortlist etc.)
// - strategy/auditResults/urls/* (url,title,h1,h2List)
// - strategy/businessContext (reference only)
//
// Writes Firestore doc: strategy/keywordMapping

import admin from "../../firebaseAdmin";
import { embedTexts, cosineSimilarity, clamp01 } from "../../_lib/seoKeywordIntelligence";

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

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function safeKey(s) {
  return String(s || "").trim().toLowerCase();
}

function buildPageText({ title, h1, h2List }) {
  const t = String(title || "").trim();
  const h = String(h1 || "").trim();
  const h2 = Array.isArray(h2List) ? h2List.map((x) => String(x || "").trim()).filter(Boolean) : [];
  return [t, h, ...h2].filter(Boolean).join(" | ");
}

function median(nums) {
  const a = (nums || []).map((x) => Number(x)).filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function classifyConfidence(sim) {
  const s = Number(sim || 0);
  if (s >= 0.85) return "Strong Match";
  if (s >= 0.75) return "Moderate Match";
  return "No Match";
}

function isGeoModifiedKeyword(keyword, locationName) {
  const k = safeKey(keyword);
  const loc = safeKey(locationName);
  if (loc && k.includes(loc)) return true;
  // Simple geo modifiers (best-effort, no force-fitting)
  return /\b(near me|nearby|in\s+[a-z]|at\s+[a-z]|within\s+[0-9]+)\b/.test(k);
}

function titleCaseFromKeyword(keyword) {
  const words = String(keyword || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  return words
    .map((w) => {
      const s = w.toLowerCase();
      // keep small words lower unless first
      const small = new Set(["and", "or", "the", "a", "an", "to", "for", "in", "of", "on", "with", "near"]);
      if (small.has(s)) return s;
      return s.charAt(0).toUpperCase() + s.slice(1);
    })
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

function slugify(keyword) {
  const stop = new Set([
    "the","a","an","and","or","to","for","in","of","on","with","near","best","top"
  ]);
  const raw = safeKey(keyword)
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = raw.split(" ").filter((p) => p && !stop.has(p));
  const slug = parts.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `/${slug || "page"}/`;
}

function getPathSlug(url) {
  try {
    const u = new URL(String(url));
    const p = u.pathname || "/";
    // normalize to trailing slash
    return p.endsWith("/") ? p : `${p}/`;
  } catch {
    return null;
  }
}

function choosePageType({ intent, geoModified }) {
  const i = safeKey(intent);
  if (geoModified) return "Location Page";
  if (i === "transactional") return "Core Service Page";
  if (i === "commercial") return "Service / Comparison Page";
  if (i === "informational") return "Supporting Blog";
  return "Supporting Blog";
}

function recommendedWordCount(pageType) {
  switch (pageType) {
    case "Core Service Page":
      return 1500;
    case "Service / Comparison Page":
      return 1500;
    case "Location Page":
      return 1200;
    case "Pillar Guide":
      return 2500;
    case "Supporting Blog":
    default:
      return 1500;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
    const db = admin.firestore();

    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );

    const auditUrlsRef = db.collection(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/auditResults/urls`
    );

    const businessContextRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessContext`
    );

    const keywordMappingRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordMapping`
    );

    // -------------------- LOCK (no regen unless doc deleted) --------------------
    const existingKM = await keywordMappingRef.get();
    if (existingKM.exists) {
      return res.status(200).json({
        ok: true,
        generationLocked: true,
        source: "existing",
        data: existingKM.data(),
      });
    }

    // -------------------- INPUT CHECKS --------------------
    const kcSnap = await keywordClusteringRef.get();
    if (!kcSnap.exists) {
      return res.status(400).json({
        error: "Missing keywordClustering. Please complete Step 5 first.",
      });
    }

    const kc = kcSnap.data() || {};
    if (kc?.approved !== true) {
      return res.status(400).json({
        error: "Step 6 blocked: keywordClustering is not approved yet. Please approve Step 5 first.",
      });
    }

    const finalVersion = kc?.finalVersion;
    if (!finalVersion || typeof finalVersion !== "object") {
      return res.status(400).json({
        error: "Step 6 blocked: keywordClustering.finalVersion missing. Please approve Step 5 properly.",
      });
    }

    const shortlist = Array.isArray(finalVersion?.shortlist) ? finalVersion.shortlist : [];
    if (!shortlist.length) {
      return res.status(400).json({
        error: "keywordClustering.finalVersion.shortlist is empty.",
      });
    }

    const auditSnap = await auditUrlsRef.get();
    const auditDocs = auditSnap.docs || [];
    if (!auditDocs.length) {
      return res.status(400).json({
        error: "Missing auditResults. Please complete Step 3 (URL audit) first.",
      });
    }

    const bcSnap = await businessContextRef.get();
    const businessContext = bcSnap.exists ? (bcSnap.data() || {}) : {};
    const locationName = kc?.location_name || businessContext?.location_name || "";

    // -------------------- PHASE 1: Page embeddings (Title + H1 + H2) --------------------
    const pages = auditDocs
      .map((d) => d.data() || {})
      .map((p) => ({
        url: String(p.url || "").trim(),
        title: p.title || "",
        h1: p.h1 || "",
        h2List: Array.isArray(p.h2List) ? p.h2List : [],
      }))
      .filter((p) => Boolean(p.url));

    const pageTexts = pages.map((p) => buildPageText(p));
    const pageEmbeddings = await embedTexts(pageTexts);

    // collect existing slugs to avoid duplication for gap pages
    const existingSlugs = new Set(
      pages.map((p) => getPathSlug(p.url)).filter(Boolean)
    );

    // -------------------- PHASE 2: Keyword embeddings + similarity to ALL pages --------------------
    const keywords = shortlist
      .map((k) => ({
        keyword: String(k.keyword || "").trim(),
        intent: k.intent || "other",
        strategyScore: Number(k.strategyScore || 0),
        businessFitScore: Number(k.businessFitScore || 0),
        pillarId: k.pillarId || null,
        pillarName: k.pillarName || null,
        clusterId: k.clusterId || null,
        clusterName: k.clusterName || null,
      }))
      .filter((k) => Boolean(k.keyword));

    const keywordStrings = keywords.map((k) => k.keyword);
    const keywordEmbeddings = await embedTexts(keywordStrings);

    // For each keyword, compute best match and also keep all sims for internal-linking logic
    const perKeyword = [];
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const vec = keywordEmbeddings[i];

      let bestIdx = -1;
      let bestSim = -Infinity;

      const sims = [];
for (let j = 0; j < pageEmbeddings.length; j++) {
  const cos = cosineSimilarity(vec, pageEmbeddings[j]); // -1..+1
  const sim01 = clamp01((Number(cos) + 1) / 2);          // 0..1

  sims.push({ pageIdx: j, sim: sim01 });

  if (sim01 > bestSim) {
    bestSim = sim01;
    bestIdx = j;
  }
}


      const confidence = classifyConfidence(bestSim);
      const bestPage = bestIdx >= 0 ? pages[bestIdx] : null;

      perKeyword.push({
        ...kw,
        bestMatchUrl: bestPage ? bestPage.url : null,
        bestSimilarity: Number(bestSim),
        confidence,
        sims, // for internal linking opportunities
      });
    }

    // -------------------- PHASE 3: Confidence classification + eligibility --------------------
    const eligible = perKeyword.filter((k) => Number(k.bestSimilarity) >= 0.75 && k.bestMatchUrl);
    const noMatch = perKeyword.filter((k) => Number(k.bestSimilarity) < 0.75);

    // -------------------- PHASE 4: Primary keyword assignment (unique across pages) --------------------
    // group eligible by bestMatchUrl
    const byUrl = new Map();
    for (const k of eligible) {
      const url = k.bestMatchUrl;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push(k);
    }

    // choose primary per page: highest strategyScore
    const usedPrimary = new Set();
    const existingPages = [];

    for (const p of pages) {
      const mapped = byUrl.get(p.url) || [];
      mapped.sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0));

      let primary = null;
      for (const cand of mapped) {
        const key = safeKey(cand.keyword);
        if (!usedPrimary.has(key)) {
          primary = cand;
          usedPrimary.add(key);
          break;
        }
      }

      // -------------------- PHASE 5: Secondary keyword assignment (max 5, no force fitting) --------------------
      const remaining = mapped
        .filter((k) => !primary || safeKey(k.keyword) !== safeKey(primary.keyword))
        .filter((k) => Number(k.bestSimilarity) >= 0.75);

      remaining.sort((a, b) => {
        const sa = (a.bestSimilarity || 0) * (a.strategyScore || 0);
        const sb = (b.bestSimilarity || 0) * (b.strategyScore || 0);
        return sb - sa;
      });

      const secondary = remaining.slice(0, 5).map((k) => ({
        keyword: k.keyword,
        similarity: Number(k.bestSimilarity),
        strategyScore: Number(k.strategyScore || 0),
      }));

      // -------------------- INTERNAL LINKING OPPORTUNITIES --------------------
      // If a keyword is strong for this page but moderate for others, store moderate targets.
      const internalTargets = new Set();
      if (primary && Number(primary.bestSimilarity) >= 0.85) {
        const sortedSims = (primary.sims || []).slice().sort((a, b) => b.sim - a.sim);
        for (const s of sortedSims) {
          const url = pages[s.pageIdx]?.url;
          if (!url) continue;
          if (url === p.url) continue;
          if (s.sim >= 0.75 && s.sim < 0.85) internalTargets.add(url);
        }
      }

     const confPct = primary ? clamp01(Number(primary.bestSimilarity)) : 0;
      existingPages.push({
        url: p.url,
        primaryKeyword: primary
          ? { keyword: primary.keyword, similarity: Number(primary.bestSimilarity), strategyScore: Number(primary.strategyScore || 0) }
          : null,
        secondaryKeywords: secondary,
        pillar: primary?.pillarName || null,
        cluster: primary?.clusterName || null,
        mappingConfidence: primary ? Math.round(confPct * 100) : 0,
        internalLinkTargets: Array.from(internalTargets),
      });
    }

    // -------------------- PHASE 6: Gap page evaluation --------------------
    const medianStrategy = median(keywords.map((k) => k.strategyScore || 0));

    // Build cluster map for "same cluster" secondary suggestion
    const clusterToKeywords = new Map(); // key = pillarId::clusterId
    for (const k of keywords) {
      const key = `${k.pillarId || "na"}::${k.clusterId || "na"}`;
      if (!clusterToKeywords.has(key)) clusterToKeywords.set(key, []);
      clusterToKeywords.get(key).push(k);
    }
    for (const [key, arr] of clusterToKeywords.entries()) {
      arr.sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0));
      clusterToKeywords.set(key, arr);
    }

    const gapPages = [];

    for (const k of noMatch) {
      const strongByScore = Number(k.strategyScore || 0) > Number(medianStrategy || 0);
      const strongFit = Number(k.businessFitScore || 0) >= 0.6;
      const meaningfulIntent = !["other", ""].includes(safeKey(k.intent));

      if (!(strongByScore && strongFit && meaningfulIntent)) {
        // allowed to remain unassigned (rare but allowed)
        continue;
      }

      const geoModified = isGeoModifiedKeyword(k.keyword, locationName);

      // page type rules
      let pageType = choosePageType({ intent: k.intent, geoModified });

      // Informational broad vs specific (best-effort heuristic)
      if (safeKey(k.intent) === "informational") {
        const wCount = String(k.keyword).trim().split(/\s+/).filter(Boolean).length;
        pageType = wCount <= 3 ? "Pillar Guide" : "Supporting Blog";
      }

      const baseSlug = slugify(k.keyword);
      let finalSlug = baseSlug;

      // avoid duplication with existing URLs
      if (existingSlugs.has(finalSlug)) {
        // try a safe suffix
        const suffixed = finalSlug.replace(/\/$/, "-guide/");
        finalSlug = existingSlugs.has(suffixed) ? finalSlug.replace(/\/$/, "-page/") : suffixed;
      }

      const key = `${k.pillarId || "na"}::${k.clusterId || "na"}`;
      const pool = (clusterToKeywords.get(key) || []).filter(
        (x) => safeKey(x.keyword) !== safeKey(k.keyword)
      );

      const secondaryKeywords = pool
        .slice(0, 20)
        .filter((x) => Number(x.businessFitScore || 0) >= 0.5)
        .slice(0, 5)
        .map((x) => x.keyword);

      gapPages.push({
        suggestedTitle: titleCaseFromKeyword(k.keyword),
        suggestedSlug: finalSlug,
        pageType,
        primaryKeyword: k.keyword,
        secondaryKeywords,
        pillar: k.pillarName || null,
        recommendedWordCount: recommendedWordCount(pageType),
        rationale: `No existing page matched with ≥0.75 similarity. StrategyScore ${Number(k.strategyScore || 0).toFixed(
          2
        )} is above median and businessFitScore is strong.`,
      });
    }

    // -------------------- DEPLOYMENT STATS --------------------
    const totalShortlisted = keywords.length;
    const mappedToExisting = existingPages.filter((p) => p.primaryKeyword && p.primaryKeyword.keyword).length;
    const suggestedNewPages = gapPages.length;
    const coveragePercentage = totalShortlisted
      ? Math.round(((mappedToExisting + suggestedNewPages) / totalShortlisted) * 100)
      : 0;

    const doc = {
      existingPages,
      gapPages,
      deploymentStats: {
        totalShortlisted,
        mappedToExisting,
        suggestedNewPages,
        coveragePercentage,
      },
      approved: false,
      approvedAt: null,
      generatedAt: nowTs(),
      // optional (UI can use these later if needed)
      meta: {
        thresholds: { strong: 0.85, moderate: 0.75 },
        medianStrategyScore: Number(medianStrategy || 0),
      },
    };

    await keywordMappingRef.set(doc);

    return res.status(200).json({
      ok: true,
      generationLocked: false,
      data: doc,
    });
  } catch (e) {
    console.error("generateKeywordMapping error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
