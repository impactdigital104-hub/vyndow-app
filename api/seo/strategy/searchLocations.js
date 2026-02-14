// api/seo/strategy/searchLocations.js

import admin from "../../firebaseAdmin";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- HANDLER --------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Auth gate (same pattern as other endpoints)
    await getUidFromRequest(req);

    const q = String(req.body?.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Please type at least 2 characters." });
    }

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
      return res.status(500).json({ error: "Missing DATAFORSEO credentials on server." });
    }

    // IMPORTANT: Google Ads locations list (used for local keyword generation)
    const url = "https://api.dataforseo.com/v3/keywords_data/google_ads/locations";

    const auth = Buffer.from(`${login}:${password}`).toString("base64");
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
    });

    const json = await r.json();

    const items = json?.tasks?.[0]?.result || [];

    const needle = q.toLowerCase();
    const matches = items
      .filter((x) => String(x?.location_name || "").toLowerCase().includes(needle))
      .slice(0, 12)
      .map((x) => ({
        location_name: x.location_name,
        location_type: x.location_type,
        location_code: x.location_code, // returned for display only (NOT used elsewhere)
      }));

    return res.status(200).json({ q, matches });
  } catch (e) {
    console.error("searchLocations error:", e);
    return res.status(500).json({ error: e?.message || "Search failed" });
  }
}
