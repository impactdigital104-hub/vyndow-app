// api/seo/strategy/generateAuthorityPlan.js
//
// STEP 8A — Authority Growth Plan (90-Day Blueprint)
// Writes Firestore doc: strategy/authorityPlan
//
// HARD GATES (must all be true):
// - businessContext.approved === true
// - keywordClustering.approved === true
// - keywordMapping.approved === true
// - pageOptimization.locked === true
//
// REGEN RULE (Option B):
// - If authorityPlan.locked === true → refuse regenerate (HTTP 400)
// - Else overwrite allowed

import admin from "../../firebaseAdmin";
import {
  computeAuthorityScores,
  recommendTotalBlogs,
  allocateBlogs,
  build90DayPlan,
} from "../../_lib/seoAuthorityPlanIntelligence";

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

function asNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, adjustedTotalBlogs } = req.body || {};
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

    const keywordMappingRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordMapping`
    );

    const pageOptimizationRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/pageOptimization`
    );

    const authorityPlanRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/authorityPlan`
    );

    // -------------------- REGEN LOCK CHECK --------------------
    const existingPlanSnap = await authorityPlanRef.get();
    if (existingPlanSnap.exists) {
      const existingPlan = existingPlanSnap.data() || {};
      if (existingPlan?.locked === true) {
        return res.status(400).json({
          error: "Step 8A blocked: authorityPlan is locked and cannot be regenerated.",
        });
      }
    }

    // -------------------- INPUT CHECKS (existence) --------------------
    const [kpSnap, bcSnap, kcSnap, kmSnap, poSnap] = await Promise.all([
      keywordPoolRef.get(),
      businessContextRef.get(),
      keywordClusteringRef.get(),
      keywordMappingRef.get(),
      pageOptimizationRef.get(),
    ]);

    if (!kpSnap.exists) {
      return res.status(400).json({
        error: "Missing keywordPool. Please complete Step 4 first.",
      });
    }
    if (!bcSnap.exists) {
      return res.status(400).json({
        error: "Missing businessContext. Please complete Step 4.5 first.",
      });
    }
    if (!kcSnap.exists) {
      return res.status(400).json({
        error: "Missing keywordClustering. Please complete Step 5 first.",
      });
    }
    if (!kmSnap.exists) {
      return res.status(400).json({
        error: "Missing keywordMapping. Please complete Step 6 first.",
      });
    }
    if (!poSnap.exists) {
      return res.status(400).json({
        error: "Missing pageOptimization. Please complete Step 7 first.",
      });
    }

    // -------------------- GATING CONDITIONS (hard) --------------------
    const businessContext = bcSnap.data() || {};
    if (businessContext?.approved !== true) {
      return res.status(400).json({
        error:
          "Step 8A blocked: businessContext is not approved yet. Please approve Step 4.5 first.",
      });
    }

    const keywordClustering = kcSnap.data() || {};
    if (keywordClustering?.approved !== true) {
      return res.status(400).json({
        error:
          "Step 8A blocked: keywordClustering is not approved yet. Please approve Step 5 first.",
      });
    }

    const keywordMapping = kmSnap.data() || {};
    if (keywordMapping?.approved !== true) {
      return res.status(400).json({
        error:
          "Step 8A blocked: keywordMapping is not approved yet. Please approve Step 6 first.",
      });
    }

    const pageOptimization = poSnap.data() || {};
    if (pageOptimization?.locked !== true) {
      return res.status(400).json({
        error:
          "Step 8A blocked: pageOptimization is not locked yet. Please lock Step 7 first.",
      });
    }

    // -------------------- EXTRACT INPUTS --------------------
    const keywordPool = kpSnap.data() || {};
    const geoMode = keywordPool?.geo_mode || keywordPool?.geoMode || "country";
    const location_name = keywordPool?.location_name || "";
    const language_code = keywordPool?.language_code || "en";

    const pillars =
      keywordClustering?.finalVersion?.pillars ||
      keywordClustering?.aiVersion?.pillars ||
      keywordClustering?.pillars ||
      [];

    if (!Array.isArray(pillars) || !pillars.length) {
      return res.status(400).json({
        error:
          "keywordClustering pillars missing. Please regenerate/approve Step 5.",
      });
    }

    // -------------------- INTELLIGENCE MODEL --------------------
    const scores = computeAuthorityScores(pillars);

    const { recommendedTotalBlogs, sliderMin, sliderMax } =
      recommendTotalBlogs(pillars);

    const requestedAdjusted = asNum(adjustedTotalBlogs, null);
    const adjusted =
      requestedAdjusted === null ? recommendedTotalBlogs : requestedAdjusted;

    // enforce slider bounds on backend as well (safety)
    const adjustedTotalBlogsSafe = Math.max(
      sliderMin,
      Math.min(sliderMax, Math.round(adjusted))
    );

    const scoredAllocations = allocateBlogs(scores, adjustedTotalBlogsSafe);

    const planCore = build90DayPlan({
      pillars,
      scoredAllocations,
      geoMode,
      location_name,
      language_code,
    });

    // -------------------- WRITE OUTPUT DOC (overwrite) --------------------
    const outDoc = {
      version: 1,
      geoMode,
      location_name,
      language_code,

      recommendedTotalBlogs,
      adjustedTotalBlogs: adjustedTotalBlogsSafe,
      sliderMin,
      sliderMax,

      pillarAllocations: planCore.pillarAllocations,

      months: planCore.months,

      reasoningSummary: planCore.reasoningSummary,

      locked: false,
      generatedAt: nowTs(),
      updatedAt: nowTs(),
    };

    await authorityPlanRef.set(outDoc, { merge: false });

    return res.status(200).json({
      ok: true,
      recommendedTotalBlogs,
      adjustedTotalBlogs: adjustedTotalBlogsSafe,
      saved: true,
    });
  } catch (err) {
    const msg = String(err?.message || err || "Unknown error");
    return res.status(400).json({ error: msg });
  }
}
