import admin from "../../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await getUidFromRequest(req);

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
      return res.status(500).json({ error: "Missing DATAFORSEO credentials on server." });
    }

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
    const items = Array.isArray(json?.tasks?.[0]?.result) ? json.tasks[0].result : [];

    const countries = Array.from(
      new Set(
        items
          .filter((x) => String(x?.location_type || "").toLowerCase().includes("country"))
          .map((x) => String(x?.location_name || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return res.status(200).json({ countries });
  } catch (e) {
    console.error("listCountries error:", e);
    return res.status(500).json({ error: e?.message || "Country list failed" });
  }
}
