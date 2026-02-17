// api/seo/strategy/generatePageOptimization.js
//
// STEP 7 — On-Page Optimization Blueprint Engine
//
// HARD RULES:
// - Refuse unless keywordMapping.approved === true
// - Refuse unless keywordMapping.finalVersion exists
// - Refuse if pageOptimization.locked === true
// - No regen if pageOptimization doc already exists (must delete doc manually)
//
// Reads:
// - strategy/keywordMapping.finalVersion (Step 6 approved mapping)
// - strategy/keywordClustering.finalVersion (Step 5 structure)
// - strategy/businessContext.finalVersion.summary (Step 4.5 approved context)
// - strategy/auditResults/urls/* (for existing pages)
// - strategy/keywordPool (geo_mode, location_name, language_code)
//
// Writes Firestore doc: strategy/pageOptimization
//
// NOTE: This generates a blueprint (NOT content writing). No fluff. No fake metrics.

import crypto from "crypto";
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

// -------------------- HELPERS --------------------
function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function safeStr(x) {
  return String(x || "").trim();
}

function normalizeUrl(u) {
  try {
    const url = new URL(String(u));
    if (!(url.protocol === "http:" || url.protocol === "https:")) return null;
    url.hash = "";
    url.search = "";
    // align with runAudit.js behavior
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function urlIdFromUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

// For gap pages (no URL yet)
function gapIdFromSlugAndKeyword(slug, primaryKeyword) {
  const basis = `gap|${safeStr(slug)}|${safeStr(primaryKeyword)}`;
  return `gap_${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24)}`;
}

function dedupeStrings(arr, max = 12) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const v = safeStr(x);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function pickPrimaryKeywordString(primaryKeywordObjOrNull) {
  if (!primaryKeywordObjOrNull) return "";
  if (typeof primaryKeywordObjOrNull === "string") return safeStr(primaryKeywordObjOrNull);
  if (typeof primaryKeywordObjOrNull === "object") return safeStr(primaryKeywordObjOrNull.keyword);
  return "";
}

function secondaryKeywordStrings(list) {
  if (!Array.isArray(list)) return [];
  const raw = list.map((x) => {
    if (!x) return "";
    if (typeof x === "string") return x;
    if (typeof x === "object") return x.keyword || "";
    return "";
  });
  return dedupeStrings(raw, 8);
}

function safeJsonParse(str) {
  const raw = String(str || "").trim();
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(stripped);
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function clampArrayStrings(arr, max = 12) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => safeStr(x))
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeInternalLinks(arr, max = 10) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (!isPlainObject(x)) continue;
    const anchorText = safeStr(x.anchorText);
    const targetUrl = safeStr(x.targetUrl);
    if (!anchorText || !targetUrl) continue;
    out.push({ anchorText, targetUrl });
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeContentBlocks(arr, max = 8) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (!isPlainObject(x)) continue;
    const heading = safeStr(x.heading);
    const purpose = safeStr(x.purpose);
    const status = x.status === "rejected" ? "rejected" : "approved";
    if (!heading || !purpose) continue;
    out.push({ heading, purpose, status });
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeAdvisoryBlocks(arr, max = 8) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (!isPlainObject(x)) continue;
    const message = safeStr(x.message);
    const rationale = safeStr(x.rationale);
    const status = x.status === "rejected" ? "rejected" : "approved";
    if (!message || !rationale) continue;
    out.push({ message, rationale, status });
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeSchemaSuggestions(arr, max = 6) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (!isPlainObject(x)) continue;
    const type = safeStr(x.type);
    const status = x.status === "rejected" ? "rejected" : "accepted";
    const json = x.json;
    if (!type) continue;
    if (!isPlainObject(json)) continue; // schema JSON must be an object
    out.push({ type, json, status });
    if (out.length >= max) break;
  }
  return out;
}

