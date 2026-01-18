// /api/geo/runDetail.js
import admin from "../firebaseAdmin";

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
  if (!userWebsiteSnap.exists) {
    const err = new Error("Website not found for this user.");
    err.code = "WEBSITE_NOT_FOUND";
    throw err;
  }

  const websiteData = userWebsiteSnap.data() || {};
  const ownerUid = (websiteData.ownerUid || uid).trim();

  if (ownerUid !== uid) {
    const memberRef = db.doc(
      `users/${ownerUid}/websites/${websiteId}/members/${uid}`
    );
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { websiteId, runId } = req.body || {};

    if (!websiteId) return res.status(400).json({ ok: false, error: "Missing websiteId" });
    if (!runId) return res.status(400).json({ ok: false, error: "Missing runId" });

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const db = admin.firestore();
    const runRef = db.doc(`geoRuns/${runId}`);
    const runSnap = await runRef.get();

    if (!runSnap.exists) {
      return res.status(404).json({ ok: false, error: "RUN_NOT_FOUND" });
    }

    const run = runSnap.data() || {};

    // Hard security: ensure this run belongs to this owner+website
    if (run.ownerUid !== ownerUid || run.websiteId !== websiteId) {
      return res.status(403).json({ ok: false, error: "NO_ACCESS_TO_RUN" });
    }

const pagesSnap = await runRef.collection("pages").orderBy("createdAt", "asc").get();
const pages = pagesSnap.docs.map((d) => {
  const p = d.data() || {};
  return {
    pageId: d.id,
    url: p.url || "",
    status: p.status || "unknown",

    // ✅ These are the missing audit fields (needed for View Audit + GEO Score column)
    geoScore: typeof p.geoScore === "number" ? p.geoScore : null,
    issues: Array.isArray(p.issues) ? p.issues : [],
    suggestions: Array.isArray(p.suggestions) ? p.suggestions : [],

    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
  };
});


    return res.status(200).json({
      ok: true,
      run: {
        runId,
        ownerUid: run.ownerUid,
        websiteId: run.websiteId,
        createdByUid: run.createdByUid || null,
        month: run.month || null,
        pagesCount: Number(run.pagesCount || 0),
        status: run.status || "unknown",
        createdAt: run.createdAt || null,
        updatedAt: run.updatedAt || null,
      },
      pages,
    });
  } catch (e) {
    console.error("GEO run detail error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
