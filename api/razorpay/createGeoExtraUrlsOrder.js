import Razorpay from "razorpay";
import admin from "../firebaseAdmin";
import { verifyAuthToken } from "../verifyAuthToken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: false, error: "Use POST" });
  }

  try {
    // 1. Verify user
    const decoded = await verifyAuthToken(req);
    const uid = decoded?.uid;
    if (!uid) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // 2. Create Razorpay instance
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // 3. Create one-time order for ₹249
    const order = await razorpay.orders.create({
      amount: 249 * 100, // paise
      currency: "INR",
      payment_capture: 1,
      notes: {
        uid,
        module: "geo",
        addonType: "extra_geo_urls",
        qty: "5",
      },
    });

    return res.status(200).json({
      ok: true,
      orderId: order.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    console.error("createGeoExtraUrlsOrder error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
