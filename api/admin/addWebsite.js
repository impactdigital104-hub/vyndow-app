// api/admin/addWebsite.js
import admin from "../firebaseAdmin";

/**
 * Admin-only: add website capacity (extraWebsitesPurchased) for SEO module.
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify caller (admin) token (same as setPlan)
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
    const qty = Number(req.body?.qty ?? 1);

    if (!targetUid) {
      return res.status(400).json({ ok: false, error: "targetUid is required." });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ ok: false, error: "qty must be a positive number." });
    }

    const db = admin.firestore();
    const seoRef = db.doc(`users/${targetUid}/modules/seo`);

    // 3) Increment extraWebsitesPurchased atomically
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(seoRef);
      const data = snap.exists ? (snap.data() || {}) : {};
      const current = Number(data.extraWebsitesPurchased ?? 0) || 0;
      const next = current + qty;

      tx.set(
        seoRef,
        {
          extraWebsitesPurchased: next,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    // 4) Respond
    const finalSnap = await seoRef.get();
    const finalData = finalSnap.exists ? (finalSnap.data() || {}) : {};

    return res.status(200).json({
      ok: true,
      targetUid,
      extraWebsitesPurchased: finalData.extraWebsitesPurchased ?? 0,
    });
  } catch (e) {
    console.error("admin/addWebsite error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error." });
  }
}
