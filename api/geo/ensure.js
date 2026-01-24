// /api/geo/ensure.js
import admin from "../firebaseAdmin";
import { ensureWebsiteGeoModule } from "../geoModuleProvision";

// Same auth pattern as /api/generate.js
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// Same website ownership/membership model as /api/generate.js
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
  const ownerUid = (websiteData.ownerUid || uid).trim(); // fallback for owner-created sites

  // If collaborator, verify membership in owner site
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

  return { ownerUid, websiteData };
}

export default async function handler(req, res) {
  try {
    // Allow OPTIONS (some setups send it) and allow GET as a safe fallback
    if (req.method === "OPTIONS") {
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }


    const uid = await getUidFromRequest(req);

    const websiteId =
      req.method === "GET" ? req.query?.websiteId : (req.body?.websiteId || "");

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId" });
    }

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const ensured = await ensureWebsiteGeoModule({ admin, ownerUid, websiteId });

    return res.status(200).json({
      ok: true,
      ownerUid,
      websiteId,
      module: ensured.data || {},
    });
  } catch (e) {
    console.error("GEO ensure error:", e);
    return res
      .status(400)
      .json({ ok: false, error: e?.message || "Unknown error" });
  }
}
