// api/razorpay/createBlogCreditsOrder.js
import admin from "../firebaseAdmin";

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
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || "";

// 2) Create Razorpay Order ($9 => 900 cents)
const amount = 900;
    const order = await razorpayRequest("/orders", {
      method: "POST",
      bodyObj: {
        amount,
        currency: "USD",
       receipt: `bc_${Date.now()}`,
        notes: {
          uid,
          email,
          addonType: "extra_blog_credits",
          qty: "2",
        },
      },
    });

    return res.status(200).json({
      ok: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (e) {
    console.error("razorpay/createBlogCreditsOrder error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
