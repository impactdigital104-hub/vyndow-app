// api/seo/strategy/testDataForSeoKeywords.js

export default async function handler(req, res) {
  try {
    // Only allow GET for this test route
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed. Use GET." });
    }

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    if (!login || !password) {
      return res.status(500).json({
        error: "Missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD in env vars.",
      });
    }

    // Fixed sanity context (as requested)
    const location_code = 2840; // United States (example used by DataForSEO) :contentReference[oaicite:2]{index=2}
    const language_code = "en"; // English :contentReference[oaicite:3]{index=3}

    // One seed keyword for test
    const seedKeyword = "plumbing services";

    const endpoint =
      "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live"; // :contentReference[oaicite:4]{index=4}

    const auth = Buffer.from(`${login}:${password}`).toString("base64");

    const payload = [
      {
        location_code,
        language_code,
        keywords: [seedKeyword],
        include_adult_keywords: false,
        sort_by: "relevance",
      },
    ];

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`, // Basic Auth: base64(login:password) :contentReference[oaicite:5]{index=5}
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await r.json();

    // Fail fast if DataForSEO itself returns an error structure
    const topStatus = json?.status_code;
    if (topStatus !== 20000) {
      return res.status(500).json({
        error: "DataForSEO top-level error",
        status_code: json?.status_code,
        status_message: json?.status_message,
        raw: json,
      });
    }

    const task = json?.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      return res.status(500).json({
        error: "DataForSEO task error",
        status_code: task?.status_code,
        status_message: task?.status_message,
        raw: json,
      });
    }

    const results = Array.isArray(task.result) ? task.result : [];

    // Minimal parsed output (first ~20 items only for readability)
    const parsed = results.slice(0, 20).map((item) => {
      const info = item?.keyword_info || {};
      return {
        keyword: item?.keyword ?? null,

        // REQUIRED OUTPUT FIELDS
        volume: info?.search_volume ?? null,
        competition: info?.competition ?? null, // Google Ads competition level :contentReference[oaicite:6]{index=6}
        cpc: info?.cpc ?? null,

        // Sanity context used
        location_code: item?.location_code ?? location_code,
        language_code: item?.language_code ?? language_code,

        // NICE-TO-HAVE (only if present)
        competition_index: info?.competition_index ?? null,
        low_top_of_page_bid: info?.low_top_of_page_bid ?? null,
        high_top_of_page_bid: info?.high_top_of_page_bid ?? null,

        // For debugging / sanity
        rawFieldsUsed: {
          requested_location_code: location_code,
          requested_language_code: language_code,
          requested_seed_keyword: seedKeyword,
        },
      };
    });

    return res.status(200).json({
      ok: true,
      meta: {
        endpoint: "google_ads/keywords_for_keywords/live",
        note:
          "This endpoint can return up to 20,000 suggestions per request; we only return first 20 here for test readability.",
        cost_from_api_if_present: task?.cost ?? json?.cost ?? null,
      },
      parsed,
    });
  } catch (e) {
    return res.status(500).json({
      error: "Unhandled server error",
      message: e?.message || String(e),
    });
  }
}
