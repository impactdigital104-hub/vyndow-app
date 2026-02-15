// api/seo/strategy/generateKeywordClustering.js
//
// STEP 5 — Phase 1→6
// Generates: filtered keywords → intent → scoring → shortlist → pillars → labeling
// Writes Firestore doc: strategy/keywordClustering
//
// HARD RULE: refuse unless businessContext.approved === true
// HARD RULE: no regen if keywordClustering doc already exists (must delete doc manually)

import admin from "../../firebaseAdmin";
import {
  embedTexts,
  cosineSimilarity,
  clamp01,
  minMaxNormalize,
  computeStrategyScore,
  classifyIntentBatch,
  autoClusterEmbeddings,
  labelPillarsAndClusters,
} from "../../_lib/seoKeywordIntelligence";

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

function normCosTo01(cos) {
  // cosine can be [-1..1], convert to [0..1]
  return clamp01((Number(cos) + 1) / 2);
}

function pctThreshold(values01, dropFraction = 0.4) {
  // drop bottom 40% by default
  const arr = (values01 || []).slice().sort((a, b) => a - b);
  if (!arr.length) return 0;
  const ix = Math.floor(arr.length * dropFraction);
  return arr[Math.min(arr.length - 1, Math.max(0, ix))];
}

function safeKey(s) {
  return String(s || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } =
      await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();

    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );

    const businessContextRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessContext`
    );

    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );

    // -------------------- LOCK (no regen unless doc deleted) --------------------
    const existingKC = await keywordClusteringRef.get();
    if (existingKC.exists) {
      return res.status(200).json({
        ok: true,
        generationLocked: true,
        source: "existing",
        data: existingKC.data(),
      });
    }

    // -------------------- INPUT CHECKS --------------------
    const kpSnap = await keywordPoolRef.get();
    if (!kpSnap.exists) {
      return res.status(400).json({
        error: "Missing keywordPool. Please complete Step 4 first.",
      });
    }

    const bcSnap = await businessContextRef.get();
    if (!bcSnap.exists) {
      return res.status(400).json({
        error: "Missing businessContext. Please complete Step 4.5 first.",
      });
    }

    const businessContext = bcSnap.data() || {};
    if (businessContext?.approved !== true) {
      return res.status(400).json({
        error:
          "Step 5 blocked: businessContext is not approved yet. Please approve Step 4.5 first.",
      });
    }

    const keywordPool = kpSnap.data() || {};
    const allKeywords = Array.isArray(keywordPool?.allKeywords)
      ? keywordPool.allKeywords
      : [];

    if (!allKeywords.length) {
      return res.status(400).json({
        error: "keywordPool.allKeywords is empty.",
      });
    }

    const geoMode = keywordPool?.geo_mode || keywordPool?.geoMode || "country";
    const location_name = keywordPool?.location_name || "";
    const language_code = keywordPool?.language_code || "en";

    // Canonical business summary text (as per baton)
    const summaryText =
      businessContext?.finalVersion?.summaryText ||
      businessContext?.aiVersion?.summaryText ||
      businessContext?.summaryText ||
      "";

    if (!String(summaryText).trim()) {
      return res.status(400).json({
        error:
          "businessContext summaryText missing. Please regenerate/approve Step 4.5.",
      });
    }

    // -------------------- PHASE 1: Semantic relevance filtering (embeddings) --------------------
    const keywordStrings = allKeywords
      .map((k) => String(k?.keyword || "").trim())
      .filter(Boolean);

    // Embedding for business summary + keywords
    const [businessEmbedding] = await embedTexts([summaryText]);
    const keywordEmbeddings = await embedTexts(keywordStrings);

    const fitScores = keywordEmbeddings.map((vec) =>
      normCosTo01(cosineSimilarity(vec, businessEmbedding))
    );

    const threshold = pctThreshold(fitScores, 0.4); // drop bottom ~40%
    const kept = [];
    const excluded = [];

    for (let i = 0; i < allKeywords.length; i++) {
      const kwObj = allKeywords[i] || {};
      const kw = String(kwObj.keyword || "").trim();
      if (!kw) continue;

      const fit = fitScores[i] ?? 0;
      if (fit < threshold) {
        excluded.push({
          keyword: kw,
          reasonTags: ["low_business_fit"],
          businessFitScore: clamp01(fit),
        });
      } else {
        kept.push({
          ...kwObj,
          keyword: kw,
          businessFitScore: clamp01(fit),
        });
      }
    }

    // -------------------- PHASE 2: Intent classification (single batch) --------------------
    const keptKeywords = kept.map((k) => k.keyword);
    const intentMap = await classifyIntentBatch({
      keywords: keptKeywords,
      businessSummaryText: summaryText,
    });

    const withIntent = kept.map((k) => ({
      ...k,
      intent: intentMap[safeKey(k.keyword)] || "other",
    }));

    // -------------------- PHASE 3: Strategy score (geo_mode adaptive weights) --------------------
    const volumes = withIntent.map((k) => Number(k.volume || 0));
    const normVolumes = minMaxNormalize(volumes);

    // Commercial signal: prefer competition_index; fallback competition; fallback cpc
    const commercialRaw = withIntent.map((k) => {
      const ci = Number(k.competition_index);
      if (Number.isFinite(ci)) return ci;
      const c = Number(k.competition);
      if (Number.isFinite(c)) return c;
      const cpc = Number(k.cpc);
      if (Number.isFinite(cpc)) return cpc;
      return 0;
    });
    const normCommercial = minMaxNormalize(commercialRaw);

    const scored = withIntent.map((k, i) => {
      const strategyScore = computeStrategyScore({
        geoMode,
        normalizedVolume: normVolumes[i] ?? 0,
        businessFitScore: k.businessFitScore ?? 0,
        intent: k.intent,
        normalizedCommercialSignal: normCommercial[i] ?? 0,
      });

      return {
        keyword: k.keyword,
        volume: k.volume ?? null,
        cpc: k.cpc ?? null,
        competition: k.competition ?? null,
        competition_index: k.competition_index ?? null,
        intent: k.intent,
        businessFitScore: clamp01(k.businessFitScore ?? 0),
        strategyScore: clamp01(strategyScore),
        language_code,
      };
    });

    // -------------------- PHASE 4: Shortlist selection (90–110, target ~100) --------------------
    scored.sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0));

    const target = 100;
    const min = 90;
    const max = 110;

    let take = target;
    if (scored.length < min) take = scored.length;
    if (scored.length >= min && scored.length < target) take = scored.length;
    if (scored.length > max) take = max;

    const shortlist = scored.slice(0, take);

    // -------------------- PHASE 5: Pillar clustering (embeddings-driven, cap 6) --------------------
    const shortlistTexts = shortlist.map((k) => k.keyword);
    const shortlistEmbeddings = await embedTexts(shortlistTexts);

    // auto k (3–6 depending on density)
    const clustering = autoClusterEmbeddings(shortlistEmbeddings, {
      minK: 3,
      maxK: 6,
      retries: 3,
    });

    const k = clustering?.k || 1;
    const assignments = clustering?.assignments || new Array(shortlist.length).fill(0);

    // Build pillars with ONE cluster each (v1), to satisfy structure + stability
    const pillarsRaw = [];
    for (let pi = 0; pi < k; pi++) {
      const indices = [];
      for (let i = 0; i < assignments.length; i++) {
        if (assignments[i] === pi) indices.push(i);
      }
      const kws = indices.map((ix) => shortlist[ix]);

      // centroid keywords (top 8 by strategyScore within pillar)
      const centroidKeywords = kws
        .slice()
        .sort((a, b) => (b.strategyScore || 0) - (a.strategyScore || 0))
        .slice(0, 8)
        .map((x) => x.keyword);

      pillarsRaw.push({
        pillarId: `p${pi + 1}`,
        centroidKeywords,
        clusters: [
          {
            clusterId: `c${pi + 1}_1`,
            centroidKeywords,
            keywords: kws,
          },
        ],
      });
    }

    // -------------------- PHASE 6: Pillar + cluster labeling (LLM theme-driven) --------------------
    const labeled = await labelPillarsAndClusters({
      businessContext,
      geoMode,
      locationName: location_name,
      pillars: pillarsRaw.map((p) => ({
        pillarId: p.pillarId,
        centroidKeywords: p.centroidKeywords,
        clusters: p.clusters.map((c) => ({
          clusterId: c.clusterId,
          centroidKeywords: c.centroidKeywords,
        })),
      })),
    });

    const labelMapPillar = new Map();
    const labelMapCluster = new Map();
    for (const p of labeled?.pillars || []) {
      labelMapPillar.set(p.pillarId, {
        name: p.name,
        description: p.description,
      });
      for (const c of p?.clusters || []) {
        labelMapCluster.set(`${p.pillarId}::${c.clusterId}`, { name: c.name });
      }
    }

    const pillars = pillarsRaw.map((p) => {
      const pl = labelMapPillar.get(p.pillarId) || {};
      const clusters = p.clusters.map((c) => {
        const cl =
          labelMapCluster.get(`${p.pillarId}::${c.clusterId}`) || {};
        return {
          clusterId: c.clusterId,
          name: cl.name || "Cluster",
          keywords: c.keywords.map((kw) => ({
            ...kw,
            pillarId: p.pillarId,
            clusterId: c.clusterId,
          })),
        };
      });

      return {
        pillarId: p.pillarId,
        name: pl.name || "Pillar",
        description: pl.description || "",
        clusters,
      };
    });

    // Build shortlist view with pillar/cluster mapping
    const kwToPillarCluster = new Map();
    for (const p of pillars) {
      for (const c of p.clusters) {
        for (const kw of c.keywords) {
          kwToPillarCluster.set(safeKey(kw.keyword), {
            pillarId: p.pillarId,
            pillarName: p.name,
            clusterId: c.clusterId,
            clusterName: c.name,
          });
        }
      }
    }

    const shortlistWithMapping = shortlist.map((kw) => {
      const m = kwToPillarCluster.get(safeKey(kw.keyword)) || {};
      return {
        ...kw,
        pillarId: m.pillarId || null,
        pillarName: m.pillarName || null,
        clusterId: m.clusterId || null,
        clusterName: m.clusterName || null,
      };
    });

    // -------------------- STORE: keywordClustering (versioned model) --------------------
    const doc = {
      aiVersion: {
        filteredCount: kept.length,
        excluded,
        shortlistCount: shortlistWithMapping.length,
        pillars,
        shortlist: shortlistWithMapping,
      },
      userVersion: {
        pillars,
        shortlist: shortlistWithMapping,
        editedByUser: false,
      },
      finalVersion: null,
      geoMode,
      location_name,
      language_code,
      generatedAt: nowTs(),
      approved: false,
      approvedAt: null,
      validation: {
        minKeywordsRequired: 60,
        currentShortlistCount: shortlistWithMapping.length,
        blockers: [],
      },
    };

    await keywordClusteringRef.set(doc);

    return res.status(200).json({
      ok: true,
      generationLocked: false,
      data: doc,
    });
  } catch (e) {
    console.error("generateKeywordClustering error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
