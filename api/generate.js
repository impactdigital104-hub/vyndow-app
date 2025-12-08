// /api/generate.js
// Vyndow SEO – Backend with max_tokens and improved word-count handling

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message:
        "Vyndow SEO /api/generate is live. Please call this endpoint with POST and a JSON body.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set in environment variables."
    });
  }

  // Brief coming from the frontend
  const brief = req.body || {};

  // -------------------------------------------
  // SYSTEM PROMPT (slightly strengthened safely)
  // -------------------------------------------
  const SYSTEM_PROMPT = `
You are VYNDOW SEO, an advanced professional SEO content engine.
Your job is to take a blog brief plus a fixed brand profile and generate EXACTLY 15 outputs.
You MUST respond ONLY with a valid JSON object.

STRICT JSON RULES:
- Respond ONLY with a single JSON object.
- No text outside the JSON.
- No markdown blocks.
- No trailing commas.
- Only keys "output1" to "output15".

BRAND PROFILE (ANATTA):
- Luxury, confidential, voluntary residential support for substance & behavioural dependency.
- Non-medical, spiritual, compassionate approach.
- Warm, empathetic, adult-to-adult tone.
- No guaranteed results, no medical claims.

CONTENT RULES:
- Respect the brief's primary & secondary keywords.
- Primary keyword MUST appear in SEO Title, Meta Description, H1, and first paragraph.
- Create readable, structured content.

ARTICLE LENGTH (OUTPUT 8) — CRITICAL REQUIREMENT:
- Let requestedWords = brief.wordCount if provided else 1200.
- Output8 MUST be a comprehensive, in-depth article.
- Output8 MUST contain AT LEAST SIX <h2> sections.
- EACH <h2> section MUST contain 2–3 detailed paragraphs.
- Output8 MUST reach at least requestedWords * 0.9 words.
- Do NOT stop early. Expand with examples, insights, and sub-points.
- Use <h2>, <h3>, <p>, <a> HTML formatting.

Return outputs ONLY in this JSON structure:

{
  "output1": "...",
  "output2": "...",
  "output3": "...",
  "output4": "...",
  "output5": "...",
  "output6": "...",
  "output7": "...",
  "output8": "...",
  "output9": "...",
  "output10": "...",
  "output11": "...",
  "output12": "...",
  "output13": "...",
  "output14": "...",
  "output15": "..."
}
  `;

  // Build user content
  const userContent = `
Here is the blog brief:

${JSON.stringify(brief, null, 2)}

Generate all 15 outputs following the SYSTEM PROMPT exactly.
  `;

  try {
    // -------------------------------------------
    // CALL OPENAI WITH A HIGH max_tokens VALUE
    // -------------------------------------------
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 12000  // <<<<<<<< THIS FIXES THE WORD COUNT SHORTENING
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({
        ok: false,
        error: "OpenAI API error",
        detail: errText
      });
    }

    const data = await response.json();
    let raw = data.choices?.[0]?.message?.content || "";
    let cleaned = raw.trim();

    // Strip markdown fences if any
    if (cleaned.startsWith("```")) {
      const firstNewline = cleaned.indexOf("\n");
      if (firstNewline !== -1) cleaned = cleaned.substring(firstNewline + 1);
      const lastFence = cleaned.lastIndexOf("```");
      if (lastFence !== -1) cleaned = cleaned.substring(0, lastFence);
      cleaned = cleaned.trim();
    }

    let outputs;
    try {
      outputs = JSON.parse(cleaned);
    } catch (e) {
      outputs = {
        output1: "",
        output2: "",
        output3: "",
        output4: "",
        output5: "",
        output6: brief.primaryKeyword || "",
        output7: (brief.secondaryKeywords || []).join(", "),
        output8: raw,
        output9: "",
        output10: "",
        output11: "",
        output12: "",
        output13: "",
        output14: "",
        output15: "Model did not return valid JSON."
      };
    }

    return res.status(200).json({
      ok: true,
      receivedBrief: brief,
      outputs
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Unexpected server error",
      detail: String(err)
    });
  }
}
