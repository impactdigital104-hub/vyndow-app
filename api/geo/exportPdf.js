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
    const html = buildGeoPdfHtml({
      websiteName,
      websiteUrl,
      generatedOn: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      urls,
      exec: {},
      overview: { avgScore: avgScore ?? "—", grade: grade ?? "—" },
      ai: {},
      fixes: {},
      methodology: {},
    });

    // Convert to PDF
    console.log("PDF PATH CHECK: trying HTML->PDF first, fallback only if HTML->PDF fails");
   const pdfBuffer = await htmlToPdfBuffer(html, {
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
