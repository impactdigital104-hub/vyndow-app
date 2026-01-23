// api/geo/exportPdf.js

import admin from "../firebaseAdmin";
import { buildGeoPdfHtml } from "../_lib/geoPdfTemplate";
import { htmlToPdfBuffer } from "../_lib/geoPdfGenerator";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

async function resolveWebsiteContext({ uid, websiteId }) {
  const db = admin.firestore();

  const userWebsiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
  const userWebsiteSnap = await userWebsiteRef.get();

  if (userWebsiteSnap.exists) {
    const websiteData = userWebsiteSnap.data() || {};
    return { ownerUid: (websiteData.ownerUid || uid).trim() };
  }

  // fallback: check if user is a member of owner's website
  // we try to find the website under the ownerUid in the run doc later
  return { ownerUid: uid };
}

function safeAvg(nums) {
  const arr = nums.filter((n) => typeof n === "number" && !Number.isNaN(n));
  if (!arr.length) return null;
  const sum = arr.reduce((a, b) => a + b, 0);
  return Math.round((sum / arr.length) * 10) / 10;
}

function gradeFromScore(score) {
  if (typeof score !== "number") return null;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export default async function handler(req, res) {
  console.log("EXPORT PDF BODY:", req.body);
console.log("EXPORT PDF QUERY:", req.query);

  try {
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const body = req.body || {};
    const runId = body.runId;
    const websiteId = body.websiteId;

    if (!runId) return res.status(400).json({ ok: false, error: "Missing runId" });
    if (!websiteId) return res.status(400).json({ ok: false, error: "Missing websiteId" });

    const db = admin.firestore();

    // Load run
    const runRef = db.doc(`geoRuns/${runId}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) return res.status(404).json({ ok: false, error: "RUN_NOT_FOUND" });

    const run = runSnap.data() || {};

    // Determine ownerUid (from website context OR from run doc)
    let { ownerUid } = await resolveWebsiteContext({ uid, websiteId });
    if (run.ownerUid) ownerUid = run.ownerUid;

    // Security check
    if (run.websiteId !== websiteId) {
      return res.status(403).json({ ok: false, error: "NO_ACCESS_TO_RUN" });
    }

    // Load pages in run
    const pagesSnap = await runRef.collection("pages").orderBy("createdAt", "asc").get();
    const pages = pagesSnap.docs.map((d) => d.data() || {});

    const urls = pages.map((p) => p.url || "").filter(Boolean);

    const avgScore = safeAvg(pages.map((p) => (typeof p.geoScore === "number" ? p.geoScore : null)));
    const grade = gradeFromScore(avgScore);

    // Website read (read-only)
    const siteSnap = await db.doc(`users/${ownerUid}/websites/${websiteId}`).get();
    const site = siteSnap.exists ? siteSnap.data() || {} : {};
    const websiteName = site.name || "Website";
   let websiteUrl = site.domain ? `https://${site.domain}` : (site.url || "—");
if (websiteUrl.startsWith("https://https://")) websiteUrl = websiteUrl.replace("https://https://", "https://");
if (websiteUrl.startsWith("http://http://")) websiteUrl = websiteUrl.replace("http://http://", "http://");


    // Build HTML (currently only cover page)
const report = {
  websiteName,
  websiteUrl,
  generatedOn: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
  urls,

  exec: {
    p1:
      "This AI Readiness Assessment summarizes how easily AI systems can understand your content and answer real user questions accurately.",
    p2:
      "Your next gains will come from making key facts more explicit, improving freshness signals, strengthening trust cues (E-E-A-T), and adding structured sections that reduce ambiguity.",
    risks: [
      "AI may produce vague or incomplete answers about your offerings.",
      "Important pages may be skipped in AI summaries due to missing clarity or structure.",
      "You may lose visibility in AI-driven discovery vs better-structured competitors.",
    ],
    opps: [
      "Structured fixes can quickly improve AI answerability on priority pages.",
      "Clear entity + freshness signals help AI trust the content more.",
      "Better formatting improves both human readability and machine extraction.",
    ],
  },

  overview: {
    avgScore: avgScore ?? "—",
    grade: grade ?? "—",
    breakdownRows: [
      { key: "A", label: "Content Quality & Relevance", score: "—" },
      { key: "B", label: "Freshness & Update Signals", score: "—" },
      { key: "C", label: "E-E-A-T (Experience, Expertise, Authority, Trust)", score: "—" },
      { key: "D", label: "On-Page Structure & Semantics", score: "—" },
      { key: "E", label: "Structured Data / Schema", score: "—" },
      { key: "F", label: "Intent & Decision Readiness", score: "—" },
      { key: "G", label: "Entity Coverage & Internal Consistency", score: "—" },
      { key: "H", label: "AI Answer Readiness", score: "—" },
    ],
    howToRead: [
      "Start with the overall score and grade to understand the current readiness level.",
      "Use the A–H snapshot to identify which areas are weakest.",
      "Go to ‘Recommended Fixes’ and apply Fix #1–#3 first (fastest impact).",
      "Re-run the audit after updates to confirm scores improved.",
    ],
  },

  ai: {
    intro1:
      "This section explains how confidently AI systems can answer common questions based on your current pages.",
    intro2:
      "Strong means AI can answer clearly without guessing. Medium means AI can answer partially but may miss details. Weak means AI is likely to be vague or incorrect.",
    totals: { strong: 0, medium: 0, weak: 0 },
    tableRows: [
      {
        q: "What is this page about?",
        strong: 0,
        medium: 0,
        weak: 0,
        note: "AI needs explicit summaries and clear headings to answer confidently.",
      },
      {
        q: "What is offered and for whom?",
        strong: 0,
        medium: 0,
        weak: 0,
        note: "AI performs better when offerings, audience, and scope are clearly stated.",
      },
      {
        q: "Why should someone trust this?",
        strong: 0,
        medium: 0,
        weak: 0,
        note: "AI needs proof signals like author info, credentials, references, and updates.",
      },
    ],
    canAnswer: [
      "The page clearly states the topic and main offer.",
      "Key facts are easy to locate (pricing, scope, features, steps).",
      "The page uses structured sections and explicit entity mentions.",
    ],
    struggles: [
      "Content is correct but not explicit (AI must infer too much).",
      "No clear freshness or update signals.",
      "Weak trust cues (missing author, sources, experience proof, policies).",
    ],
  },

  fixes: {
    intro:
      "Below are recommended fixes that improve AI extraction, reduce ambiguity, and make your pages more answerable.",
    items: [
      {
        title: "Add a clear ‘Last updated’ date and update notes",
        why:
          "AI trusts content more when it can see it is current. Without freshness signals, AI may down-rank or ignore the page for time-sensitive queries.",
        do:
          "Use the generated patch to add a visible ‘Last updated’ line near the top, and ensure dates match real edits.",
        where:
          "This improves score area B (Freshness & Update Signals).",
      },
      {
        title: "Add a short ‘What this page answers’ summary",
        why:
          "AI answers best when the page explicitly states what it covers in 3–5 lines. Otherwise, it may produce vague summaries.",
        do:
          "Use Vyndow GEO ‘Generate Fix’ and insert the suggested summary section under the main heading.",
        where:
          "Improves A (Content Quality), D (Structure), H (AI Answer Readiness).",
      },
      {
        title: "Strengthen trust signals (E-E-A-T)",
        why:
          "AI needs proof: who wrote it, why they’re credible, and what sources support claims. This reduces hallucinations and increases confidence.",
        do:
          "Add author/organization credentials, references, customer proof, and clear policies where relevant.",
        where:
          "Improves C (E-E-A-T) and H (AI Answer Readiness).",
      },
    ],
  },

  methodology: {
    method: [
      "Vyndow GEO analyzes pages for clarity, structure, freshness, trust cues, and entity coverage.",
      "It then evaluates how easily AI systems can extract facts and answer common user questions.",
      "Scores are directional and designed to guide practical improvements, not replace human review.",
    ],
    disclaimer: [
      "This report is advisory and does not guarantee rankings or traffic outcomes.",
      "AI platform behavior can vary by model and may change over time.",
      "Always review and validate content changes before publishing.",
    ],
    about:
      "Vyndow.com is an AI-augmented digital marketing suite built to help teams plan, create, optimize, and improve digital performance. It includes modules such as Vyndow SEO, Vyndow GEO, Vyndow Social, Vyndow ABM, Vyndow Analytics, Vyndow GTM, and Vyndow CMO — designed to make modern marketing faster, clearer, and more measurable.",
  },
};


    // Convert to PDF
    console.log("PDF PATH CHECK: trying HTML->PDF first, fallback only if HTML->PDF fails");
const pdfBuffer = await htmlToPdfBuffer(null, report);
  title: "AI Readiness Assessment",
  lines: [
    `Website Name: ${websiteName}`,
    `Website URL: ${websiteUrl}`,
    `Generated on: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    "",
    "Pages assessed in this run:",
    ...urls.slice(0, 40),
  ],
});


    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="AI-Readiness-Assessment-${websiteId}-${runId}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error("Export PDF error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Export PDF failed" });
  }
}
