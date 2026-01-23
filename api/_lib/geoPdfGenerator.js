// api/_lib/geoPdfGenerator.js

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export async function htmlToPdfBuffer(html) {
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
}
