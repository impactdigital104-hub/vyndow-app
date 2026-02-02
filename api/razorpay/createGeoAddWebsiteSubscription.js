// api/razorpay/createGeoAddWebsiteSubscription.js
import admin from "../firebaseAdmin";

function getGeoAddonPlanIdFor(currentPlan) {
  if (currentPlan === "small_business") return process.env.RAZORPAY_GEO_ADD_WEBSITE_SB_PLAN_USD;
  if (currentPlan === "enterprise") return process.env.RAZORPAY_GEO_ADD_WEBSITE_ENT_PLAN_USD;
  return null;
}


async function razorpayRequest(path, { method = "GET", bodyObj = null } = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) throw new Error("Missing Razorpay API keys in env.");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.description || data?.error?.code || "Razorpay API error";
    throw new Error(msg);
  }
  return data;
}

async function findCustomerIdByEmail(emailToFind) {
  const list = await razorpayRequest("/customers?count=100", { method: "GET" });
  const items = list?.items || [];
  const hit = items.find(
    (c) =>
      (c.email || "").toLowerCase() === (emailToFind || "").toLowerCase()
  );
  return hit ? hit.id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(200).json({ ok: true, message: "Use POST." });

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || "";

    const db = admin.firestore();

    // 2) Determine user's current GEO base plan from Firestore (DON'T trust frontend)
    const geoSnap = await db.doc(`users/${uid}/modules/geo`).get();
    const currentPlan = geoSnap.exists ? (geoSnap.data()?.plan || "free") : "free";

    if (currentPlan !== "small_business" && currentPlan !== "enterprise") {
      return res.status(400).json({
        ok: false,
        error: "UPGRADE_REQUIRED",
        details: "GEO Additional Website add-on is available only for paid GEO plans.",
      });
    }

    const addonPlanId = getGeoAddonPlanIdFor(currentPlan);
    if (!addonPlanId) throw new Error("Missing GEO add-on plan ID in env vars.");

    // 3) Reuse/create Razorpay customer (one per user)
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();

    let razorpayCustomerId = userSnap.exists ? userSnap.data()?.razorpayCustomerId : null;

    let customer = null;
    if (razorpayCustomerId) {
      customer = { id: razorpayCustomerId };
    } else {
      try {
        const created = await razorpayRequest("/customers", {
          method: "POST",
          bodyObj: {
            name: userSnap.exists ? (userSnap.data()?.name || email) : email,
            email,
            notes: { uid },
          },
        });

        razorpayCustomerId = created.id;
        customer = created;
        await userRef.set({ razorpayCustomerId }, { merge: true });
      } catch (err) {
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("customer already exists")) {
          const foundId = await findCustomerIdByEmail(email);
          if (!foundId) throw new Error("Customer exists but could not find by email.");
          razorpayCustomerId = foundId;
          customer = { id: foundId };
          await userRef.set({ razorpayCustomerId }, { merge: true });
        } else {
          throw err;
        }
      }
    }

    // 4) Create subscription for GEO add-on plan (+1 website recurring)
    const subscription = await razorpayRequest("/subscriptions", {
      method: "POST",
      bodyObj: {
        plan_id: addonPlanId,
        customer_id: customer.id,
        total_count: 120,
        customer_notify: 1,
        notes: {
          uid,
          email,
          module: "geo",
          addonType: "additional_website",
          qty: "1",
          basePlan: currentPlan,
        },
      },
    });

    return res.status(200).json({
      ok: true,
      addonType: "additional_website",
      module: "geo",
      basePlan: currentPlan,
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    console.error("razorpay/createGeoAddWebsiteSubscription error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
