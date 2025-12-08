// /api/generate.js
// Two-step generation architecture for 1500-word article reliability

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message:
        "Vyndow SEO /api/generate is live. Use POST with JSON body.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is missing."
    });
  }

  // Receive the brief from frontend
  const brief = req.body || {};
  const requestedWords = brief.wordCount || 1200;

  // ---------------------------------------
  // STEP 1 — PROMPT FOR THE LONG ARTICLE
  // ---------------------------------------
  const LONG_ARTICLE_PROMPT = `
You are VYNDOW SEO, an expert long-form SEO writer for Anatta.

Write a comprehensive, deeply detailed, 1500-word article in clean HTML (<h2>, <h3>, <p>, <a>).
Absolutely NO JSON for this step.

CRITICAL REQUIREMENTS:
- Length: At least ${requestedWords * 0.9} words (minimum), target ${requestedWords}–1500 words.
- Include AT LEAST six <h2> sections.
- Each <h2> section must have 2–4 rich paragraphs.
- Use <h3> sub-sections wherever helpful.
- Embed internal links ONLY as:
  <a href="URL">anchor text</a>
- Do NOT be concise. Go deep, give examples, explanations, and insights.

Brand Tone:
- Warm, empathetic, non-judgmental, confidential, spiritual.
- No guaranteed results, no medical claims.

Primary Keyword: ${brief.primaryKeyword || ""}
Secondary Keywords: ${(brief.secondaryKeywords || []).join(", ")}

Topic: ${brief.topic || ""}

Write the full article now. Only return HTML.
  `;

  // -----------------------------
  // STEP 1 — CALL OPENAI
  // -----------------------------
  let articleText = "";
  try {
    const longResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: LONG_ARTICLE_PROMPT }],
          temperature: 0.7,
          max_tokens: 12000 // plenty of room for long article
        }),
      }
    );

    const longData = await longResponse.json();
    articleText =
      longData.choices?.[0]?.message?.content ||
      "(Article generation failed.)";
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Error generating long article.",
      detail: String(err),
    });
  }

  // ---------------------------------------
  // STEP 2 — PROMPT FOR SHORT OUTPUTS
  // ---------------------------------------
  const SHORT_OUTPUTS_PROMPT = `
You are VYNDOW SEO. Generate ONLY the remaining 14 SEO outputs for the blog.

Return ONLY a JSON object using EXACT keys: output1 to output7 and output9 to output15.
DO NOT include output8 (the article is already generated).
DO NOT include any commentary or text outside the JSON.
DO NOT include markdown fences.

Here is the blog brief:
${JSON.stringify(brief, null, 2)}

The long article has already been generated separately.
Generate the rest of the outputs exactly as described:

1 → Blog Title Recommendation  
2 → H1  
3 → SEO Title (<= 60 chars)  
4 → Meta Description (<= 155 chars)  
5 → URL Slug  
6 → Primary Keyword  
7 → Secondary Keywords (comma-separated)  

9 → Internal links table  
10 → FAQs  
11 → Image alt text suggestions  
12 → Image prompts  
13 → JSON-LD schema  
14 → Readability & risk notes  
15 → Checklist verification

Return strictly valid JSON now.
  `;

  // -----------------------------
  // STEP 2 — CALL OPENAI
  // -----------------------------
  let outputsPartial = {};
  try {
    const shortResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: SHORT_OUTPUTS_PROMPT }],
          temperature: 0.5,
          max_tokens: 3000
        }),
      }
    );

    const shortRaw = await shortResponse.json();
    let text = shortRaw.choices?.[0]?.message?.content || "";

    // Clean markdown fences
    if (text.startsWith("```")) {
      const firstNL = text.indexOf("\n");
      text = text.substring(firstNL + 1);
      const lastFence = text.lastIndexOf("```");
      if (lastFence !== -1) text = text.substring(0, lastFence);
    }

    outputsPartial = JSON.parse(text.trim());
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Error generating secondary outputs.",
      detail: String(err),
    });
  }

  // ---------------------------------------
  // STITCH FINAL OUTPUT
  // ---------------------------------------
  const finalOutputs = {
    ...outputsPartial,
    output8: articleText // insert long article
  };

  return res.status(200).json({
    ok: true,
    receivedBrief: brief,
    outputs: finalOutputs
  });
}
