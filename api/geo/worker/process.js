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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Auth check (keeps this endpoint private)
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

    // 3) Claim queued pages for this run
    const pagesRef = db.collection("geoRuns").doc(runId).collection("pages");

    const pagesSnap = await pagesRef
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(batchSize)
      .get();

    if (pagesSnap.empty) {
      // If no pages are queued, finish the run safely
      await runDoc.ref.set(
        {
          status: "completed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({
        ok: true,
        runId,
        message: "Run had no queued pages; marked completed.",
        claimedCount: 0,
        claimedPages: [],
      });
    }

    const claimedPages = [];
    const batch = db.batch();

    for (const p of pagesSnap.docs) {
      const data = p.data() || {};
      claimedPages.push({ pageId: p.id, url: data.url || "" });

      batch.set(
        p.ref,
        {
          status: "fetching",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    return res.status(200).json({
      ok: true,
      runId,
      claimedCount: claimedPages.length,
      claimedPages,
    });
  } catch (e) {
    console.error("GEO worker process error:", e);
    return res.status(400).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
