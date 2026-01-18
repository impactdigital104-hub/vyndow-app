// api/geo/worker/process.js

import admin from "../../firebaseAdmin";

// Same auth pattern as /api/geo/run.js
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

function safeTextFromHtml(html) {
  if (!html) return "";
  // Remove scripts/styles then strip tags
  const noScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  const text = noScripts.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function countTag(html, tag) {
  if (!html) return 0;
  const re = new RegExp(`<${tag}(\\s|>)`, "gi");
  const matches = html.match(re);
  return matches ? matches.length : 0;
}

function extractTitle(html) {
  if (!html) return "";
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim().slice(0, 200);
}

function hasJsonLd(html) {
  if (!html) return false;
  return /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
}

function detectUpdatedSignal(text) {
  if (!text) return false;
  return /(updated on|last updated|reviewed on|updated:|last modified)/i.test(text);
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Mildly "browser-like" without being fancy
        "User-Agent":
          "Mozilla/5.0 (compatible; VyndowGEO/1.0; +https://vyndow.com)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = resp.headers.get("content-type") || "";
    const html = await resp.text();

    return {
      ok: resp.ok,
      status: resp.status,
      contentType,
      html,
    };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Auth check (keeps endpoint private)
    await getUidFromRequest(req);

    const db = admin.firestore();
    const batchSize =
      typeof req.body?.batchSize === "number" ? req.body.batchSize : 3;

    // 1) Find the oldest queued run
    const runsSnap = await db
      .collection("geoRuns")
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (runsSnap.empty) {
      return res.status(200).json({
        ok: true,
        message: "No queued runs found.",
        claimedCount: 0,
        analyzedCount: 0,
      });
    }

    const runDoc = runsSnap.docs[0];
    const runId = runDoc.id;

    // 2) Mark run as processing
    await runDoc.ref.set(
      {
        status: "processing",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 3) Claim queued pages for this run (queued -> fetching)
    const pagesRef = db.collection("geoRuns").doc(runId).collection("pages");

    const pagesSnap = await pagesRef
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(batchSize)
      .get();

    if (pagesSnap.empty) {
      return res.status(200).json({
        ok: true,
        runId,
        message: "No queued pages left for this run.",
        claimedCount: 0,
        analyzedCount: 0,
      });
    }

    const claimedPages = [];
    const claimBatch = db.batch();

    for (const p of pagesSnap.docs) {
      const data = p.data() || {};
      const url = data.url || "";
      claimedPages.push({ pageId: p.id, url });

      claimBatch.set(
        p.ref,
        {
          status: "fetching",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await claimBatch.commit();

    // 4) Fetch + extract signals for each claimed page, then mark analyzed
    const analyzedPages = [];

    for (const p of claimedPages) {
      const pageRef = pagesRef.doc(p.pageId);

      if (!p.url) {
        await pageRef.set(
          {
            status: "failed",
            error: "Missing URL on page doc",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        continue;
      }

      try {
        const fetched = await fetchWithTimeout(p.url, 12000);

        const title = extractTitle(fetched.html);
        const h1Count = countTag(fetched.html, "h1");
        const h2Count = countTag(fetched.html, "h2");
        const h3Count = countTag(fetched.html, "h3");

        const text = safeTextFromHtml(fetched.html);
        const wordCount = text ? text.split(" ").filter(Boolean).length : 0;

        const jsonLdPresent = hasJsonLd(fetched.html);
        const updatedSignalFound = detectUpdatedSignal(text);

        await pageRef.set(
          {
            status: "analyzed",
            fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
            httpStatus: fetched.status,
            contentType: fetched.contentType,
            title,
            h1Count,
            h2Count,
            h3Count,
            wordCount,
            jsonLdPresent,
            updatedSignalFound,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        analyzedPages.push({
          pageId: p.pageId,
          url: p.url,
          httpStatus: fetched.status,
          wordCount,
          h1Count,
          h2Count,
          jsonLdPresent,
          updatedSignalFound,
        });
      } catch (err) {
        await pageRef.set(
          {
            status: "failed",
            error: err?.message || "Fetch failed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

    return res.status(200).json({
      ok: true,
      runId,
      claimedCount: claimedPages.length,
      analyzedCount: analyzedPages.length,
      analyzedPages,
    });
  } catch (e) {
    console.error("GEO worker process error:", e);
    return res.status(400).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
