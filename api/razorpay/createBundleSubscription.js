// api/razorpay/createBundleSubscription.js
import admin from "../firebaseAdmin";

function getPlanIdFor(plan) {
  if (plan === "small_business") return process.env.RAZORPAY_BUNDLE_SB_PLAN_USD;
  if (plan === "enterprise") return process.env.RAZORPAY_BUNDLE_ENT_PLAN_USD;
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
    const msg = data?.error?.description || data?.error?.code || "Razorpay API error";
    throw new Error(msg);
  }
  return data;
}

// Helper: try to find an existing customer by email (fallback)
async function findCustomerIdByEmail(emailToFind) {
  const list = await razorpayRequest("/customers?count=100", { method: "GET" });
  const items = list?.items || [];
  const hit = items.find((c) => (c.email || "").toLowerCase() === (emailToFind || "").toLowerCase());
  return hit ? hit.id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true, message: "Use POST." });

  try {
    // 1) Verify the logged-in user via Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || "";

    // 2) Which plan user chose
    const plan = (req.body?.plan || "").trim(); // "small_business" | "enterprise"
    const planId = getPlanIdFor(plan);

    if (!planId) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PLAN",
        details: "Use one of: small_business | enterprise",
      });
    }

    // 3) Create (or reuse) a Razorpay customer (one customer per user)
    const userRef = admin.firestore().doc(`users/${uid}`);
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
          if (!foundId) throw new Error("Customer already exists, but could not find existing customer by email.");

          razorpayCustomerId = foundId;
          customer = { id: foundId };
          await userRef.set({ razorpayCustomerId }, { merge: true });
        } else {
          throw err;
        }
      }
    }

    // 4) Create bundle subscription
    const subscription = await razorpayRequest("/subscriptions", {
      method: "POST",
      bodyObj: {
        plan_id: planId,
        customer_id: customer.id,
        total_count: 120,
        customer_notify: 1,
        notes: {
          uid,
          email,
          vyndowPlan: plan,
          module: "bundle",
          bundle: "growth",
        },
      },
    });

    // 5) Return subscription details to client to open Razorpay Checkout
    return res.status(200).json({
      ok: true,
      module: "bundle",
      bundle: "growth",
      plan,
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    console.error("razorpay/createBundleSubscription error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
