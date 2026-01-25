
// api/websites/create.js
import admin from "../firebaseAdmin";
import { planDefaults } from "../seoModuleProvision";


export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2) Validate inputs
    const name = (req.body?.name || "").trim();
    const domain = (req.body?.domain || "").trim().toLowerCase();

    if (!name || !domain) {
      return res
        .status(400)
        .json({ ok: false, error: "Name and domain are required." });
    }

    const db = admin.firestore();

    // 3) Ensure user doc exists (Plan A: user doc stored explicitly)
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set(
        {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 4) Ensure SEO module doc exists (default free plan)
    const seoRef = db.doc(`users/${uid}/modules/seo`);
    const seoSnap = await seoRef.get();

    if (!seoSnap.exists) {
      await seoRef.set(
        {
          plan: "free",
          websitesIncluded: 1,
          extraWebsitesPurchased: 0,
          blogsPerWebsitePerMonth: 2,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Re-read SEO module for enforcement
const seoNowSnap = await seoRef.get();
const seo = seoNowSnap.exists ? seoNowSnap.data() : {};
const websitesIncluded = seo?.websitesIncluded ?? 1;
const seoExtraWebsitesPurchased = seo?.extraWebsitesPurchased ?? 0;

// GEO extra websites (account-level capacity)
const geoRef = db.doc(`users/${uid}/modules/geo`);
const geoSnap = await geoRef.get();
const geo = geoSnap.exists ? geoSnap.data() : {};
const geoExtraWebsitesPurchased = geo?.extraWebsitesPurchased ?? 0;

// ✅ total account-level websites allowed
const allowedWebsites =
  websitesIncluded +
  seoExtraWebsitesPurchased +
  geoExtraWebsitesPurchased;


    // 5) Count current websites
    const sitesCol = db.collection(`users/${uid}/websites`);
    const sitesSnap = await sitesCol.get();
    const currentCount = sitesSnap.size;

    if (currentCount >= allowedWebsites) {
      return res.status(403).json({
        ok: false,
        error: "WEBSITE_LIMIT_REACHED",
        details: `Allowed: ${allowedWebsites}, current: ${currentCount}`,
      });
    }

    // 6) Create website doc
    const newRef = await sitesCol.add({
      name,
      domain,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      profile: {
        brandDescription: "",
        targetAudience: "",
        toneOfVoice: [],
        readingLevel: "",
        geoTarget: "",
        industry: "general",
      },
    });
    // Create website-scoped SEO module (Model 1)
// This keeps plan/quota tied to the website workspace.
const base = planDefaults(seo?.plan || "free");
const websiteSeoRef = db.doc(`users/${uid}/websites/${newRef.id}/modules/seo`);
await websiteSeoRef.set(
  {
    moduleId: "seo",
    plan: base.plan,
    blogsPerWebsitePerMonth: Number(seo?.blogsPerWebsitePerMonth ?? base.blogsPerWebsitePerMonth),
    seatsIncluded: Number(seo?.seatsIncluded ?? seo?.usersIncluded ?? base.seatsIncluded),
    extraBlogCreditsThisMonth: Number(seo?.extraBlogCreditsThisMonth ?? 0),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);


    return res.status(200).json({
      ok: true,
      websiteId: newRef.id,
    });
  } catch (e) {
    console.error("Create website failed:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Create website failed.",
    });
  }
}
