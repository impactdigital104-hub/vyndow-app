import admin from "firebase-admin";

// Reuse existing admin init pattern (safe in Vercel)
if (!admin.apps.length) {
  admin.initializeApp();
}

function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  if (!h.startsWith("Bearer ")) return "";
  return h.slice("Bearer ".length).trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    // Auth gate (same as your other endpoints)
    await admin.auth().verifyIdToken(token);

    const q = String(req.body?.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Please type at least 2 characters." });
    }

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    if (!login || !password) {
      return res.status(500).json({ error: "Missing DATAFORSEO credentials on server." });
    }

    // NOTE: DataForSEO provides locations list here (no cost)
    const url = "https://api.dataforseo.com/v3/keywords_data/google/locations";

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

    // Filter in our server so UI can type "London" and get matches
    const needle = q.toLowerCase();
    const matches = items
      .filter((x) => String(x?.location_name || "").toLowerCase().includes(needle))
      .slice(0, 12)
      .map((x) => ({
        location_name: x.location_name,
        location_type: x.location_type,
        location_code: x.location_code,
      }));

    return res.status(200).json({ q, matches });
  } catch (e) {
    console.error("searchLocations error:", e);
    return res.status(500).json({ error: e?.message || "Search failed" });
  }
}
