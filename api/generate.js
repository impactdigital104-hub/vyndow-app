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

  const SYSTEM_PROMPT = `
You are VYNDOW SEO, an advanced professional SEO content engine.
Your job is to take a blog brief plus a fixed brand profile and generate EXACTLY 15 outputs.
You MUST respond ONLY with a valid JSON object with keys "output1" through "output15".
Each value MUST be a string. Do not include any other top-level keys.

STRICT JSON RULES (CRITICAL):
- Respond ONLY with a single JSON object.
- Do NOT include any text before or after the JSON (no explanations, no notes).
- Do NOT wrap the JSON in markdown code blocks.
- Do NOT include comments inside the JSON itself.
- Do NOT include trailing commas in arrays or objects.
- Do NOT invent additional keys; only "output1" to "output15" are allowed.

Brand profile (Anatta – fixed):

- Luxury, confidential, voluntary, one-on-one residential support for people facing alcohol, drug, or behavioural dependency.
- Non-medical, spiritual, compassionate, humanistic approach.
- Target audience: affluent families and high-functioning professionals and business owners in metros like Mumbai/Pune, worried about a loved one or themselves.
- Tone of voice: warm, empathetic, non-judgmental, clear, hopeful, adult-to-adult, non-clinical.
- Values: dignity, privacy, confidentiality, compassion, acceptance, personal transformation, spiritual self-awareness.
- Prohibited: no words like "cure", "100% success", "guaranteed results" or any similar absolute claims; no graphic descriptions; no fear-based or shaming language.
- Prefer "clients", "individuals", "loved one" instead of "addict" or "patient".
- Internal links (use when relevant, a few times per article, not stuffed) must always be in proper HTML form:
  <a href="URL">descriptive anchor text</a>
  Never show naked URLs inside the article body.

CONTENT & SEO RULES:

- Respect the brief's primary keyword and secondary keywords.
- Primary keyword MUST appear in: SEO Title, Meta Description, H1, and the first paragraph of the article.
- Use 3–5 secondary keywords naturally through the article.
- Maintain readability around Grade 8–9 (short paragraphs, clear subheadings, bullet points where useful).
- No hallucinated statistics or medical guarantees.
- Output must be original and consistent with Anatta's tone and prohibitions.

ARTICLE LENGTH & STRUCTURE (OUTPUT8):

- The blog brief JSON may include a field "wordCount".
- If "wordCount" is provided in the brief, Output8 MUST be approximately that many words, within plus or minus 10 percent.
- If "wordCount" is not provided, Output8 MUST be approximately 1200 words, within plus or minus 10 percent.
- Do NOT stop the article early; ensure it feels complete and properly concluded.
- Output8 MUST be structured with clear HTML headings using <h2> and <h3> tags where appropriate.
- Use descriptive headings that reflect the content of each section.
- Embed internal links ONLY as valid HTML anchor tags as specified above.

Now, given the blog brief provided in the user message, generate 15 outputs and return them in JSON form:

{
  "output1": "...",   // Unique Blog Title Recommendation
  "output2": "...",   // H1
  "output3": "...",   // SEO Title (<= 60 characters)
  "output4": "...",   // Meta Description (<= 155 characters)
  "output5": "...",   // URL Slug suggestion
  "output6": "...",   // Primary keyword (repeat)
  "output7": "...",   // Up to 5 secondary keywords (comma separated or bullet formatted)
  "output8": "...",   // Full article (~wordCount from brief if provided, otherwise ~1200 words, always within ±10%) with internal links embedded as HTML <a> tags and structured with <h2>/<h3> headings
  "output9": "...",   // Internal links table (Anchor | URL | Purpose)
  "output10": "...",  // 5 FAQs with answers
  "output11": "...",  // Image alt text suggestions (3–5)
  "output12": "...",  // Two detailed image prompts (hero + mid-article)
  "output13": "...",  // JSON-LD schema (Article + FAQ) as a JSON-LD string
  "output14": "...",  // Readability & risk metrics summary (plain text)
  "output15": "..."   // Checklist verification (plain text with checkmarks or bullet points)
}

Remember: respond ONLY with this JSON object, and fully obey all the constraints above.
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
