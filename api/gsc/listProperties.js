import admin from "../firebaseAdmin";
import {
  listSearchConsoleSites,
  normalizeDomainLike,
  propertyMatchesWebsite,
} from "../_lib/gscAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(200).json({ ok: true, message: "Use GET." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const websiteId = String(req.query?.websiteId || "").trim();
    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    const db = admin.firestore();
    const siteSnap = await db.doc(`users/${uid}/websites/${websiteId}`).get();
    if (!siteSnap.exists) {
      return res.status(404).json({ ok: false, error: "Website not found." });
    }

    const tokenSnap = await db.doc(`users/${uid}/integrations/google/searchConsole`).get();
    if (!tokenSnap.exists) {
      return res.status(400).json({ ok: false, error: "Google Search Console is not connected yet." });
    }

    const tokenData = tokenSnap.data() || {};
    const tokens = {
      refresh_token: tokenData.refreshToken || undefined,
      access_token: tokenData.accessToken || undefined,
      expiry_date: tokenData.expiryDate || undefined,
    };

    const siteData = siteSnap.data() || {};
    const websiteDomain = siteData.domain || "";
    const normalizedWebsite = normalizeDomainLike(websiteDomain);

    const properties = await listSearchConsoleSites(tokens);

    const rows = properties.map((entry) => ({
      propertyValue: entry.siteUrl,
      permissionLevel: entry.permissionLevel,
      matchesWebsite: propertyMatchesWebsite(websiteDomain, entry.siteUrl),
      normalizedProperty: normalizeDomainLike(entry.siteUrl),
    }));

    return res.status(200).json({
      ok: true,
      websiteDomain,
      normalizedWebsite,
      properties: rows,
    });
  } catch (e) {
    console.error("gsc/listProperties error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to load Search Console properties." });
  }
}
