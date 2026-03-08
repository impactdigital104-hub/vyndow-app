import admin from "../firebaseAdmin";

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
export async function resolveEffectiveContext(uid, websiteId) {
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

// -------------------- HELPERS --------------------
function safeStr(x) {
  return String(x || "").trim();
}

function safeObj(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function dedupeStrings(list) {
  const seen = new Set();
  const out = [];

  for (const item of safeArr(list)) {
    const v = safeStr(item);
    if (!v) continue;

    const key = v.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(v);
  }

  return out;
}

function asKeywordString(x) {
  if (!x) return "";
  if (typeof x === "string") return safeStr(x);
  if (typeof x === "object") return safeStr(x.keyword);
  return "";
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
}

function extractKeywordMappingView(docData) {
  const d = safeObj(docData);

  if (d.approved === true && d.finalVersion && typeof d.finalVersion === "object") {
    return safeObj(d.finalVersion);
  }

  if (d.userVersion && typeof d.userVersion === "object") {
    return safeObj(d.userVersion);
  }

  return {
    existingPages: safeArr(d.existingPages),
    gapPages: safeArr(d.gapPages),
    deploymentStats: d.deploymentStats || null,
  };
}

function normalizeMappedTargetPages(keywordMappingDoc, pageOptimizationDoc) {
  const view = extractKeywordMappingView(keywordMappingDoc);
  const existingPages = safeArr(view.existingPages);
  const gapPages = safeArr(view.gapPages);
  const pageOptPages = safeObj(pageOptimizationDoc?.pages);

  const out = [];

  for (const p of existingPages) {
    const targetUrl = firstNonEmpty(p?.url, p?.targetUrl, p?.pageUrl);
    const primaryKeyword = asKeywordString(p?.primaryKeyword);
    const pageLabel = firstNonEmpty(p?.pageLabel, p?.label, p?.title);
    const pageType = firstNonEmpty(p?.pageType, p?.type);

    out.push({
      targetUrl,
      primaryKeyword,
      pageLabel,
      pageType,
      sourceDocument: "keywordMapping.existingPages",
    });
  }

  for (const g of gapPages) {
    const targetUrl = firstNonEmpty(g?.suggestedSlug, g?.slug, g?.url);
    const primaryKeyword = asKeywordString(g?.primaryKeyword);
    const pageLabel = firstNonEmpty(g?.pageLabel, g?.label, g?.title);
    const pageType = firstNonEmpty(g?.pageType, g?.type);

    out.push({
      targetUrl,
      primaryKeyword,
      pageLabel,
      pageType,
      sourceDocument: "keywordMapping.gapPages",
    });
  }

  for (const [pageId, p] of Object.entries(pageOptPages)) {
    const targetUrl = firstNonEmpty(p?.url);
    const pageLabel = firstNonEmpty(p?.title, pageId);

    if (!targetUrl && !pageLabel) continue;

    const alreadyExists = out.some((row) => {
      const a = safeStr(row.targetUrl).toLowerCase();
      const b = safeStr(targetUrl).toLowerCase();
      return a && b && a === b;
    });

    if (alreadyExists) continue;

    out.push({
      targetUrl,
      primaryKeyword: firstNonEmpty(p?.primaryKeyword),
      pageLabel,
      pageType: firstNonEmpty(p?.pageType),
      sourceDocument: "pageOptimization.pages",
    });
  }

  return out;
}

function normalizeOptimizedPages(pageOptimizationDoc) {
  const pages = safeObj(pageOptimizationDoc?.pages);
  const out = [];

  for (const [pageId, p] of Object.entries(pages)) {
    out.push({
      pageId: safeStr(pageId),
      url: firstNonEmpty(p?.url),
      title: firstNonEmpty(p?.title),
      approved: p?.approved === true,
      primaryKeyword: firstNonEmpty(p?.primaryKeyword),
      pageType: firstNonEmpty(p?.pageType),
      h1: firstNonEmpty(p?.h1),
      contentBlockCount: safeArr(p?.contentBlocks).length,
      advisoryBlockCount: safeArr(p?.advisoryBlocks).length,
      schemaSuggestionCount: safeArr(p?.schemaSuggestions).length,
      internalLinkCount: safeArr(p?.internalLinks).length,
    });
  }

  return out;
}

function normalizeAuthorityPlannedBlogs(authorityPlanDoc) {
  const d = safeObj(authorityPlanDoc);
  const monthsObj = d.months && typeof d.months === "object" ? d.months : d;

  const monthKeys = ["month1", "month2", "month3"];
  const out = [];

  for (const monthKey of monthKeys) {
    const rows = safeArr(monthsObj?.[monthKey]);

    for (const row of rows) {
      out.push({
        month: monthKey,
        blogTitle: firstNonEmpty(row?.blogTitle),
        primaryKeyword: firstNonEmpty(row?.primaryKeyword),
        pillarName: firstNonEmpty(row?.pillarName),
        slug: firstNonEmpty(row?.slug),
        intent: firstNonEmpty(row?.intent),
        ctaFocus: firstNonEmpty(row?.ctaFocus),
        impactTag: firstNonEmpty(row?.impactTag),
      });
    }
  }

  return out;
}

function normalizeDraftBlogTargets(draftDocs) {
  const out = [];

  for (const d of draftDocs) {
    out.push({
      draftId: safeStr(d?.draftId),
      month: d?.month === undefined || d?.month === null ? "" : String(d.month),
      blogTitle: firstNonEmpty(d?.blogTitle),
      primaryKeyword: firstNonEmpty(d?.primaryKeyword),
      pillarName: firstNonEmpty(d?.pillarName),
      slug: firstNonEmpty(d?.slug),
      status: firstNonEmpty(d?.status),
      source: firstNonEmpty(d?.source),
    });
  }

  return out;
}

function buildKnownStrategyUrls({
  keywordMappingDoc,
  pageOptimizationDoc,
  draftDocs,
}) {
  const out = [];

  const mappingView = extractKeywordMappingView(keywordMappingDoc);

  for (const p of safeArr(mappingView?.existingPages)) {
    out.push(firstNonEmpty(p?.url, p?.targetUrl, p?.pageUrl));
  }

  for (const g of safeArr(mappingView?.gapPages)) {
    out.push(firstNonEmpty(g?.suggestedSlug, g?.slug, g?.url));
  }

  const poPages = safeObj(pageOptimizationDoc?.pages);
  for (const p of Object.values(poPages)) {
    out.push(firstNonEmpty(p?.url));
  }

  for (const d of draftDocs) {
    out.push(firstNonEmpty(d?.slug));
  }

  return dedupeStrings(out);
}

export async function buildVyndowContextForWebsite({ uid, websiteId }) {
  const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
  const db = admin.firestore();

  const strategyBase =
    `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy`;

  const businessProfileRef = db.doc(`${strategyBase}/businessProfile`);
  const businessContextRef = db.doc(`${strategyBase}/businessContext`);
  const keywordMappingRef = db.doc(`${strategyBase}/keywordMapping`);
  const pageOptimizationRef = db.doc(`${strategyBase}/pageOptimization`);
  const authorityPlanRef = db.doc(`${strategyBase}/authorityPlan`);

  const blogDraftsRef = db.collection(
    `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/blogDrafts`
  );

  const [
    businessProfileSnap,
    businessContextSnap,
    keywordMappingSnap,
    pageOptimizationSnap,
    authorityPlanSnap,
    blogDraftsSnap,
  ] = await Promise.all([
    businessProfileRef.get(),
    businessContextRef.get(),
    keywordMappingRef.get(),
    pageOptimizationRef.get(),
    authorityPlanRef.get(),
    blogDraftsRef.get(),
  ]);

  const businessProfile = businessProfileSnap.exists ? (businessProfileSnap.data() || {}) : {};
  const businessContext = businessContextSnap.exists ? (businessContextSnap.data() || {}) : {};
  const keywordMapping = keywordMappingSnap.exists ? (keywordMappingSnap.data() || {}) : {};
  const pageOptimization = pageOptimizationSnap.exists ? (pageOptimizationSnap.data() || {}) : {};
  const authorityPlan = authorityPlanSnap.exists ? (authorityPlanSnap.data() || {}) : {};

  const draftDocs = (blogDraftsSnap.docs || []).map((doc) => ({
    draftId: doc.id,
    ...(doc.data() || {}),
  }));

  return {
    effectiveContext: {
      effectiveUid,
      effectiveWebsiteId,
    },
    strategyContext: {
      businessProfile,
      businessContext,
      keywordMapping,
      pageOptimization,
      authorityPlan,
    },
    blogDraftContext: {
      drafts: draftDocs,
    },
    derivedContext: {
      mappedTargetPages: normalizeMappedTargetPages(keywordMapping, pageOptimization),
      optimizedPages: normalizeOptimizedPages(pageOptimization),
      authorityPlannedBlogs: normalizeAuthorityPlannedBlogs(authorityPlan),
      draftBlogTargets: normalizeDraftBlogTargets(draftDocs),
      knownStrategyUrls: buildKnownStrategyUrls({
        keywordMappingDoc: keywordMapping,
        pageOptimizationDoc: pageOptimization,
        draftDocs,
      }),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use GET or POST." });
  }

  try {
    const uid = await getUidFromRequest(req);

    const websiteId = safeStr(
      req.method === "GET" ? req.query?.websiteId : req.body?.websiteId
    );

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    const payload = await buildVyndowContextForWebsite({ uid, websiteId });

    return res.status(200).json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    console.error("ogi/buildContext error:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to build Vyndow context.",
    });
  }
}
