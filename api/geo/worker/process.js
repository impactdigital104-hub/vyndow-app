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

/* ---------------- GEO SCORING (v1) ---------------- */

function computeGeoScore(signals) {
  let score = 0;
  const issues = [];
  const suggestions = [];

  if (signals.httpStatus === 200) score += 10;
  else issues.push("Page did not return HTTP 200");

  if (signals.title) score += 10;
  else {
    issues.push("Missing <title>");
    suggestions.push("Add a clear SEO-friendly title tag");
  }

  if (signals.h1Count >= 1) score += 10;
  else {
    issues.push("No H1 heading found");
    suggestions.push("Add one clear H1 heading");
  }

  if (signals.h2Count >= 1) score += 10;
  else {
    issues.push("No H2 headings found");
    suggestions.push("Add supporting H2 subheadings");
  }

  if (signals.wordCount >= 800) score += 15;
  else if (signals.wordCount < 300) {
    score -= 10;
    issues.push("Very low word count");
    suggestions.push("Expand content depth (800+ words recommended)");
  }

  if (signals.jsonLdPresent) score += 15;
  else {
    issues.push("No JSON-LD structured data found");
    suggestions.push("Add FAQ or Article schema using JSON-LD");
  }

  if (signals.updatedSignalFound) score += 15;
  else {
    issues.push("No visible freshness signal");
    suggestions.push("Add an 'Updated on' or 'Reviewed on' date");
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return { score, issues, suggestions };
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

      const signals = {
        httpStatus: fetched.httpStatus,
        title: extractTitle(fetched.html),
        h1Count: countTag(fetched.html, "h1"),
        h2Count: countTag(fetched.html, "h2"),
        wordCount: text.split(" ").length,
        jsonLdPresent: hasJsonLd(fetched.html),
        updatedSignalFound: detectUpdatedSignal(text),
      };

      const scoring = computeGeoScore(signals);

      await p.ref.update({
        status: "analyzed",
        ...signals,
        geoScore: scoring.score,
        issues: scoring.issues,
        suggestions: scoring.suggestions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      analyzed.push({
        url,
        geoScore: scoring.score,
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
