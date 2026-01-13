// api/razorpay/webhook.js
import admin from "../firebaseAdmin";
import crypto from "crypto";

// IMPORTANT: We need RAW body for signature verification in Next API routes
export const config = { api: { bodyParser: false } };

function getSeoModuleForPlan(plan) {
  if (plan === "free") return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 2, usersIncluded: 1 };
  if (plan === "small_business") return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 6, usersIncluded: 1 };
  if (plan === "enterprise") return { plan, websitesIncluded: 1, blogsPerWebsitePerMonth: 15, usersIncluded: 3 };
  throw new Error("INVALID_PLAN");
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

async function applyPlanToUserAndWebsites({ uid, plan }) {
  const db = admin.firestore();
  const base = getSeoModuleForPlan(plan);

  const userRef = db.doc(`users/${uid}`);
  const seoRef = db.doc(`users/${uid}/modules/seo`);

  // Update account-level entitlements
  await db.runTransaction(async (tx) => {
    tx.set(
      userRef,
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        plan: plan,
        usersIncluded: base.usersIncluded,
      },
      { merge: true }
    );

    tx.set(
      seoRef,
      {
        plan: base.plan,
        websitesIncluded: base.websitesIncluded,
        blogsPerWebsitePerMonth: base.blogsPerWebsitePerMonth,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Propagate to website modules
  try {
    const websitesSnap = await db.collection(`users/${uid}/websites`).get();
    if (!websitesSnap.empty) {
      const batch = db.batch();

      websitesSnap.forEach((wDoc) => {
        const websiteId = wDoc.id;
        const websiteSeoRef = db.doc(`users/${uid}/websites/${websiteId}/modules/seo`);

        batch.set(
          websiteSeoRef,
          {
            plan: base.plan,
            websitesIncluded: base.websitesIncluded,
            blogsPerWebsitePerMonth: base.blogsPerWebsitePerMonth,
            seatsIncluded: base.usersIncluded,
            usersIncluded: base.usersIncluded,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();
    }
  } catch (e) {
    console.error("Webhook plan propagation failed:", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true, message: "Use POST." });

  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "Missing RAZORPAY_WEBHOOK_SECRET" });

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) return res.status(400).json({ ok: false, error: "Missing x-razorpay-signature header" });

    const rawBody = await readRawBody(req);

    if (!verifySignature(rawBody, signature, secret)) {
      return res.status(400).json({ ok: false, error: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = payload?.event || "";

    // Extract uid from notes
    const notes =
      payload?.payload?.subscription?.entity?.notes ||
      payload?.payload?.payment?.entity?.notes ||
      {};

    const uid = (notes.uid || "").trim();
    const vyndowPlan = (notes.vyndowPlan || "").trim(); // "small_business" | "enterprise"
    if (!uid) {
      // If uid is missing, we can't apply entitlements safely.
      return res.status(200).json({ ok: true, skipped: true, reason: "Missing notes.uid" });
    }

    // Decide what to do based on event
    // You can extend later; these cover most cases.
    if (event === "subscription.activated" || event === "subscription.charged") {
      // Apply paid plan
      const planToApply = vyndowPlan === "enterprise" ? "enterprise" : "small_business";
      await applyPlanToUserAndWebsites({ uid, plan: planToApply });
    }

    if (event === "subscription.cancelled" || event === "subscription.completed") {
      // Downgrade to free on cancellation/completion
      await applyPlanToUserAndWebsites({ uid, plan: "free" });
    }

    // Always return 200 to Razorpay once verified/processed
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("razorpay/webhook error:", e);
    // Still return 200? No—if we throw 500, Razorpay will retry.
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
