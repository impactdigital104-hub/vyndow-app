import admin from "../firebaseAdmin";
import { buildAuthUrl, encodeState } from "../_lib/gscAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const websiteId = String(req.body?.websiteId || "").trim();
    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    const db = admin.firestore();
    const siteRef = db.doc(`users/${uid}/websites/${websiteId}`);
    const siteSnap = await siteRef.get();

    if (!siteSnap.exists) {
      return res.status(404).json({ ok: false, error: "Website not found." });
    }

    const state = encodeState({ uid, websiteId });
    const authUrl = buildAuthUrl(state);

    return res.status(200).json({ ok: true, authUrl });
  } catch (e) {
    console.error("gsc/startAuth error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to start Google connection." });
  }
}