// -------------------- OPENAI --------------------
async function callOpenAIJson({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a senior SEO strategist. Return STRICT JSON only. No markdown. No extra keys.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI request failed.");
  }

  return json?.choices?.[0]?.message?.content || "";
}

function buildPrompt({
  pageLabel,
  url,
  pageType,
  primaryKeyword,
  secondaryKeywords,
  businessSummary,
  geo,
  auditExtracted,
  internalLinkTargets,
  availableSiteUrls,
}) {
  const auditTitle = safeStr(auditExtracted?.title);
  const auditH1 = safeStr(auditExtracted?.h1);
  const auditH2 = Array.isArray(auditExtracted?.h2List) ? auditExtracted.h2List : [];

  return `
You are preparing an ON-PAGE OPTIMIZATION BLUEPRINT for ONE web page.
This is NOT content writing. It is a blueprint a senior SEO consultant would produce.

PAGE:
- label: ${pageLabel}
- url: ${url ? url : "(new page)"}
- pageType: ${pageType || "Unknown"}
- primaryKeyword: ${primaryKeyword || "(none)"}
- secondaryKeywords: ${secondaryKeywords && secondaryKeywords.length ? secondaryKeywords.join(", ") : "(none)"}

BUSINESS CONTEXT SUMMARY:
${businessSummary}

GEO CONTEXT:
- geo_mode: ${safeStr(geo?.geo_mode)}
- location_name: ${safeStr(geo?.location_name)}
- language_code: ${safeStr(geo?.language_code)}

AUDIT EXTRACT (if existing page):
- title: ${auditTitle || "(unknown)"}
- h1: ${auditH1 || "(unknown)"}
- h2 headings: ${auditH2 && auditH2.length ? auditH2.slice(0, 18).join(" | ") : "(none)"}

INTERNAL LINK TARGET CANDIDATES (optional):
${Array.isArray(internalLinkTargets) && internalLinkTargets.length ? internalLinkTargets.slice(0, 10).join("\n") : "(none provided)"}

OTHER SITE URL CONTEXT (optional list to help internal linking; do not overuse):
${Array.isArray(availableSiteUrls) && availableSiteUrls.length ? availableSiteUrls.slice(0, 20).join("\n") : "(none)"}

STRICT OUTPUT REQUIREMENTS:
Return VALID JSON with EXACT KEYS and no extras:

{
  "title": string,                       // 55–60 chars target, natural
  "metaDescription": string,             // 150–160 chars target, natural
  "h1": string,
  "h2Structure": string[],               // ordered H2 plan (5–10 items), non-promotional
  "contentBlocks": [                     // 3–5 blocks
    { "heading": string, "purpose": string, "status": "approved" }
  ],
  "schemaSuggestions": [                 // only if meaningful; else []
    { "type": string, "json": object, "status": "accepted" }
  ],
  "internalLinks": [                     // only if meaningful; else []
    { "anchorText": string, "targetUrl": string }
  ],
  "advisoryBlocks": [                    // 3–6 items
    { "message": string, "rationale": string, "status": "approved" }
  ]
}

RULES:
- No fluff. No hype. No fake metrics. No "guarantees".
- If no strong secondary keywords exist, keep secondaryKeywords unused (do not force).
- If schema is not needed, return [] for schemaSuggestions.
- internalLinks must be meaningful; else [].
- Keep tone professional and practical.
`.trim();
}

