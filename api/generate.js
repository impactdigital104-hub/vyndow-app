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
  // Helper: check mandatory fields and apply defaults
  function normalizeBrief(raw) {
    const b = raw || {};
    const errors = [];

    function isBlank(value) {
      return (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      );
    }

    // ---------------------------
    // MANDATORY FIELDS (no defaults)
    // ---------------------------

    // A1: Brand Description
    if (isBlank(b.brandDescription)) {
      errors.push("A1 (Brand Description) is required.");
    }

    // A2: Target Audience Persona
    if (isBlank(b.targetAudience)) {
      errors.push("A2 (Target Audience Persona) is required.");
    }

    // B1: Primary Keyword
    if (isBlank(b.primaryKeyword)) {
      errors.push("B1 (Primary Keyword) is required.");
    }

    // C1: Blog Topic / Working Title
    if (isBlank(b.topic)) {
      errors.push("C1 (Blog Topic / Working Title) is required.");
    }

    // C2: Desired Word Count
    if (isBlank(b.wordCount)) {
      errors.push("C2 (Desired Word Count) is required.");
    }

    // ---------------------------
    // OPTIONAL FIELDS WITH DEFAULTS
    // ---------------------------

    const normalized = {
      ...b,

      // A3: Tone of Voice
      toneOfVoice: !isBlank(b.toneOfVoice)
        ? b.toneOfVoice
        : "Conversational, easy-to-read, warm and reassuring.",

      // A4: Brand Values
      brandValues: !isBlank(b.brandValues)
        ? b.brandValues
        : "Empathetic, ethical, helpful, non-judgmental.",

      // A5: Prohibited Words / Claims
      prohibitedClaims: !isBlank(b.prohibitedClaims)
        ? b.prohibitedClaims
        : "Avoid medical diagnoses, promises of cure, self-detox advice, and triggering or sensational language.",

      // B2: Secondary Keywords (ensure array)
      secondaryKeywords: Array.isArray(b.secondaryKeywords)
        ? b.secondaryKeywords
        : [],

      // B3: Long-tail phrases (if you add this later)
      longTailPhrases: Array.isArray(b.longTailPhrases)
        ? b.longTailPhrases
        : [],

      // B4: Existing blogs for internal links (B4)
      existingBlogs: !isBlank(b.existingBlogs) ? b.existingBlogs : "",

      // B5: Competitor URLs
      competitorUrls: Array.isArray(b.competitorUrls)
        ? b.competitorUrls
        : [],

      // B6: SEO Intent
      seoIntent: !isBlank(b.seoIntent) ? b.seoIntent : "informational",

      // B7: Geography
      geography: !isBlank(b.geography)
        ? b.geography
        : "Global / not region-specific.",

      // C3: Writing Style
      stylePreferences: !isBlank(b.stylePreferences)
        ? b.stylePreferences
        : "Clear, structured, educational and empathetic, with smooth flow.",

      // C4: Internal linking preference
      internalLinkingPreference: !isBlank(b.internalLinkingPreference)
        ? b.internalLinkingPreference
        : "Add internal links contextually (recommended).",

      // C5: Image preference
      imagePreference: !isBlank(b.imagePreference)
        ? b.imagePreference
        : "Photorealistic, human-centric, warm and hopeful.",

      // C6: Layout preference
      layoutPreference: !isBlank(b.layoutPreference)
        ? b.layoutPreference
        : "Short paragraphs, meaningful sub-headings, and some bullet points for readability.",

      // D1: Industry restrictions
      industryRestrictions: !isBlank(b.industryRestrictions)
        ? b.industryRestrictions
        : "Follow standard ethical guidelines: no medical, legal, or financial advice; no guarantees of outcomes; no unsafe or self-harm recommendations.",

      // D2: Sensitivity notes
      sensitivityNotes: !isBlank(b.sensitivityNotes)
        ? b.sensitivityNotes
        : "",

      // E1–E3: Optional premium inputs
      contentPillar: !isBlank(b.contentPillar) ? b.contentPillar : "",
      competitorGaps: !isBlank(b.competitorGaps) ? b.competitorGaps : "",
      futureTopicHints: !isBlank(b.futureTopicHints)
        ? b.futureTopicHints
        : ""
    };

    return { brief: normalized, errors };
  }
  
   // Receive and normalize the brief from frontend
  const { brief, errors } = normalizeBrief(req.body);

  // If mandatory fields are missing, stop and send a clear error
  if (errors.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid required fields in the Vyndow brief.",
      details: errors
    });
  }

  const requestedWords = brief.wordCount || 1200;

  // ---------------------------------------
  // STEP 1 — PROMPT FOR THE LONG ARTICLE
  // ---------------------------------------
  const LONG_ARTICLE_PROMPT = `
You are VYNDOW SEO, an expert long-form SEO writer for whichever brand is described in the brief.

Write a comprehensive, deeply detailed, 1500-word article in clean HTML (<h1>, <h2>, <h3>, <p>, <a>).
Absolutely NO JSON for this step.
Do NOT include any <!DOCTYPE>, <html>, <head>, or <body> tags.
Start directly with the main content (for example, an <h1> or <h2>), followed by <p> paragraphs, etc.

CRITICAL REQUIREMENTS:

- ABSOLUTE MINIMUM LENGTH: 1300 words.
- TARGET LENGTH: 1400–1600 words regardless of requestedWords. 
- Do NOT stop at the minimum. Expand deeply.

- Include AT LEAST EIGHT <h2> sections.
- Each <h2> section MUST contain 3–4 detailed, well-developed paragraphs.

- Add examples, explanations, scenarios, analogies, optional case-style storytelling, 
  and elaborated insights to naturally increase length.

- Output 8 is the highest-priority task. If there is any trade-off, spend 
  more depth and length here.
- Use <h3> sub-sections wherever helpful.

- IMPORTANT: Do NOT create any HTML hyperlinks in this article.
  - Do NOT use <a> tags at all.
  - Do NOT include any href="" attributes.
  - If you want to highlight phrases, use <strong> or <em>, but never <a>.

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
    // Extra safety: remove any HTML links if the model still adds them
if (typeof articleText === "string") {
  // Remove opening <a ...> tags
  articleText = articleText.replace(/<a\b[^>]*>/gi, "");
  // Remove closing </a> tags
  articleText = articleText.replace(/<\/a>/gi, "");
}

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
CRITICAL FORMAT RULE:
- Every output value (output1, output2, ..., output7, output9, ..., output15) MUST be a SINGLE STRING.
- Never return arrays or nested objects for any output. If you need multiple rows/items, put them inside one string separated by line breaks.


Here is the blog brief:
${JSON.stringify(brief, null, 2)}

// The brief includes an "imagePreference" field that describes the desired
// visual style (for example: "photorealistic", "flat vector illustration",
// "isometric", etc.). Always honour this imagePreference when generating
// output11 (image alt texts) and output12 (image prompts).

The long article has already been generated separately.
Generate the rest of the outputs exactly as described:

1 → Blog Title Recommendation  
2 → H1  
3 → SEO Title (<= 60 chars)  
4 → Meta Description (<= 155 chars)  
5 → URL Slug  
6 → Primary Keyword  
7 → Secondary Keywords (comma-separated)  

9 → Internal links table as a single multiline string in plain text.
Use ONE row for EACH internal link provided in the brief (for example, 3 links = 3 rows).
For the URL column, always copy the actual URL from the brief exactly as it appears.
Never invent domains like "example.com" or placeholders like "URL1 from brief".
Write the table in plain text with a header row "Anchor | URL | Purpose" and then one row per link, for example:
Anchor | URL | Purpose
Anchor text 1 | <actual URL from the brief> | Short purpose
Anchor text 2 | <actual URL from the brief> | Short purpose
10 → FAQs as one multiline string. Include 4–5 Q/A pairs. Each answer must be at least 50 words. Use the format: "Q1. ...\nA1. ...\n\nQ2. ...\nA2. ..." etc.
11 → Image alt text suggestions as one multiline string.
Each line must start with "1. ", "2. ", "3. ", etc.
Write 3–5 alt texts, each 1–2 sentences, max ~160 characters.
Each alt text should:
- Be descriptive and accessible (good for screen readers).
- Match the topic, brand description, target audience, and geography.
- Reflect the imagePreference from the brief (e.g. photorealistic, vector, isometric).
Do NOT include any HTML tags. Do NOT start with "Image of" or "Picture of"; just describe the scene.

12 → Image prompts as one multiline string.
Each line must start with "1. ", "2. ", "3. ", etc.
Write 3–5 rich prompts for an AI image generator.
Each prompt must:
- Explicitly mention the imagePreference from the brief (e.g. "photorealistic", "flat vector illustration", "3D isometric").
- Reflect the brand description, target audience, topic, and geography (if present).
- Be safe and on-brand for sensitive topics (no graphic imagery, no pills/needles/self-harm; focus on people, environment, emotions, and recovery).
- Be around 25–45 words.

13 → JSON-LD schemas as one multiline string.
Produce TWO numbered schemas:

1. Blog schema as a JSON-LD object with "@type": "BlogPosting".
   - Use the topic and brief to fill "headline" and "description".
   - If possible, infer a sensible "mainEntityOfPage" from the slug or URL info.
   - Use the brand/organization name from the brief where appropriate (e.g. as author or publisher).

2. FAQ schema as a JSON-LD object with "@type": "FAQPage".
   - Include 4–5 Question/acceptedAnswer pairs.
   - Questions and answers must align with the topic, brand description, and target audience.
   - Answers should be concise but informative (roughly 40–80 words).

Format everything as a single multiline STRING like:

1. { ...BlogPosting JSON-LD... }
2. { ...FAQPage JSON-LD... }

Do NOT include markdown fences or commentary. The outer response must remain valid JSON where output13 is a single string value containing these two numbered JSON-LD blocks.

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
