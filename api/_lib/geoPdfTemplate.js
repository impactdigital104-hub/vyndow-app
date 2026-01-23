// api/_lib/geoPdfTemplate.js

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

export function buildGeoPdfHtml({
  websiteName = "Website",
  websiteUrl = "—",
  generatedOn = "—",
  urls = [],

  exec = { p1: "", p2: "", risks: [], opps: [] },

  overview = {
    avgScore: "—",
    grade: "—",
    breakdownRows: [], // [{key,label,score}]
    howToRead: [], // [string]
  },

  ai = {
    intro1: "",
    intro2: "",
    totals: { strong: 0, medium: 0, weak: 0 },
    tableRows: [], // [{q,strong,medium,weak,note}]
    canAnswer: [],
    struggles: [],
  },

  fixes = {
    intro: "",
    items: [], // [{title, why, do, where}]
  },

  methodology = {
    method: [],
    disclaimer: [],
    about: "",
  },
} = {}) {
  const urlsList = safeArr(urls)
    .slice(0, 12)
    .map((u) => `<li>${escapeHtml(u)}</li>`)
    .join("");

  const remaining = Math.max(0, safeArr(urls).length - 12);

  const breakdownTable = safeArr(overview.breakdownRows)
    .map(
      (r) => `
      <tr>
        <td class="k"><b>${escapeHtml(r.key)}</b></td>
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${escapeHtml(r.score)}</td>
      </tr>`
    )
    .join("");

  const howToReadList = safeArr(overview.howToRead)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const risksList = safeArr(exec.risks)
    .slice(0, 3)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const oppsList = safeArr(exec.opps)
    .slice(0, 3)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const aiRows = safeArr(ai.tableRows)
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.q)}</td>
        <td class="num">${escapeHtml(r.strong)}</td>
        <td class="num">${escapeHtml(r.medium)}</td>
        <td class="num">${escapeHtml(r.weak)}</td>
        <td>${escapeHtml(r.note)}</td>
      </tr>`
    )
    .join("");

  const canAnswerList = safeArr(ai.canAnswer)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const strugglesList = safeArr(ai.struggles)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const fixItems = safeArr(fixes.items)
    .slice(0, 8)
    .map(
      (f, idx) => `
      <div class="fix">
        <div class="fix-title">Fix #${idx + 1}: ${escapeHtml(f.title)}</div>

        <div class="fix-row">
          <div class="fix-label">Why this matters</div>
          <div class="fix-text">${escapeHtml(f.why)}</div>
        </div>

        <div class="fix-row">
          <div class="fix-label">What to do in Vyndow GEO</div>
          <div class="fix-text">${escapeHtml(f.do)}</div>
        </div>

        <div class="fix-row">
          <div class="fix-label">Where it shows up</div>
          <div class="fix-text">${escapeHtml(f.where)}</div>
        </div>
      </div>
    `
    )
    .join("");

  const methodList = safeArr(methodology.method)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const disclaimerList = safeArr(methodology.disclaimer)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");

  const watermark = `Generated using Vyndow GEO — AI Readiness Assessment`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AI Readiness Assessment</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      background: #ffffff;
    }

    .page { padding: 40px 44px; }
    .page-break { page-break-after: always; }

    .brand { font-weight: 900; color: #2d1b69; font-size: 12px; letter-spacing: 0.2px; }
    h1 { margin: 10px 0 8px 0; font-size: 26px; }
    h2 { margin: 18px 0 10px 0; font-size: 16px; }
    p { margin: 8px 0; line-height: 1.55; font-size: 12.5px; }
    ul { margin: 8px 0 0 18px; padding: 0; font-size: 12.5px; line-height: 1.55; }
    .muted { color: #334155; opacity: 0.9; }

    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px;
      background: #fff;
    }

    .kv {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 8px 12px;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .kv div { padding: 1px 0; }

    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .k { width: 46px; }

    .scorebox { display: flex; gap: 10px; align-items: baseline; }
    .score { font-size: 30px; font-weight: 900; }
    .grade {
      font-size: 12px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #f8fafc;
    }

    .band {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px;
      background: #ffffff;
    }
    .band ul { margin-top: 6px; }

    .fix {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px;
      margin: 10px 0;
      background: #fff;
    }
    .fix-title { font-weight: 900; margin-bottom: 8px; }
    .fix-row { display: grid; grid-template-columns: 160px 1fr; gap: 10px; margin-top: 8px; }
    .fix-label { font-weight: 800; font-size: 12px; color: #111827; }
    .fix-text { font-size: 12.5px; line-height: 1.5; color: #111827; }

    .footer-wm {
      position: fixed;
      bottom: 10px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 10px;
      color: #6b7280;
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="footer-wm">${escapeHtml(watermark)}</div>

  <!-- PAGE 1: COVER -->
  <div class="page page-break">
    <div class="brand">Vyndow GEO</div>
    <h1>AI Readiness Assessment</h1>

    <div class="card" style="margin-top: 12px;">
      <div class="kv">
        <div class="muted"><b>Website Name</b></div><div>${escapeHtml(websiteName)}</div>
        <div class="muted"><b>Website URL</b></div><div>${escapeHtml(websiteUrl)}</div>
        <div class="muted"><b>Generated on</b></div><div>${escapeHtml(generatedOn)}</div>
      </div>
    </div>

    <h2 style="margin-top: 18px;">Pages assessed in this run</h2>
    <div class="card">
      <ul>${urlsList}</ul>
      ${remaining > 0 ? `<p class="muted" style="margin-top: 10px;">+ ${remaining} more</p>` : ``}
    </div>

    <p class="muted" style="margin-top: 14px;">
      This report is designed for non-technical teams. It explains what the scores mean in plain English and what to fix next.
    </p>
  </div>

  <!-- PAGE 2: EXECUTIVE SUMMARY -->
  <div class="page page-break">
    <h2>Executive Summary</h2>
    <div class="card">
      <p>${escapeHtml(exec.p1)}</p>
      <p>${escapeHtml(exec.p2)}</p>

      <div class="split" style="margin-top: 10px;">
        <div>
          <p><b>Top risks (what may go wrong if you do nothing)</b></p>
          <ul>${risksList}</ul>
        </div>
        <div>
          <p><b>Top opportunities (what improves fastest)</b></p>
          <ul>${oppsList}</ul>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 3: GEO OVERVIEW + HOW TO READ -->
  <div class="page page-break">
    <h2>GEO Readiness Overview</h2>

    <div class="card">
      <div class="scorebox">
        <div class="score">${escapeHtml(overview.avgScore)}</div>
        <div class="muted">/ 100</div>
        <div class="grade">Grade: ${escapeHtml(overview.grade)}</div>
      </div>

      <p class="muted" style="margin-top: 10px;">
        This score summarizes how clearly AI systems can understand your content and answer real customer questions without guessing.
      </p>
    </div>

    <h2>A–H Snapshot (what drives the overall score)</h2>
    <table>
      <thead>
        <tr>
          <th class="k">Key</th>
          <th>What it measures (plain English)</th>
          <th class="num">Score</th>
        </tr>
      </thead>
      <tbody>${breakdownTable}</tbody>
    </table>

    <h2>How to read this report</h2>
    <div class="card">
      <ul>${howToReadList}</ul>
    </div>

    <h2>What each score band means</h2>
    <div class="split">
      <div class="band">
        <p><b>80–100: Strong</b></p>
        <ul>
          <li>AI can extract key facts clearly and consistently.</li>
          <li>Pages are structured and reduce ambiguity.</li>
          <li>You can focus on refining and scaling what works.</li>
        </ul>
      </div>
      <div class="band">
        <p><b>60–79: Improving</b></p>
        <ul>
          <li>Some answers are clear, but gaps remain.</li>
          <li>Different pages may perform unevenly.</li>
          <li>Fixes in this report usually lift results quickly.</li>
        </ul>
      </div>
    </div>
    <div class="band" style="margin-top: 12px;">
      <p><b>Below 60: Needs structured fixes</b></p>
      <ul>
        <li>AI may miss important details or respond vaguely.</li>
        <li>Content may be correct, but not explicit enough for machines.</li>
        <li>Applying the recommended fixes is the fastest path to improvement.</li>
      </ul>
    </div>
  </div>

  <!-- PAGE 4: AI ANSWER READINESS -->
  <div class="page page-break">
    <h2>AI Answer Readiness</h2>

    <div class="card">
      <p>${escapeHtml(ai.intro1)}</p>
      <p>${escapeHtml(ai.intro2)}</p>

      <p class="muted" style="margin-top: 10px;">
        Totals across questions and pages: <b>Strong</b> ${escapeHtml(ai.totals.strong)} &nbsp;&nbsp;
        <b>Medium</b> ${escapeHtml(ai.totals.medium)} &nbsp;&nbsp;
        <b>Weak</b> ${escapeHtml(ai.totals.weak)}
      </p>
    </div>

    <h2>Question-by-question summary</h2>
    <table>
      <thead>
        <tr>
          <th>Question</th>
          <th class="num">Strong</th>
          <th class="num">Medium</th>
          <th class="num">Weak</th>
          <th>What this indicates (plain English)</th>
        </tr>
      </thead>
      <tbody>${aiRows}</tbody>
    </table>

    <h2>What AI can answer vs where it struggles</h2>
    <div class="split">
      <div class="card">
        <p><b>AI can answer confidently when:</b></p>
        <ul>${canAnswerList}</ul>
      </div>
      <div class="card">
        <p><b>AI struggles when:</b></p>
        <ul>${strugglesList}</ul>
      </div>
    </div>
  </div>

  <!-- PAGE 5: RECOMMENDED FIXES -->
  <div class="page page-break">
    <h2>Recommended Fixes</h2>
    <div class="card">
      <p>${escapeHtml(fixes.intro)}</p>
      <p class="muted" style="margin-top: 10px;">
        Each fix below explains why it matters in plain English, and what to do inside Vyndow GEO.
      </p>
    </div>

    ${fixItems}

    <p class="muted" style="margin-top: 10px;">
      Tip: Start with Fix #1–#3 first. They usually produce the fastest improvement in AI answerability.
    </p>
  </div>

  <!-- PAGE 6: METHODOLOGY + DISCLAIMER + ABOUT -->
  <div class="page">
    <h2>Methodology</h2>
    <div class="card">
      <ul>${methodList}</ul>
    </div>

    <h2>Disclaimer</h2>
    <div class="card">
      <ul>${disclaimerList}</ul>
    </div>

    <h2>About Vyndow</h2>
    <div class="card">
      <p>${escapeHtml(methodology.about)}</p>
    </div>
  </div>

</body>
</html>`;
}
