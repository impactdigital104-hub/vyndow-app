// api/_lib/geoPdfGenerator.js

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
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
    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
    });

    await browser.close();
    return pdf;
  } catch (e) {
    // IMPORTANT: if browser fails, we fall back instead of breaking the product
    console.error("htmlToPdfBuffer failed; using fallback PDF:", e);
    return await buildFallbackPdfBuffer(fallbackData || {});
  }
}
