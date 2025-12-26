// api/admin/setPlan.js
import admin from "../firebaseAdmin";

/**
 * Admin-only: set a user's SEO plan & limits (Phase X.2)
 * Later Razorpay webhooks will call the SAME logic.
 *
 * Env required:
 *   VYNDOW_ADMIN_EMAILS="you@example.com,other@example.com"
 */

function parseAdminEmails() {
  const raw = process.env.VYNDOW_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getSeoModuleForPlan(plan) {
  // Canonical plan limits (prices not stored here)
  if (plan === "free") {
    return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 2, usersIncluded: 1 };
  }
  if (plan === "small_business") {
    return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 6, usersIncluded: 1 };
  }
  if (plan === "enterprise") {
    return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 15, usersIncluded: 3 };
  }
  throw new Error("INVALID_PLAN");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify caller (admin) token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);

    const adminEmail = (decoded.email || "").toLowerCase();
    const allowlist = parseAdminEmails();

    if (!adminEmail || !allowlist.includes(adminEmail)) {
      return res.status(403).json({
        ok: false,
        error: "NOT_AUTHORIZED",
        details: "Caller is not in VYNDOW_ADMIN_EMAILS allowlist.",
      });
    }

    // 2) Validate inputs
    const targetUid = (req.body?.targetUid || "").trim();
    const plan = (req.body?.plan || "").trim();

    // Optional add-ons (for later; we store fields now)
    const extraWebsitesPurchased = Number(req.body?.extraWebsitesPurchased ?? 0);
    const extraBlogCreditsThisMonth = Number(req.body?.extraBlogCreditsThisMonth ?? 0);

    if (!targetUid) {
      return res.status(400).json({ ok: false, error: "targetUid is required." });
    }
    if (!plan) {
      return res.status(400).json({ ok: false, error: "plan is required." });
    }

    // 3) Build canonical module payload
    const base = getSeoModuleForPlan(plan);

    const db = admin.firestore();
    const userRef = db.doc(`users/${targetUid}`);
    const seoRef = db.doc(`users/${targetUid}/modules/seo`);

    // 4) Write (server-side, authoritative)
    await db.runTransaction(async (tx) => {
      // ensure user doc exists
      tx.set(
        userRef,
        {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          plan: plan, // canonical user-level plan marker (useful later)
          usersIncluded: base.usersIncluded,
        },
        { merge: true }
      );

      // update SEO module limits (enforcement already reads this doc)
      tx.set(
        seoRef,
        {
          plan: base.plan,
          websitesIncluded: base.websitesIncluded,
          blogsPerWebsitePerMonth: base.blogsPerWebsitePerMonth,

          // add-ons (stored but not sold yet in Phase X.2)
          extraWebsitesPurchased: Number.isFinite(extraWebsitesPurchased)
            ? extraWebsitesPurchased
            : 0,

          // blog credit packs (2 credits per pack later)
          extraBlogCreditsThisMonth: Number.isFinite(extraBlogCreditsThisMonth)
            ? extraBlogCreditsThisMonth
            : 0,

          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    // 4B) IMPORTANT: propagate plan limits to all existing website-scoped SEO modules
    // Reason: /api/generate and UI prefer users/{uid}/websites/{websiteId}/modules/seo
    // ensureWebsiteSeoModule() only creates if missing; it does NOT update existing modules.
    try {
      const websitesSnap = await db.collection(`users/${targetUid}/websites`).get();

      if (!websitesSnap.empty) {
        const batch = db.batch();

        websitesSnap.forEach((wDoc) => {
          const websiteId = wDoc.id;

          const websiteSeoRef = db.doc(
            `users/${targetUid}/websites/${websiteId}/modules/seo`
          );

          batch.set(
            websiteSeoRef,
            {
              plan: base.plan,
              websitesIncluded: base.websitesIncluded,
              blogsPerWebsitePerMonth: base.blogsPerWebsitePerMonth,

              // Seat limits used by team accept flow (keep both fields for safety)
              seatsIncluded: base.usersIncluded,
              usersIncluded: base.usersIncluded,

              // Extra credits are consumed from website-scoped module in /api/generate
              extraBlogCreditsThisMonth: Number.isFinite(extraBlogCreditsThisMonth)
                ? extraBlogCreditsThisMonth
                : 0,

              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });

        await batch.commit();
      }
    } catch (e) {
      // Do not fail plan assignment if propagation fails — but log loudly
      console.error("Plan propagation to website modules failed:", e);
    }

    // 5) Respond with the new effective limits
    const effectiveAllowedWebsites = base.websitesIncluded + (Number.isFinite(extraWebsitesPurchased) ? extraWebsitesPurchased : 0);

    return res.status(200).json({
      ok: true,
      targetUid,
      plan: base.plan,
      limits: {
        websitesIncluded: base.websitesIncluded,
        extraWebsitesPurchased: Number.isFinite(extraWebsitesPurchased) ? extraWebsitesPurchased : 0,
        allowedWebsites: effectiveAllowedWebsites,
        blogsPerWebsitePerMonth: base.blogsPerWebsitePerMonth,
        extraBlogCreditsThisMonth: Number.isFinite(extraBlogCreditsThisMonth) ? extraBlogCreditsThisMonth : 0,
        usersIncluded: base.usersIncluded,
      },
    });
  } catch (e) {
    console.error("admin/setPlan error:", e);
    const msg = e?.message || "Unknown error.";
    if (msg === "INVALID_PLAN") {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PLAN",
        details: "Use one of: free | small_business | enterprise",
      });
    }
    return res.status(500).json({ ok: false, error: msg });
  }
}
