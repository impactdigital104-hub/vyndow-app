// api/geo/worker/process.js

import admin from "../../firebaseAdmin";

/* ---------------- AUTH ---------------- */

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

/* ---------------- HELPERS ---------------- */

function safeTextFromHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countTag(html, tag) {
  if (!html) return 0;
  const re = new RegExp(`<${tag}(\\s|>)`, "gi");
  return (html.match(re) || []).length;
}

function extractTitle(html) {
  const m = html?.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim().slice(0, 200) : "";
}

function hasJsonLd(html) {
  return /application\/ld\+json/i.test(html || "");
}

function detectUpdatedSignal(text) {
  return /(updated on|last updated|reviewed on|last modified)/i.test(text || "");
}

/* ---------------- GEO SCORING (Phase 4 LOCKED) ---------------- */

// Locked weights (A–H)
const GEO_WEIGHTS = {
  A: 18,
  B: 12,
  C: 16,
  D: 12,
  E: 14,
  F: 14,
  G: 8,
  H: 6,
};

// Locked grade bands
function gradeFromScore(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 40) return "Poor";
  return "Very Poor";
}

// Basic HTML extractors (regex-based, deterministic)
function extractMetaDescription(html) {
  const m = html?.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return m ? m[1].trim().slice(0, 300) : "";
}

function extractCanonical(html) {
  const m = html?.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return m ? m[1].trim().slice(0, 500) : "";
}

function hasListOrTable(html) {
  return /<(ul|ol|table)(\s|>)/i.test(html || "");
}

function extractJsonLdBlocks(html) {
  if (!html) return [];
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || "").trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function normalizeSchemaType(t) {
  if (!t) return "";
  if (Array.isArray(t)) return t.map(normalizeSchemaType).join(",");
  return String(t).trim();
}

function extractJsonLdTypes(html) {
  const blocks = extractJsonLdBlocks(html);
  const types = new Set();
  for (const raw of blocks) {
    try {
      const obj = JSON.parse(raw);
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== "object") return;

        const t = normalizeSchemaType(node["@type"]);
        if (t) {
          t.split(",").forEach((x) => {
            const cleaned = String(x || "").trim();
            if (cleaned) types.add(cleaned);
          });
        }
        // Some JSON-LD uses @graph
        if (node["@graph"]) walk(node["@graph"]);
        for (const k of Object.keys(node)) walk(node[k]);
      };
      walk(obj);
    } catch {
      // ignore invalid json-ld blocks deterministically
    }
  }
  return Array.from(types);
}

function extractDatesFromJsonLd(html) {
  const blocks = extractJsonLdBlocks(html);
  const dates = [];
  const keys = ["dateModified", "datePublished", "dateCreated"];
  for (const raw of blocks) {
    try {
      const obj = JSON.parse(raw);
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== "object") return;

        for (const k of keys) {
          const v = node[k];
          if (typeof v === "string" && v.length >= 8) dates.push(v);
        }
        if (node["@graph"]) walk(node["@graph"]);
        for (const k of Object.keys(node)) walk(node[k]);
      };
      walk(obj);
    } catch {}
  }
  return dates;
}

// Very simple visible date sniffing (kept deterministic)
function extractVisibleUpdatedDate(text) {
  if (!text) return "";
  const m = text.match(
    /(updated on|last updated|reviewed on|last modified)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2})/i
  );
  return m ? (m[2] || "").trim() : "";
}

function parseDateSafe(s) {
  if (!s) return null;
  const d = new Date(s);
  if (!isFinite(d.getTime())) return null;
  return d;
}

function monthsDiff(from, to) {
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  return years * 12 + months;
}

function extractLinks(html) {
  const links = [];
  if (!html) return links;
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || "").trim();
    if (href) links.push(href);
  }
  return links;
}

function isProbablyInternalLink(href, pageUrl) {
  try {
    if (!href) return false;
    if (href.startsWith("#")) return true;
    if (href.startsWith("/")) return true;
    const u = new URL(pageUrl);
    const h = new URL(href, pageUrl);
    return h.host === u.host;
  } catch {
    return false;
  }
}

function isProbablyExternalLink(href, pageUrl) {
  try {
    if (!href) return false;
    const u = new URL(pageUrl);
    const h = new URL(href, pageUrl);
    return h.host && h.host !== u.host;
  } catch {
    return false;
  }
}

