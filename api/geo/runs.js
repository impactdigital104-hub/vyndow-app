// api/geo/runs.js
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
    const { websiteId } = req.body || {};

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId" });
    }

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const db = admin.firestore();

    const snap = await db
      .collection("geoRuns")
      .where("ownerUid", "==", ownerUid)
      .where("websiteId", "==", websiteId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const runs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.status(200).json({ ok: true, ownerUid, websiteId, runs });
  } catch (e) {
    console.error("GEO runs list error:", e);
    return res.status(400).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
