// api/_lib/geoPdfGenerator.js

import { chromium } from "playwright";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// fallback PDF (no browser needed)
async function buildFallbackPdfBuffer({ title, lines }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;

  page.drawText(title || "AI Readiness Assessment", {
    x: 50,
    y,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  y -= 30;

  const safeLines = Array.isArray(lines) ? lines : [];
  for (const line of safeLines.slice(0, 80)) {
    page.drawText(String(line || ""), {
      x: 50,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 16;
    if (y < 60) break;
  }

  page.drawText("Generated using Vyndow GEO — AI Readiness Assessment", {
    x: 50,
    y: 30,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function htmlToPdfBuffer(html, fallbackData) {
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
    });

    await browser.close();
    return pdf;
  } catch (e) {
    return await buildFallbackPdfBuffer(fallbackData || {});
  }
}
