// api/razorpay/createSubscription.js
import admin from "../../firebaseAdmin";
import crypto from "crypto";

function getPlanIdFor(plan) {
  if (plan === "small_business") return process.env.RAZORPAY_PLAN_ID_SMALL_BUSINESS_TEST;
  if (plan === "enterprise") return process.env.RAZORPAY_PLAN_ID_ENTERPRISE_TEST;
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

    // 3) Create (or reuse) a Razorpay customer
    // We’ll create a new customer each time only if needed; simplest approach: always create.
    const customer = await razorpayRequest("/customers", {
      method: "POST",
      bodyObj: {
        name: email ? email.split("@")[0] : "Vyndow User",
        email: email || undefined,
        notes: { uid },
      },
    });

    // 4) Create subscription for the plan
    const subscription = await razorpayRequest("/subscriptions", {
      method: "POST",
      bodyObj: {
        plan_id: planId,
        customer_id: customer.id,
        total_count: 120, // effectively "ongoing" (10 years). Can adjust later.
        customer_notify: 1,
        notes: { uid, email, vyndowPlan: plan },
      },
    });

    // 5) Return subscription details to client to open Razorpay Checkout
    return res.status(200).json({
      ok: true,
      uid,
      plan,
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID, // safe to return
    });
  } catch (e) {
    console.error("razorpay/createSubscription error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
