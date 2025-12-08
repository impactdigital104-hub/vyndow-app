// /api/generate.js
// Vyndow SEO – Anatta blog generator backend (V1)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message:
        "Vyndow SEO /api/generate is live. Please call this endpoint with POST and a JSON body.",
      exampleBody: {
        topic:
          "How to Support a Loved One Struggling with Drug Dependency",
        primaryKeyword: "support loved one drug dependency",
        secondaryKeywords: [
          "help someone with drug dependency",
          "family support for addiction"
        ],
        wordCount: 1200,
        seoIntent: "informational",
        notes: "Keep the tone gentle, family-focused, and non-medical."
      }
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is not set in environment variables."
    });
  }

  // Brief coming from the front-end
  const brief = req.body || {};

  // 1) System prompt: tells the model how Vyndow SEO should behave
  const SYSTEM_PROMPT = `
You are VYNDOW SEO, an advanced professional SEO content engine.
Your job is to take a blog brief plus a fixed brand profile and generate EXACTLY 15 outputs.
You MUST respond ONLY with a valid JSON object with keys "output1" through "output15".
Each value MUST be a string. Do not include any other top-level keys.

Brand profile (Anatta – fixed):

- Luxury, confidential, voluntary, one-on-one residential support for people facing alcohol, drug, or behavioural dependency.
- Non-medical, spiritual, compassionate, humanistic approach.
- Target audience: affluent families and high-functioning professionals and business owners in metros like Mumbai/Pune, worried about a loved one or themselves.
- Tone of voice: warm, empathetic, non-judgmental, clear, hopeful, adult-to-adult, non-clinical.
- Values: dignity, privacy, confidentiality, compassion, acceptance, personal transformation, spiritual self-awareness.
- Prohibited: no words like "cure", "100% success", "guaranteed results" or any similar absolute claims; no graphic descriptions; no fear-based or shaming language.
- Prefer "clients", "individuals", "loved one" instead of "addict" or "patient".

Now, given the blog brief provided in the user message, generate 15 outputs and return them in JSON form:

{
  "output1": "...",   // Unique Blog Title Recommendation
  "output2": "...",   // H1
  "output3": "...",   // SEO Title (<= 60 characters)
  "output4": "...",   // Meta Description (<= 155 characters)
  "output5": "...",   // URL Slug suggestion
  "output6": "...",   // Primary keyword (repeat)
  "output7": "...",   // Up to 5 secondary keywords (comma separated or bullet formatted)
  "output8": "...",   // Full article (~1200 words, ±10%) with some internal links embedded as plain URLs
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

  // 2) Build the user content with the brief
  const userContent = `
Here is the blog brief for this run:

${JSON.stringify(brief, null, 2)}

Use the fixed Anatta profile and the SYSTEM PROMPT instructions.
Generate all 15 outputs as described, and return them as a single JSON object.
`;

  try {
    // Call OpenAI Chat Completions API
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
        temperature: 0.7
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
    const raw = data.choices?.[0]?.message?.content || "";

    // 🔧 strip ```json ... ``` fences if present before JSON.parse
    let cleaned = raw.trim();

    if (cleaned.startsWith("```")) {
      // remove first line (``` or ```json)
      const firstNewline = cleaned.indexOf("\n");
      if (firstNewline !== -1) {
        cleaned = cleaned.substring(firstNewline + 1);
      }
      // remove trailing ```
      const lastFence = cleaned.lastIndexOf("```");
      if (lastFence !== -1) {
        cleaned = cleaned.substring(0, lastFence);
      }
      cleaned = cleaned.trim();
    }

    let outputs;
    try {
      outputs = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: put raw text in output8 if parsing fails
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
        output15:
          "Model did not respond with valid JSON; raw content placed into output8."
      };
    }

    return res.status(200).json({
      ok: true,
      receivedBrief: brief,
      outputs
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "Unexpected server error",
      detail: String(err)
    });
  }
}