// -------------------- MAIN HANDLER --------------------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
    const db = admin.firestore();

    const keywordMappingRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordMapping`
    );
    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );
    const businessContextRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessContext`
    );
    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );
    const auditUrlsRef = db.collection(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/auditResults/urls`
    );
    const pageOptimizationRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/pageOptimization`
    );

    // -------------------- LOCK (no regen unless doc deleted) --------------------
    const existingPO = await pageOptimizationRef.get();
    if (existingPO.exists) {
      const data = existingPO.data() || {};
      if (data?.locked === true) {
        return res.status(200).json({ ok: true, generationLocked: true, locked: true, source: "existing", data });
      }
      // Even if not locked, we follow the same Step 6 contract: manual delete required to regenerate
      return res.status(200).json({ ok: true, generationLocked: true, source: "existing", data });
    }

    // -------------------- GATE: Step 6 approved --------------------
    const kmSnap = await keywordMappingRef.get();
    if (!kmSnap.exists) {
      return res.status(400).json({ error: "Missing keywordMapping. Complete Step 6 first." });
    }
    const km = kmSnap.data() || {};
    if (km?.approved !== true) {
      return res.status(400).json({ error: "Step 7 blocked: keywordMapping is not approved. Approve Step 6 first." });
    }
    const mapping = km?.finalVersion;
    if (!mapping || typeof mapping !== "object") {
      return res.status(400).json({ error: "Step 7 blocked: keywordMapping.finalVersion missing." });
    }

    // -------------------- INPUTS: Step 5 + Step 4.5 --------------------
    const [kcSnap, bcSnap, kpSnap, auditSnap] = await Promise.all([
      keywordClusteringRef.get(),
      businessContextRef.get(),
      keywordPoolRef.get(),
      auditUrlsRef.get(),
    ]);

    if (!kcSnap.exists) return res.status(400).json({ error: "Missing keywordClustering. Complete Step 5 first." });
    const kc = kcSnap.data() || {};
    if (kc?.approved !== true) {
      return res.status(400).json({ error: "Step 7 blocked: keywordClustering is not approved. Approve Step 5 first." });
    }
    const kcFinal = kc?.finalVersion;
    if (!kcFinal || typeof kcFinal !== "object") {
      return res.status(400).json({ error: "keywordClustering.finalVersion missing." });
    }

    if (!bcSnap.exists) return res.status(400).json({ error: "Missing businessContext. Complete Step 4.5 first." });
    const bc = bcSnap.data() || {};
    if (bc?.approved !== true) {
      return res.status(400).json({ error: "Step 7 blocked: businessContext is not approved. Approve Step 4.5 first." });
    }
    const bcFinal = bc?.finalVersion || {};
    const businessSummary = safeStr(bcFinal?.summary || bcFinal?.summaryText);
    if (!businessSummary) {
      return res.status(400).json({ error: "businessContext.finalVersion.summary missing." });
    }

    const geo = kpSnap.exists ? (kpSnap.data() || {}) : {};

    // -------------------- Build audit map --------------------
    const auditDocs = auditSnap.docs.map((d) => d.data() || {});
    const auditByUrl = new Map();
    for (const d of auditDocs) {
      const nu = normalizeUrl(d.url);
      if (!nu) continue;
      auditByUrl.set(nu, d);
    }

    // -------------------- Build page list --------------------
    const existingPages = Array.isArray(mapping.existingPages) ? mapping.existingPages : [];
    const gapPages = Array.isArray(mapping.gapPages) ? mapping.gapPages : [];

    // Available URLs for internal linking context
    const availableSiteUrls = dedupeStrings(existingPages.map((p) => p.url).filter(Boolean), 40);

    const pagesOut = {};

    // EXISTING PAGES
    for (const p of existingPages) {
      const urlRaw = safeStr(p?.url);
      const nu = normalizeUrl(urlRaw);
      if (!nu) continue;

      const pageId = urlIdFromUrl(nu);
      const primaryKeyword = pickPrimaryKeywordString(p?.primaryKeyword);
      const secondaryKeywords = secondaryKeywordStrings(p?.secondaryKeywords);
      const pageType = safeStr(p?.pillar) ? "Existing Page (Mapped)" : "Existing Page";

      const auditDoc = auditByUrl.get(nu) || null;
      const auditExtracted = auditDoc?.extracted || {};

      const internalLinkTargets = Array.isArray(p?.internalLinkTargets) ? p.internalLinkTargets : [];

      const prompt = buildPrompt({
        pageLabel: nu,
        url: nu,
        pageType,
        primaryKeyword,
        secondaryKeywords,
        businessSummary,
        geo,
        auditExtracted,
        internalLinkTargets,
        availableSiteUrls,
      });

      const raw = await callOpenAIJson({ prompt });
      const parsed = safeJsonParse(raw);

      const title = safeStr(parsed?.title);
      const metaDescription = safeStr(parsed?.metaDescription);
      const h1 = safeStr(parsed?.h1);

      const h2Structure = clampArrayStrings(parsed?.h2Structure, 12);
      const contentBlocks = sanitizeContentBlocks(parsed?.contentBlocks, 8);
      const schemaSuggestions = sanitizeSchemaSuggestions(parsed?.schemaSuggestions, 6);
      const internalLinks = sanitizeInternalLinks(parsed?.internalLinks, 10);
      const advisoryBlocks = sanitizeAdvisoryBlocks(parsed?.advisoryBlocks, 10);

      pagesOut[pageId] = {
        url: nu,
        primaryKeyword,
        secondaryKeywords,
        pageType,
        title,
        metaDescription,
        h1,
        h2Structure,
        contentBlocks,
        schemaSuggestions,
        internalLinks,
        advisoryBlocks,
        approved: false,
        approvedAt: null,
        autoSavedAt: nowTs(),
      };
    }

    // GAP PAGES (only if accepted !== false)
    for (const g of gapPages) {
      if (g?.accepted === false) continue;

      const suggestedSlug = safeStr(g?.suggestedSlug);
      const primaryKeyword = safeStr(g?.primaryKeyword);
      const secondaryKeywords = dedupeStrings(g?.secondaryKeywords || [], 8);
      const pageType = safeStr(g?.pageType) || "New Page";

      if (!suggestedSlug && !primaryKeyword) continue;

      const pageId = gapIdFromSlugAndKeyword(suggestedSlug, primaryKeyword);

      const label = suggestedSlug ? `(new) ${suggestedSlug}` : "(new page)";

      const prompt = buildPrompt({
        pageLabel: label,
        url: "",
        pageType,
        primaryKeyword,
        secondaryKeywords,
        businessSummary,
        geo,
        auditExtracted: null,
        internalLinkTargets: [],
        availableSiteUrls,
      });

      const raw = await callOpenAIJson({ prompt });
      const parsed = safeJsonParse(raw);

      const title = safeStr(parsed?.title);
      const metaDescription = safeStr(parsed?.metaDescription);
      const h1 = safeStr(parsed?.h1);

      const h2Structure = clampArrayStrings(parsed?.h2Structure, 12);
      const contentBlocks = sanitizeContentBlocks(parsed?.contentBlocks, 8);
      const schemaSuggestions = sanitizeSchemaSuggestions(parsed?.schemaSuggestions, 6);
      const internalLinks = sanitizeInternalLinks(parsed?.internalLinks, 10);
      const advisoryBlocks = sanitizeAdvisoryBlocks(parsed?.advisoryBlocks, 10);

      pagesOut[pageId] = {
        url: suggestedSlug ? suggestedSlug : "", // gap pages store slug here (until real URL exists)
        primaryKeyword,
        secondaryKeywords,
        pageType,
        title,
        metaDescription,
        h1,
        h2Structure,
        contentBlocks,
        schemaSuggestions,
        internalLinks,
        advisoryBlocks,
        approved: false,
        approvedAt: null,
        autoSavedAt: nowTs(),
      };
    }

    const payload = {
      pages: pagesOut,
      allPagesApproved: false,
      generatedAt: nowTs(),
      locked: false,
    };

    await pageOptimizationRef.set(payload, { merge: false });

    return res.status(200).json({
      ok: true,
      generated: true,
      pageCount: Object.keys(pagesOut).length,
    });
  } catch (e) {
    console.error("generatePageOptimization error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
