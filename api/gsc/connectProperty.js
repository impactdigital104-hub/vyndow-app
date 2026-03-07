import admin from "../firebaseAdmin";
import {
  getPropertyType,
  normalizeDomainLike,
  propertyMatchesWebsite,
} from "../_lib/gscAuth";

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
    const propertyValue = String(req.body?.propertyValue || "").trim();

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }
    if (!propertyValue) {
      return res.status(400).json({ ok: false, error: "Please choose a Search Console property." });
    }

    const db = admin.firestore();
    const siteRef = db.doc(`users/${uid}/websites/${websiteId}`);
    const siteSnap = await siteRef.get();
    if (!siteSnap.exists) {
      return res.status(404).json({ ok: false, error: "Website not found." });
    }

    const siteData = siteSnap.data() || {};
    const websiteDomain = siteData.domain || "";

    if (!propertyMatchesWebsite(websiteDomain, propertyValue)) {
      return res.status(400).json({
        ok: false,
        error:
          "The selected Google Search Console property does not match the website added in Vyndow. Please connect the correct property.",
      });
    }

    const gscRef = db.doc(`users/${uid}/websites/${websiteId}/integrations/gsc`);
    await gscRef.set(
      {
        connected: true,
        propertyValue,
        propertyType: getPropertyType(propertyValue),
        matchedDomain: normalizeDomainLike(websiteDomain),
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("gsc/connectProperty error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to save Search Console property." });
  }
}