function detectAuthorSignal(text, html) {
  if (!text && !html) return false;
  if (/by\s+[A-Z][a-z]+/i.test(text || "")) return true;
  if (/rel=["']author["']/i.test(html || "")) return true;
  if (/class=["'][^"']*(author|byline)[^"']*["']/i.test(html || "")) return true;
  return false;
}

function detectTrustLinks(html) {
  const links = extractLinks(html);
  const joined = links.join(" ").toLowerCase();
  return (
    joined.includes("about") ||
    joined.includes("contact") ||
    joined.includes("privacy") ||
    joined.includes("terms") ||
    joined.includes("policy")
  );
}

// Required schema types per spec
const REQUIRED_SCHEMA_TYPES = new Set([
  "FAQPage",
  "HowTo",
  "Article",
  "Product",
  "LocalBusiness",
  "BreadcrumbList",
]);

function severityForCategory(categoryKey, pointsEarned) {
  const weight = GEO_WEIGHTS[categoryKey] || 0;
  if (!weight) return "Low";
  const pct = weight === 0 ? 1 : pointsEarned / weight;

  // Hard fails (per spec)
  // We tag these at issue-generation time too, but keep this fallback.
  if (pct < 0.4) return "High";
  if (pct <= 0.7) return "Medium";
  return "Low";
}

function computeGeoAudit({ pageUrl, signals }) {
  const now = new Date();

  const issues = [];
  const suggestions = [];
  const breakdown = {};
  const evidence = {
    httpStatus: signals.httpStatus,
    title: signals.title || "",
    metaDescription: signals.metaDescription || "",
    canonical: signals.canonical || "",
    h1Count: signals.h1Count || 0,
    h2Count: signals.h2Count || 0,
    wordCount: signals.wordCount || 0,
    jsonLdPresent: !!signals.jsonLdPresent,
    jsonLdTypes: Array.isArray(signals.jsonLdTypes) ? signals.jsonLdTypes : [],
        schemaDates: Array.isArray(signals.schemaDates) ? signals.schemaDates : [],
    detectedUpdatedText: signals.detectedUpdatedText || "",
    detectedUpdatedDate: signals.detectedUpdatedDate || null,
    internalLinksCount: signals.internalLinksCount || 0,
    externalLinksCount: signals.externalLinksCount || 0,
    authorSignal: !!signals.authorSignal,
    trustLinksSignal: !!signals.trustLinksSignal,
    listOrTableSignal: !!signals.listOrTableSignal,
  };

  // ---------- Category A: Answerability & Structure (18) ----------
  let A = 0;
  if (signals.h1Count >= 1) A += 2;
  if (signals.h2Count >= 1) A += 1;
  if (signals.wordCount >= 800) A += 1;
  if (signals.listOrTableSignal) A += 1;
  if (A > 5) A = 5;
  breakdown.A = { subScore: A, weight: GEO_WEIGHTS.A };

  if (A < 4) {
    issues.push({
      category: "A",
      title: "Content structure is weak for GEO",
      why: "LLMs and answer engines prefer clearly structured pages that are easy to summarize.",
      fix: "Ensure one clear H1, supporting H2s, and add bullets/table where relevant.",
      severity: "Medium",
    });
    suggestions.push({
      category: "A",
      title: "Improve headings and structure",
      description: "Add/strengthen H1 + H2s and include scannable lists or a table.",
      impact: "Improves answerability and extraction.",
    });
  }

  // ---------- Category B: Freshness & Recency (12) ----------
  let B = 0;
  // Priority: schema date → visible date → “updated signal” (fallback)
  let bestDate = signals.detectedUpdatedDate;
  if (!bestDate) {
    const schemaDates = Array.isArray(signals.schemaDates) ? signals.schemaDates : [];
    for (const s of schemaDates) {
      const d = parseDateSafe(s);
      if (d && (!bestDate || d > bestDate)) bestDate = d;
    }
  }

  if (bestDate) {
    const m = monthsDiff(bestDate, now);
    if (m <= 6) B = 5;
    else if (m <= 12) B = 3;
    else B = 1;
  } else {
    B = 0;
  }
  breakdown.B = { subScore: B, weight: GEO_WEIGHTS.B };

  if (B === 0 || B === 1) {
    issues.push({
      category: "B",
      title: "Freshness date missing or outdated",
      why: "Answer engines favor pages with clear, recent update signals for trust and relevance.",
      fix: "Add an 'Updated on' date and/or dateModified in JSON-LD and refresh content periodically.",
      severity: "High",
    });
    suggestions.push({
      category: "B",
      title: "Add/refresh updated date",
      description: "Add visible 'Updated on' date and include dateModified in JSON-LD.",
      impact: "Boosts recency trust signals.",
    });
  }

  // ---------- Category C: E-E-A-T & Trust (16) ----------
  let C = 0;
  if (signals.authorSignal) C += 2;
  if (signals.trustLinksSignal) C += 2;
  if (signals.externalLinksCount >= 1) C += 1; // outbound citation proxy
  if (C > 5) C = 5;
  breakdown.C = { subScore: C, weight: GEO_WEIGHTS.C };

  if (C < 4) {
    issues.push({
      category: "C",
      title: "E-E-A-T trust signals are missing",
      why: "Clear authorship and trust pages help answer engines evaluate credibility.",
      fix: "Add author/byline, and ensure About/Contact/Policy pages are linked. Add at least one credible outbound citation.",
      severity: "Medium",
    });
    suggestions.push({
      category: "C",
      title: "Strengthen E-E-A-T signals",
      description: "Add author/byline and link About/Contact/Privacy. Include at least one credible citation link.",
      impact: "Improves trust and credibility scoring.",
    });
  }

  // ---------- Category D: Entity & Context Clarity (12) ----------
  let D = 0;
  // deterministic, light heuristic: title + h1 + presence of “in <place>” or service context
  if (signals.title) D += 2;
  if (signals.h1Count >= 1) D += 2;
  const t = (signals.title || "") + " " + (signals.textSample || "");
  if (/\bin\s+[A-Z][a-z]+/.test(t)) D += 1;
  if (D > 5) D = 5;
  breakdown.D = { subScore: D, weight: GEO_WEIGHTS.D };

  if (D < 4) {
    issues.push({
      category: "D",
      title: "Primary entity/context is unclear",
      why: "Answer engines need the page to clearly state 'what this page is about' and the main entity.",
      fix: "Ensure title/H1 explicitly name the primary entity/topic and add clarifying context early in the page.",
      severity: "Medium",
    });
    suggestions.push({
      category: "D",
      title: "Clarify the primary entity early",
      description: "Make title and H1 explicit about the main entity/topic and add a clear intro sentence.",
      impact: "Improves entity understanding and retrieval.",
    });
  }

  // ---------- Category E: Structured Data (14) ----------
  let E = 0;
  const types = new Set(Array.isArray(signals.jsonLdTypes) ? signals.jsonLdTypes : []);
  const hasRequiredType = Array.from(REQUIRED_SCHEMA_TYPES).some((x) => types.has(x));

  if (signals.jsonLdPresent && hasRequiredType) E = 5;
  else if (signals.jsonLdPresent) E = 2;
  else E = 0;

  breakdown.E = { subScore: E, weight: GEO_WEIGHTS.E };

  if (E < 5) {
    issues.push({
      category: "E",
      title: "Missing required structured data types",
      why: "Schema helps answer engines extract facts, FAQs, and steps reliably.",
      fix: "Add JSON-LD schema using one of: FAQPage / HowTo / Article / Product / LocalBusiness / BreadcrumbList.",
      severity: E === 0 ? "High" : "Medium",
    });
    suggestions.push({
      category: "E",
      title: "Add required JSON-LD schema",
      description: "Add at least one required schema type (FAQPage/HowTo/Article/Product/LocalBusiness/BreadcrumbList).",
      impact: "Improves machine-readability and extraction.",
    });
  }

  // ---------- Category F: Intent & Decision Enablement (14) ----------
  let F = 0;
  const text = (signals.fullText || "").toLowerCase();
  if (/(price|pricing|cost|fees|₹|\$)/.test(text)) F += 2;
  if (/(faq|frequently asked)/.test(text)) F += 2;
  if (/(book|contact|call|whatsapp|enquire|get started|buy now)/.test(text)) F += 1;
  if (F > 5) F = 5;
  breakdown.F = { subScore: F, weight: GEO_WEIGHTS.F };

  if (F < 4) {
    issues.push({
      category: "F",
      title: "Intent and decision cues are weak",
      why: "Users and answer engines look for decision-ready info like FAQs, pricing cues, and clear next steps.",
      fix: "Add FAQs, clarify pricing/cost cues where relevant, and add a clear CTA.",
      severity: "Medium",
    });
    suggestions.push({
      category: "F",
      title: "Add FAQs and decision cues",
      description: "Add an FAQ section and clear CTA; include pricing/cost cues if applicable.",
      impact: "Improves conversion and answer usefulness.",
    });
  }

  // ---------- Category G: UX & Technical Hygiene (8) ----------
  let G = 0;
  if (signals.httpStatus === 200) G += 2;
  if (signals.title) G += 1;
  if (signals.metaDescription) G += 1;
  if (signals.canonical) G += 1;
  if (G > 5) G = 5;
  breakdown.G = { subScore: G, weight: GEO_WEIGHTS.G };

  if (signals.httpStatus !== 200) {
    issues.push({
      category: "G",
      title: "Page did not return HTTP 200",
      why: "Non-200 pages are unreliable for indexing and answer engines.",
      fix: "Fix server errors/redirect chains and ensure the page returns 200.",
      severity: "High",
    });
  }

  if (G < 4) {
    suggestions.push({
      category: "G",
      title: "Improve meta/canonical hygiene",
      description: "Ensure title, meta description, and canonical link are present and correct.",
      impact: "Improves crawl and indexing stability.",
    });
  }

  // ---------- Category H: Internal Journey & Discoverability (6) ----------
  let H = 0;
  if (signals.internalLinksCount >= 2) H = 5;
  else if (signals.internalLinksCount === 1) H = 3;
  else H = 0;

  breakdown.H = { subScore: H, weight: GEO_WEIGHTS.H };

  if (H < 5) {
    issues.push({
      category: "H",
      title: "Internal linking is insufficient",
      why: "Internal links help answer engines discover related content and understand site structure.",
      fix: "Add at least 2 internal links to relevant related pages.",
      severity: "Medium",
    });
    suggestions.push({
      category: "H",
      title: "Add internal links",
      description: "Add 2+ internal links to closely related pages/services/topics.",
      impact: "Improves discoverability and topical authority flow.",
    });
  }

  // ----- Convert breakdown to points using locked formula -----
  let geoScore = 0;
  for (const k of Object.keys(GEO_WEIGHTS)) {
    const weight = GEO_WEIGHTS[k];
    const sub = Math.max(0, Math.min(5, Number(breakdown[k]?.subScore || 0)));
    const points = Math.round(weight * (sub / 5));
    breakdown[k].points = points;
    geoScore += points;
  }
  geoScore = Math.max(0, Math.min(100, geoScore));

  const grade = gradeFromScore(geoScore);

  // Apply locked severity mapping per category score %
  for (const it of issues) {
    const cat = it.category;
    const pts = Number(breakdown?.[cat]?.points || 0);
    const sev = severityForCategory(cat, pts);

    // Hard fail overrides for B/E/G per spec
    if (cat === "B" && (breakdown.B.subScore === 0 || breakdown.B.subScore === 1)) it.severity = "High";
    if (cat === "E" && breakdown.E.subScore < 5) it.severity = (breakdown.E.subScore === 0 ? "High" : "Medium");
    if (cat === "G" && signals.httpStatus !== 200) it.severity = "High";

    if (!it.severity) it.severity = sev;
  }

  return { geoScore, grade, breakdown, issues, suggestions, evidence };
}


/* ---------------- FETCH ---------------- */

async function fetchPage(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "VyndowGEO/1.0" },
      signal: controller.signal,
    });
    const html = await r.text();
    return {
      httpStatus: r.status,
      html,
    };
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- HANDLER ---------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ ok: false });

    await getUidFromRequest(req);

    const db = admin.firestore();

    const runsSnap = await db
      .collection("geoRuns")
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (runsSnap.empty)
      return res.json({ ok: true, message: "No queued runs found." });

    const runDoc = runsSnap.docs[0];
    const runId = runDoc.id;

    await runDoc.ref.update({
      status: "processing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const pagesRef = runDoc.ref.collection("pages");

    const pagesSnap = await pagesRef
      .where("status", "==", "queued")
      .limit(3)
      .get();

    const analyzed = [];

    for (const p of pagesSnap.docs) {
      const url = p.data().url;
      if (!url) continue;

      await p.ref.update({ status: "fetching" });

      const fetched = await fetchPage(url);
      const text = safeTextFromHtml(fetched.html);

      const metaDescription = extractMetaDescription(fetched.html);
      const canonical = extractCanonical(fetched.html);

      const jsonLdTypes = extractJsonLdTypes(fetched.html);
      const schemaDates = extractDatesFromJsonLd(fetched.html);

      const detectedUpdatedText = extractVisibleUpdatedDate(text);
      const detectedUpdatedDate = parseDateSafe(detectedUpdatedText);

      const links = extractLinks(fetched.html);
      const internalLinksCount = links.filter((h) => isProbablyInternalLink(h, url)).length;
      const externalLinksCount = links.filter((h) => isProbablyExternalLink(h, url)).length;

      const authorSignal = detectAuthorSignal(text, fetched.html);
      const trustLinksSignal = detectTrustLinks(fetched.html);
      const listOrTableSignal = hasListOrTable(fetched.html);

      const signals = {
        httpStatus: fetched.httpStatus,
        title: extractTitle(fetched.html),
        metaDescription,
        canonical,

        h1Count: countTag(fetched.html, "h1"),
        h2Count: countTag(fetched.html, "h2"),
        wordCount: text ? text.split(" ").filter(Boolean).length : 0,

        jsonLdPresent: hasJsonLd(fetched.html),
        jsonLdTypes,
        schemaDates,

        detectedUpdatedText,
        detectedUpdatedDate,

        internalLinksCount,
        externalLinksCount,

        authorSignal,
        trustLinksSignal,
        listOrTableSignal,

        // helpful for category D and F (deterministic)
        textSample: (text || "").slice(0, 600),
        fullText: text || "",
      };

      const audit = computeGeoAudit({ pageUrl: url, signals });


      await p.ref.update({
        status: "analyzed",

        // keep existing signals (now richer)
        ...signals,

        // Phase 4 locked outputs
        geoScore: audit.geoScore,
        grade: audit.grade,
        breakdown: audit.breakdown,
        issues: audit.issues,
        suggestions: audit.suggestions,
        evidence: audit.evidence,

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });


analyzed.push({
  url,
  geoScore: audit.geoScore,
});

    }

// ---------- RUN-LEVEL AGGREGATION (Phase 3.4) ----------
let sumScores = 0;
let scoredPages = 0;

for (const item of analyzed) {
  if (typeof item.geoScore === "number") {
    sumScores += item.geoScore;
    scoredPages += 1;
  }
}

const overallScore = scoredPages > 0 ? Math.round(sumScores / scoredPages) : 0;

// Count critical issues across analyzed pages (simple v1 rule)
let criticalIssuesCount = 0;

// Read back the analyzed page docs we just wrote (only for these pages)
for (const item of analyzed) {
  // We don't have pageId in the response list here, so we approximate critical count from score.
  // v1 rule: score < 50 => 1 critical flag
  if (typeof item.geoScore === "number" && item.geoScore < 50) {
    criticalIssuesCount += 1;
  }
}

// Count failed pages in this run (status == failed)
const failedSnap = await pagesRef.where("status", "==", "failed").get();
const pagesFailed = failedSnap.size;

// Count analyzed pages in this run (status == analyzed)
const analyzedSnap = await pagesRef.where("status", "==", "analyzed").get();
const pagesAnalyzed = analyzedSnap.size;

// Write run summary onto geoRuns/{runId}
await runDoc.ref.set(
  {
    overallScore,
    pagesAnalyzed,
    pagesFailed,
    criticalIssuesCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

return res.json({
  ok: true,
  runId,
  analyzedCount: analyzed.length,
  analyzed,
  runSummary: {
    overallScore,
    pagesAnalyzed,
    pagesFailed,
    criticalIssuesCount,
  },
});

  } catch (e) {
    console.error(e);
    return res.status(400).json({ ok: false, error: e.message });
  }
}
