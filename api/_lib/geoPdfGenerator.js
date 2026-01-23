// api/_lib/geoPdfGenerator.js
// Vercel-safe PDF generator: pdf-lib only (no browser, no chromium, no playwright)

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---------- small helpers (simple, safe) ----------
function safeStr(x, fallback = "—") {
  const s = typeof x === "string" ? x : (x == null ? "" : String(x));
  return s.trim() ? s : fallback;
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function wrapText(text, maxChars = 92) {
  const s = safeStr(text, "");
  if (!s) return [""];
  const words = s.split(/\s+/);
  const lines = [];
  let line = "";

  for (const w of words) {
    if (!line) {
      line = w;
      continue;
    }
    if ((line + " " + w).length <= maxChars) {
      line += " " + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [s];
}

function drawWatermark(page, text, font) {
  page.drawText(text, {
    x: 50,
    y: 25,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function drawHeading(page, fontBold, text, x, y) {
  page.drawText(text, {
    x,
    y,
    size: 20,
    font: fontBold,
    color: rgb(0.05, 0.07, 0.16),
  });
  return y - 28;
}

function drawSubheading(page, fontBold, text, x, y) {
  page.drawText(text, {
    x,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.05, 0.07, 0.16),
  });
  return y - 18;
}

function drawPara(page, font, text, x, y, maxChars = 98, lineGap = 14) {
  const lines = wrapText(text, maxChars);
  for (const ln of lines) {
    page.drawText(ln, {
      x,
      y,
      size: 11,
      font,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= lineGap;
  }
  return y;
}

function drawBullets(page, font, bullets, x, y, maxChars = 90, lineGap = 14) {
  const arr = safeArr(bullets).filter(Boolean).slice(0, 8);
  for (const b of arr) {
    const lines = wrapText(String(b), maxChars);
    let first = true;
    for (const ln of lines) {
      page.drawText((first ? "• " : "  ") + ln, {
        x,
        y,
        size: 11,
        font,
        color: rgb(0.07, 0.09, 0.15),
      });
      y -= lineGap;
      first = false;
    }
  }
  return y;
}

function drawKeyValue(page, font, labelFont, pairs, x, y) {
  // simple two-column list
  const labelX = x;
  const valX = x + 140;
  for (const [k, v] of pairs) {
    page.drawText(String(k), {
      x: labelX,
      y,
      size: 11,
      font: labelFont,
      color: rgb(0.2, 0.25, 0.35),
    });
    page.drawText(String(v), {
      x: valX,
      y,
      size: 11,
      font,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= 16;
  }
  return y;
}

function drawSimpleTable(page, font, fontBold, rows, x, y) {
  // rows: [{a,b,c}]
  const colA = x;
  const colB = x + 55;
  const colC = x + 440;

  page.drawText("Key", { x: colA, y, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText("What it means (plain English)", { x: colB, y, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
  page.drawText("Score", { x: colC, y, size: 10, font: fontBold, color: rgb(0.2, 0.25, 0.35) });

  y -= 14;

  const list = safeArr(rows).slice(0, 8);
  for (const r of list) {
    page.drawText(safeStr(r.a, "—"), { x: colA, y, size: 10, font: fontBold, color: rgb(0.07, 0.09, 0.15) });
    const lines = wrapText(safeStr(r.b, "—"), 70);
    page.drawText(safeStr(r.c, "—"), { x: colC, y, size: 10, font, color: rgb(0.07, 0.09, 0.15) });

    // write multi-line middle column
    let yy = y;
    for (const ln of lines.slice(0, 2)) {
      page.drawText(ln, { x: colB, y: yy, size: 10, font, color: rgb(0.07, 0.09, 0.15) });
      yy -= 12;
    }
    y -= Math.max(16, 12 * Math.min(2, lines.length)) + 4;
  }
  return y;
}

// ---------- main export: ALWAYS returns a PDF buffer ----------
export async function htmlToPdfBuffer(_htmlIgnored, report = {}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const wm = "Generated using Vyndow GEO — AI Readiness Assessment";

  const websiteName = safeStr(report.websiteName, "Website");
  const websiteUrl = safeStr(report.websiteUrl, "—");
  const generatedOn = safeStr(report.generatedOn, "—");
  const urls = safeArr(report.urls).slice(0, 12);

  const avgScore = report.avgScore ?? report.overview?.avgScore ?? "—";
  const grade = report.grade ?? report.overview?.grade ?? "—";

  // PAGE 1 — Cover
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;
    y = drawHeading(page, fontBold, "AI Readiness Assessment", 50, y);
    y = drawSubheading(page, fontBold, "Vyndow GEO", 50, y - 4);

    y -= 10;
    y = drawKeyValue(page, font, fontBold, [
      ["Website Name", websiteName],
      ["Website URL", websiteUrl],
      ["Generated on", generatedOn],
    ], 50, y);

    y -= 12;
    y = drawSubheading(page, fontBold, "Pages assessed in this run", 50, y);
    y = drawBullets(page, font, urls, 55, y, 95);

    drawWatermark(page, wm, font);
  }

  // PAGE 2 — Executive Summary (2 paragraphs + 3 + 3 bullets)
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;
    y = drawHeading(page, fontBold, "Executive Summary", 50, y);

    const p1 = safeStr(report.exec?.p1, "This report explains how well your content can be understood and reused by AI systems in plain English.");
    const p2 = safeStr(report.exec?.p2, "Use the fixes section to improve clarity, freshness signals, trust cues (E-E-A-T), and structure so AI can answer customer questions accurately.");

    y = drawPara(page, font, p1, 50, y);
    y = drawPara(page, font, p2, 50, y - 4);

    y -= 8;
    y = drawSubheading(page, fontBold, "Top risks (if you do nothing)", 50, y);
    y = drawBullets(page, font, report.exec?.risks ?? [], 55, y);

    y -= 8;
    y = drawSubheading(page, fontBold, "Top opportunities (fastest wins)", 50, y);
    y = drawBullets(page, font, report.exec?.opps ?? [], 55, y);

    drawWatermark(page, wm, font);
  }

  // PAGE 3 — Overview + A–H + How to read + score bands
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    y = drawHeading(page, fontBold, "GEO Readiness Overview", 50, y);

    page.drawText(`Overall score: ${safeStr(avgScore, "—")} / 100`, {
      x: 50,
      y: y - 6,
      size: 13,
      font: fontBold,
      color: rgb(0.07, 0.09, 0.15),
    });
    page.drawText(`Grade: ${safeStr(grade, "—")}`, {
      x: 360,
      y: y - 6,
      size: 13,
      font: fontBold,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= 28;

    y = drawPara(
      page,
      font,
      safeStr(report.overview?.summary,
        "This score summarizes how clearly AI systems can understand your content and answer real customer questions without guessing."),
      50,
      y
    );

    y -= 8;
    y = drawSubheading(page, fontBold, "A–H snapshot (what drives the score)", 50, y);

    const breakdownRows =
      safeArr(report.overview?.breakdownRows).length
        ? report.overview.breakdownRows
        : [
            { a: "A", b: "Content Quality & Relevance", c: "—" },
            { a: "B", b: "Freshness & Update Signals", c: "—" },
            { a: "C", b: "E-E-A-T (Experience, Expertise, Authority, Trust)", c: "—" },
            { a: "D", b: "On-Page Structure & Semantics", c: "—" },
            { a: "E", b: "Structured Data / Schema", c: "—" },
            { a: "F", b: "Intent & Decision Readiness", c: "—" },
            { a: "G", b: "Entity Coverage & Consistency", c: "—" },
            { a: "H", b: "AI Answer Readiness", c: "—" },
          ];

    // normalize
    const tableRows = breakdownRows.map((r) => ({
      a: r.key || r.a || "—",
      b: r.label || r.b || "—",
      c: r.score ?? r.c ?? "—",
    }));

    y = drawSimpleTable(page, font, fontBold, tableRows, 50, y);
    y -= 4;

    y = drawSubheading(page, fontBold, "How to read this report", 50, y);
    y = drawBullets(page, font, report.overview?.howToRead ?? [
      "Start with the overall score and grade.",
      "Use A–H to find the weakest areas.",
      "Apply Fix #1–#3 first for quickest impact.",
      "Re-run the audit to confirm improvement."
    ], 55, y);

    y -= 6;
    y = drawSubheading(page, fontBold, "What each score band means", 50, y);
    y = drawBullets(page, font, [
      "80–100: Strong — AI can extract key facts clearly and consistently.",
      "60–79: Improving — some answers are clear, but important gaps remain.",
      "Below 60: Needs structured fixes — AI may be vague or miss critical details."
    ], 55, y);

    drawWatermark(page, wm, font);
  }

  // PAGE 4 — AI Answer Readiness (with Strong/Medium/Weak explanation)
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    y = drawHeading(page, fontBold, "AI Answer Readiness", 50, y);

    y = drawPara(page, font,
      safeStr(report.ai?.intro1,
        "This section explains how confidently AI systems can answer common user questions based on your current pages."),
      50, y);

    y = drawPara(page, font,
      safeStr(report.ai?.intro2,
        "Strong means AI can answer clearly without guessing. Medium means AI can answer partially but may miss details. Weak means AI is likely to be vague or incorrect."),
      50, y - 4);

    const totals = report.ai?.totals || { strong: 0, medium: 0, weak: 0 };
    y -= 8;
    page.drawText(`Totals: Strong ${totals.strong}   Medium ${totals.medium}   Weak ${totals.weak}`, {
      x: 50,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.07, 0.09, 0.15),
    });
    y -= 22;

    y = drawSubheading(page, fontBold, "AI can answer confidently when:", 50, y);
    y = drawBullets(page, font, report.ai?.canAnswer ?? [
      "The page clearly states what it offers and who it is for.",
      "Key facts are visible (pricing, scope, steps, location, policies).",
      "Content uses structured sections and explicit entity mentions."
    ], 55, y);

    y -= 8;
    y = drawSubheading(page, fontBold, "AI struggles when:", 50, y);
    y = drawBullets(page, font, report.ai?.struggles ?? [
      "The page is correct but not explicit (AI has to infer).",
      "No clear freshness / last-updated signals exist.",
      "Trust cues are missing (author, credentials, references, proof)."
    ], 55, y);

    drawWatermark(page, wm, font);
  }

  // PAGE 5 — Recommended Fixes (each fix includes “Why this matters”)
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    y = drawHeading(page, fontBold, "Recommended Fixes", 50, y);

    y = drawPara(page, font,
      safeStr(report.fixes?.intro,
        "Below are recommended fixes that improve AI extraction, reduce ambiguity, and make your pages more answerable."),
      50, y);

    y -= 6;

    const items = safeArr(report.fixes?.items).slice(0, 5);
    const fallbackItems = [
      {
        title: "Add a clear ‘Last updated’ date and update notes",
        why: "AI trusts content more when it can see it is current. Without freshness signals, AI may ignore the page for time-sensitive queries.",
        do: "Use Vyndow GEO fixes to add a visible ‘Last updated’ line near the top, and ensure dates reflect real edits.",
        where: "Improves score area B (Freshness & Update Signals).",
      },
      {
        title: "Add a short ‘What this page answers’ summary",
        why: "AI answers best when the page explicitly states what it covers in 3–5 lines. Otherwise, it may produce vague summaries.",
        do: "Insert a short summary under the main heading using the recommended patch output.",
        where: "Improves A (Content), D (Structure), H (AI Answer Readiness).",
      },
      {
        title: "Strengthen trust signals (E-E-A-T)",
        why: "AI needs proof: who wrote it, why they’re credible, and what supports key claims. This increases answer confidence.",
        do: "Add author/organization credentials, references, customer proof, and clear policies where relevant.",
        where: "Improves C (E-E-A-T) and H (AI Answer Readiness).",
      },
    ];
    const list = items.length ? items : fallbackItems;

    let idx = 1;
    for (const f of list) {
      y = drawSubheading(page, fontBold, `Fix #${idx}: ${safeStr(f.title, "—")}`, 50, y);
      y = drawPara(page, fontBold, "Why this matters:", 50, y);
      y = drawPara(page, font, safeStr(f.why, "—"), 65, y + 2, 92);

      y = drawPara(page, fontBold, "What to do in Vyndow GEO:", 50, y - 2);
      y = drawPara(page, font, safeStr(f.do, "—"), 65, y + 2, 92);

      y = drawPara(page, fontBold, "Where it shows up:", 50, y - 2);
      y = drawPara(page, font, safeStr(f.where, "—"), 65, y + 2, 92);

      y -= 8;
      idx += 1;

      // safety if content is long (keep on same page only)
      if (y < 120) break;
    }

    drawWatermark(page, wm, font);
  }

  // PAGE 6 — Methodology + Disclaimer + About Vyndow
  {
    const page = pdfDoc.addPage([595.28, 841.89]);
    let y = 790;

    y = drawHeading(page, fontBold, "Methodology", 50, y);
    y = drawBullets(page, font, report.methodology?.method ?? [
      "Vyndow GEO analyzes pages for clarity, structure, freshness, trust cues, and entity coverage.",
      "It evaluates how easily AI systems can extract facts and answer real user questions.",
      "Scores are directional and designed to guide practical improvements."
    ], 55, y);

    y -= 10;
    y = drawHeading(page, fontBold, "Disclaimer", 50, y);
    y = drawBullets(page, font, report.methodology?.disclaimer ?? [
      "This report is advisory and does not guarantee rankings or traffic outcomes.",
      "AI platform behavior can vary by model and may change over time.",
      "Always review and validate content changes before publishing."
    ], 55, y);

    y -= 10;
    y = drawHeading(page, fontBold, "About Vyndow", 50, y);
    y = drawPara(page, font,
      safeStr(
        report.methodology?.about,
        "Vyndow.com is an AI-augmented digital marketing suite built to help teams plan, create, optimize, and improve digital performance. It includes modules such as Vyndow SEO, Vyndow GEO, Vyndow Social, Vyndow ABM, Vyndow Analytics, Vyndow GTM, and Vyndow CMO — designed to make modern marketing faster, clearer, and more measurable."
      ),
      50,
      y,
      98
    );

    drawWatermark(page, wm, font);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
