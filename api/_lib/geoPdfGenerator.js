// api/_lib/geoPdfGenerator.js

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Fallback PDF (no browser needed)
async function buildFallbackPdfBuffer({ title, lines }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
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

  // watermark
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
  // Try browser-based PDF first
  try {
    const isVercel = !!process.env.VERCEL;

    const browser = await puppeteer.launch({
      args: isVercel ? chromium.args : ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: chromium.defaultViewport,
      executablePath: isVercel ? await chromium.executablePath() : undefined,
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
      });

      return pdfBuffer;
    } finally {
      await browser.close();
    }
  } catch (e) {
    // If browser launch fails on Vercel (like libnss3 missing), use fallback
    return await buildFallbackPdfBuffer(fallbackData || {});
  }
}
