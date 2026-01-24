// api/razorpay/webhook.js
const admin = require("../firebaseAdmin");
const crypto = require("crypto");


// IMPORTANT: We need RAW body for signature verification in Next API routes
module.exports.config = { api: { bodyParser: false } };

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
// ===== ADD-ON HELPERS (inserted) =====

// Idempotent grant: increments extraBlogCreditsThisMonth once per paymentId
async function grantBlogCreditsOnce({ uid, paymentId, qty = 2 }) {
  const db = admin.firestore();
  const paymentRef = db.doc(`users/${uid}/razorpayPayments/${paymentId}`);
  const seoRef = db.doc(`users/${uid}/modules/seo`);

  await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(paymentRef);
    if (paySnap.exists) return; // already processed

    tx.set(paymentRef, {
      type: "extra_blog_credits",
      qty,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(
      seoRef,
      {
        extraBlogCreditsThisMonth: admin.firestore.FieldValue.increment(qty),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Optional propagation to website modules (helps UI consistency if UI reads website module)
  try {
    const websitesSnap = await db.collection(`users/${uid}/websites`).get();
    if (!websitesSnap.empty) {
      const batch = db.batch();
      websitesSnap.forEach((wDoc) => {
        const websiteSeoRef = db.doc(`users/${uid}/websites/${wDoc.id}/modules/seo`);
        batch.set(
          websiteSeoRef,
          {
            extraBlogCreditsThisMonth: admin.firestore.FieldValue.increment(qty),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  } catch (e) {
    console.error("Webhook blog credits propagation failed:", e);
  }
}
// Idempotent grant: GEO extra URLs (+5) once per paymentId
async function grantGeoUrlsOnce({ uid, paymentId, qty = 5 }) {
  const db = admin.firestore();
  const paymentRef = db.doc(`users/${uid}/razorpayPayments/${paymentId}`);
  const geoRef = db.doc(`users/${uid}/modules/geo`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(paymentRef);
    if (snap.exists) return;

    tx.set(paymentRef, {
      type: "extra_geo_urls",
      qty,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(
      geoRef,
      {
        extraGeoCreditsThisMonth: admin.firestore.FieldValue.increment(qty),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

// Keeps extraWebsitesPurchased equal to count of ACTIVE add-on subscriptions
async function syncExtraWebsitesFromActiveAddons({ uid }) {
  // Keeps GEO extraWebsitesPurchased equal to count of ACTIVE GEO add-on subscriptions
async function syncGeoExtraWebsitesFromActiveAddons({ uid }) {
  const db = admin.firestore();

  const addonsSnap = await db
    .collection(`users/${uid}/razorpayAddons`)
    .where("addonType", "==", "additional_website")
    .where("status", "==", "active")
    .where("module", "==", "geo")
    .get();

  const activeCount = addonsSnap.size;

  await db.doc(`users/${uid}/modules/geo`).set(
    {
      extraWebsitesPurchased: activeCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

  const db = admin.firestore();
  const addonsSnap = await db
    .collection(`users/${uid}/razorpayAddons`)
    .where("addonType", "==", "additional_website")
    .where("status", "==", "active")
    .get();

  const activeCount = addonsSnap.size;

  await db.doc(`users/${uid}/modules/seo`).set(
    {
      extraWebsitesPurchased: activeCount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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
    const payId = payload?.payload?.payment?.entity?.id || "";
    console.log("RP_EVENT:", event);
console.log("RP_PAYLOAD_KEYS:", Object.keys(payload?.payload || {}));
console.log("RP_NOTES_RAW:", JSON.stringify({
  subNotes: payload?.payload?.subscription?.entity?.notes || null,
  payNotes: payload?.payload?.payment?.entity?.notes || null,
  invNotes: payload?.payload?.invoice?.entity?.notes || null,
  subId: payload?.payload?.subscription?.entity?.id || null,
  payId: payload?.payload?.payment?.entity?.id || null,
  invId: payload?.payload?.invoice?.entity?.id || null,
}, null, 2));


    // Extract uid from notes
    const notes =
      payload?.payload?.subscription?.entity?.notes ||
      payload?.payload?.payment?.entity?.notes ||
      {};

    const uid = (notes.uid || "").trim();
    const vyndowPlan = (notes.vyndowPlan || "").trim(); // "small_business" | "enterprise"
   const addonType = (notes.addonType || "").trim();
const moduleName = (notes.module || "").trim();

    if (!uid) {
      // If uid is missing, we can't apply entitlements safely.
      return res.status(200).json({ ok: true, skipped: true, reason: "Missing notes.uid" });
    }

 // Decide what to do based on event

// ===== MAIN PLAN SUBSCRIPTIONS (no addonType) =====
if ((event === "subscription.activated" || event === "subscription.charged") && !addonType && moduleName !== "geo") {
  const planToApply = vyndowPlan === "enterprise" ? "enterprise" : "small_business";
  await applyPlanToUserAndWebsites({ uid, plan: planToApply });
}

if ((event === "subscription.cancelled" || event === "subscription.completed") && !addonType && moduleName !== "geo") {
  await applyPlanToUserAndWebsites({ uid, plan: "free" });
}
// ===== GEO MAIN PLAN SUBSCRIPTIONS (module === "geo") =====

if ((event === "subscription.activated" || event === "subscription.charged") && moduleName === "geo") {
  const db = admin.firestore();
const geoRef = db.doc(`users/${uid}/modules/geo`);

const normalizedPlan =
  vyndowPlan === "enterprise" ? "enterprise" : "small_business";

const pagesPerMonthMap = {
  free: 5,
  small_business: 20,
  enterprise: 50,
};

await geoRef.set(
  {
    moduleId: "geo",
    plan: normalizedPlan,
    pagesPerMonth: pagesPerMonthMap[normalizedPlan] ?? 5,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

}

if ((event === "subscription.cancelled" || event === "subscription.completed") && moduleName === "geo") {
  const db = admin.firestore();
  const geoRef = db.doc(`users/${uid}/modules/geo`);
  await geoRef.set(
    {
      plan: "free",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
// GEO MAIN PLAN (fallback): if Razorpay sends payment.captured first
if (event === "payment.captured" && moduleName === "geo" && !addonType) {
const db = admin.firestore();
const geoRef = db.doc(`users/${uid}/modules/geo`);

const normalizedPlan =
  vyndowPlan === "enterprise" ? "enterprise" : "small_business";

const pagesPerMonthMap = {
  free: 5,
  small_business: 20,
  enterprise: 50,
};

await geoRef.set(
  {
    moduleId: "geo",
    plan: normalizedPlan,
    pagesPerMonth: pagesPerMonthMap[normalizedPlan],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);

}
    // GEO MAIN PLAN (auth): Razorpay sends payment.authorized first in some flows
if (event === "payment.authorized" && moduleName === "geo" && !addonType) {
const db = admin.firestore();
const geoRef = db.doc(`users/${uid}/modules/geo`);

const normalizedPlan =
  vyndowPlan === "enterprise" ? "enterprise" : "small_business";

const pagesPerMonthMap = {
  free: 5,
  small_business: 20,
  enterprise: 50,
};

await geoRef.set(
  {
    moduleId: "geo",
    plan: normalizedPlan,
    pagesPerMonth: pagesPerMonthMap[normalizedPlan],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  },
  { merge: true }
);


  // record payment for debugging / idempotency
  if (payId) {
    await db.doc(`users/${uid}/razorpayPayments/${payId}`).set(
      {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: "geo_subscription",
        event,
        amount: payload?.payload?.payment?.entity?.amount || null,
        currency: payload?.payload?.payment?.entity?.currency || null,
        module: moduleName,
        plan: vyndowPlan,
      },
      { merge: true }
    );
  }
}


// ===== BLOG CREDIT ADD-ON (one-time payment) =====
if (event === "payment.captured" && addonType === "extra_blog_credits") {
  const paymentId = payload?.payload?.payment?.entity?.id || "";
  const qty = parseInt(notes.qty || "2", 10) || 2;
  if (paymentId) {
    await grantBlogCreditsOnce({ uid, paymentId, qty });
  }
}
// ===== GEO EXTRA URL PACK (one-time payment) =====
if (event === "payment.captured" && addonType === "extra_geo_urls") {
  const paymentId = payload?.payload?.payment?.entity?.id || "";
  const qty = parseInt(notes.qty || "5", 10) || 5;
  if (paymentId) {
    await grantGeoUrlsOnce({ uid, paymentId, qty });
  }
}

// ===== ADD WEBSITE ADD-ON (recurring subscription) =====
if ((event === "subscription.activated" || event === "subscription.charged") && addonType === "additional_website") {
  const subId = payload?.payload?.subscription?.entity?.id || "";
  if (subId) {
    const addonRef = admin.firestore().doc(`users/${uid}/razorpayAddons/${subId}`);

    const payloadToStore = {
      addonType: "additional_website",
      status: "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // GEO-only marker (SEO add-ons currently have no module note)
    if (moduleName === "geo") {
      payloadToStore.module = "geo";
    }

    await addonRef.set(payloadToStore, { merge: true });

    if (moduleName === "geo") {
      await syncGeoExtraWebsitesFromActiveAddons({ uid });
    } else {
      await syncExtraWebsitesFromActiveAddons({ uid }); // existing SEO behavior unchanged
    }
  }
}


if ((event === "subscription.cancelled" || event === "subscription.completed") && addonType === "additional_website") {
  const subId = payload?.payload?.subscription?.entity?.id || "";
  if (subId) {
    const addonRef = admin.firestore().doc(`users/${uid}/razorpayAddons/${subId}`);

    const payloadToStore = {
      addonType: "additional_website",
      status: "inactive",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (moduleName === "geo") {
      payloadToStore.module = "geo";
    }

    await addonRef.set(payloadToStore, { merge: true });

    if (moduleName === "geo") {
      await syncGeoExtraWebsitesFromActiveAddons({ uid });
    } else {
      await syncExtraWebsitesFromActiveAddons({ uid }); // existing SEO behavior unchanged
    }
  }
}

}


    // Always return 200 to Razorpay once verified/processed
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("razorpay/webhook error:", e);
    // Still return 200? No—if we throw 500, Razorpay will retry.
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
