
// api/websites/updateProfile.js
import admin from "../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2) Validate inputs
    const websiteId = (req.body?.websiteId || "").trim();
    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    const profile = req.body?.profile || {};

    // 3) Allow ONLY these fields to be updated
    // (Your rule: geoTarget + industry are locked at website level, so they are allowed here.
    // They will still remain locked on /seo UI.)
    const allowed = {
      brandDescription: typeof profile.brandDescription === "string" ? profile.brandDescription : "",
      targetAudience: typeof profile.targetAudience === "string" ? profile.targetAudience : "",
      toneOfVoice: Array.isArray(profile.toneOfVoice) ? profile.toneOfVoice : [],
      readingLevel: typeof profile.readingLevel === "string" ? profile.readingLevel : "",
      geoTarget: typeof profile.geoTarget === "string" ? profile.geoTarget : "",
      industry: typeof profile.industry === "string" ? profile.industry : "general",
    };

    // 4) Write ONLY under the signed-in user's own website doc
    const db = admin.firestore();
    const siteRef = db.doc(`users/${uid}/websites/${websiteId}`);

    // Ensure website exists (and belongs to user, by path)
    const snap = await siteRef.get();
    if (!snap.exists) {
      return res.status(404).json({ ok: false, error: "Website not found." });
    }

    await siteRef.set(
      {
        profile: allowed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Update profile failed:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Update profile failed." });
  }
}
