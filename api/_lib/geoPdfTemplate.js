// api/_lib/geoPdfTemplate.js

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildGeoPdfHtml({
  websiteName,
  websiteUrl,
  generatedOn,
  urls = [],
}) {
  const urlsList = urls
    .slice(0, 10)
    .map((u) => `<li>${escapeHtml(u)}</li>`)
    .join("");

  const remaining = urls.length > 10 ? urls.length - 10 : 0;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AI Readiness Assessment</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      color: #111;
      margin: 0;
      padding: 0;
    }

    .page {
      padding: 40px;
      page-break-after: always;
    }

    h1 {
      font-size: 26px;
      margin-bottom: 12px;
    }

    h2 {
      font-size: 16px;
      margin-top: 24px;
    }

    p, li {
      font-size: 13px;
      line-height: 1.6;
    }

    ul {
      padding-left: 20px;
    }

    .card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 14px;
      margin-top: 10px;
    }

    .watermark {
      position: fixed;
      bottom: 10px;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 10px;
      color: #666;
    }
  </style>
</head>

<body>

<div class="watermark">
  Generated using Vyndow GEO — AI Readiness Assessment
</div>

<!-- PAGE 1 : COVER -->

<div class="page">
  <h1>AI Readiness Assessment</h1>

  <div class="card">
    <p><b>Website Name:</b> ${escapeHtml(websiteName)}</p>
    <p><b>Website URL:</b> ${escapeHtml(websiteUrl)}</p>
    <p><b>Generated on:</b> ${escapeHtml(generatedOn)}</p>
  </div>

  <h2>Pages assessed in this run</h2>

  <div class="card">
    <ul>
      ${urlsList}
    </ul>
    ${remaining ? `<p>+ ${remaining} more pages</p>` : ``}
  </div>
</div>

</body>
</html>
`;
}
