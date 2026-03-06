import admin from "../firebaseAdmin";

function getPlanIdFor(plan) {
  if (plan === "starter") return process.env.RAZORPAY_SUITE_STARTER_PLAN_USD;
  if (plan === "growth") return process.env.RAZORPAY_SUITE_GROWTH_PLAN_USD;
  if (plan === "pro") return process.env.RAZORPAY_SUITE_PRO_PLAN_USD;
  return null;
}

async function razorpayRequest(path, { method = "GET", bodyObj = null } = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Missing Razorpay API keys in env.");
  }

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
      data?.error?.description ||
      data?.error?.code ||
      "Razorpay API error";
    throw new Error(msg);
  }

  return data;
}

async function findCustomerIdByEmail(emailToFind) {
  const list = await razorpayRequest("/customers?count=100", { method: "GET" });
  const items = list?.items || [];
  const hit = items.find(
    (c) => (c.email || "").toLowerCase() === (emailToFind || "").toLowerCase()
  );
  return hit ? hit.id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = decoded.email || "";

    const plan = (req.body?.plan || "").trim(); // starter | growth | pro
    const planId = getPlanIdFor(plan);

    if (!planId) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PLAN",
        details: "Use one of: starter | growth | pro",
      });
    }

    const userRef = admin.firestore().doc(`users/${uid}`);
    const userSnap = await userRef.get();

    let razorpayCustomerId = userSnap.exists
      ? userSnap.data()?.razorpayCustomerId
      : null;

    let customer = null;

    if (razorpayCustomerId) {
      customer = { id: razorpayCustomerId };
    } else {
      try {
        const created = await razorpayRequest("/customers", {
          method: "POST",
          bodyObj: {
            name: userSnap.exists ? userSnap.data()?.name || email : email,
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

          if (!foundId) {
            throw new Error(
              "Customer already exists, but could not find existing customer by email."
            );
          }

          razorpayCustomerId = foundId;
          customer = { id: foundId };

          await userRef.set({ razorpayCustomerId }, { merge: true });
        } else {
          throw err;
        }
      }
    }

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
          suitePlan: plan,
          module: "suite",
        },
      },
    });

    return res.status(200).json({
      ok: true,
      plan,
      module: "suite",
      subscriptionId: subscription.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (e) {
    console.error("razorpay/createSuiteSubscription error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
