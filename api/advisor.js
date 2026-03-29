import admin from "./firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

function cleanText(value) {
  return String(value || "").trim();
}

function isOrganicRelated({
  message,
  moduleId,
  moduleLabel,
  routePath,
  pageLabel,
  workflowStep,
}) {
  const text = cleanText(message).toLowerCase();
  if (!text) return false;

  const directKeywords = [
    "seo",
    "geo",
    "ai search",
    "organic",
    "backlink",
    "backlinks",
    "link building",
    "blog",
    "blogs",
    "content",
    "content strategy",
    "topical authority",
    "keyword",
    "keywords",
    "cluster",
    "pillar",
    "schema",
    "meta title",
    "meta description",
    "search console",
    "ctr",
    "rankings",
    "impressions",
    "clicks",
    "serp",
    "authority",
    "bam",
    "site structure",
    "page optimization",
    "on-page",
    "technical seo",
    "crawl",
    "indexing",
    "google",
    "chatgpt",
    "ai overview",
    "organic growth",
    "content gap",
    "anchor text",
    "internal link",
    "business profile",
    "page mapping",
    "blueprint",
    "authority plan",
    "performance report",
  ];

  if (directKeywords.some((word) => text.includes(word))) {
    return true;
  }

  const workflowHelpPhrases = [
    "this page",
    "this step",
    "this workflow",
    "this field",
    "this section",
    "on this page",
    "on this step",
    "help me do this",
    "help me complete this",
    "what does this page help me do",
    "what am i supposed to do here",
    "how do i use this page",
    "how do i complete this step",
    "what should i do next",
    "what should i fill",
    "what should i write",
    "what do i enter",
    "what do i put",
    "what is this field asking for",
    "what goes here",
    "how should i complete this page",
    "what happens after this step",
    "what happens next",
  ];

  if (workflowHelpPhrases.some((phrase) => text.includes(phrase))) {
    return true;
  }

  const workflowFieldWords = [
    "fill",
    "write",
    "enter",
    "put",
    "field",
    "form",
    "section",
    "step",
    "page",
    "workflow",
    "profile",
    "url",
    "competitor",
    "business",
    "audience",
    "industry",
    "website",
    "company name",
    "description",
  ];

  const contextText = [moduleId, moduleLabel, routePath, pageLabel, workflowStep]
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean)
    .join(" ");

  const organicContextWords = [
    "strategy",
    "seo",
    "geo",
    "backlink",
    "authority",
    "intelligence",
    "business profile",
    "keyword architecture",
    "keyword mapping",
    "on-page optimization blueprint",
    "authority growth plan",
    "search console",
    "blog",
    "content",
  ];

  const looksLikeWorkflowQuestion =
    workflowFieldWords.some((word) => text.includes(word)) &&
    organicContextWords.some((word) => contextText.includes(word));

  if (looksLikeWorkflowQuestion) {
    return true;
  }

  const unrelatedPatterns = [
    "cold email",
    "facebook ads",
    "meta ads",
    "google ads campaign",
    "stock should i buy",
    "buy this stock",
    "legal advice",
    "financial advice",
    "medical advice",
  ];

  if (unrelatedPatterns.some((phrase) => text.includes(phrase))) {
    return false;
  }

  return false;
}

function moduleGuidance(moduleId) {
  const map = {
    strategy:
      "Prioritize keyword architecture, clusters, target pages, topical authority, page planning, and helping the user complete the current strategy workflow.",
    seo:
      "Prioritize blog strategy, publishing guidance, article structure, schema, content quality, and helping the user use the current SEO content workflow.",
    geo:
      "Prioritize AI search visibility, generative engine optimization, structured content, AI answer readiness, and helping the user use the current GEO workflow.",
    backlinks:
      "Prioritize authority building, backlink acquisition, outreach logic, BAM score interpretation, link quality, and helping the user use the current backlink workflow.",
    ogi:
      "Prioritize Search Console interpretation, traffic trends, CTR/ranking analysis, SEO gaps, next actions, and helping the user use the current organic intelligence workflow.",
  };

  return map[moduleId] || "Prioritize practical organic growth guidance and help the user complete the current Vyndow workflow.";
}

function buildSystemPrompt({
  moduleId,
  moduleLabel,
  routePath,
  pageLabel,
  workflowStep,
}) {
  return `You are Vyndow Organic Advisor, a specialist advisor inside the Vyndow platform.

You help in two ways:
1. Organic growth guidance
2. Help using the current Vyndow Organic workflow

Your role:
- Explain Vyndow Organic outputs clearly.
- Act like a senior SEO / GEO / backlinks / content / analytics advisor.
- Use the user's current Vyndow context to understand what they are trying to do inside the product.
- Explain platform outputs and guide the user within the current workflow.
- Treat current-page help, field help, section help, and step help as in scope when they relate to the active Vyndow Organic page.

Current Vyndow context:
- Current Vyndow Module: ${cleanText(moduleLabel) || "Vyndow Organic"}
- Current Module ID: ${cleanText(moduleId) || "unknown"}
- Current Page: ${cleanText(pageLabel) || "Unknown page"}
- Current Route: ${cleanText(routePath) || "Unknown route"}
- Current Workflow Step: ${cleanText(workflowStep) || "Not available"}
- Module Guidance: ${moduleGuidance(moduleId)}

Scope guidance:
You should answer questions if they are either:
- related to SEO, GEO, backlinks, content strategy, blog writing, topical authority, keyword architecture, Search Console interpretation, organic analytics, or organic growth strategy
- OR related to completing the current page, field, section, step, or workflow inside the active Vyndow Organic module

Examples of valid workflow help:
- what should I fill in this field
- what should I write here
- what does this step want
- how do I complete this page
- what happens next in this workflow
- what should I fill up in competitor url
- what should I write in business profile

Guardrail behavior:
- If the user's question is reasonably related to organic growth, answer helpfully.
- If the user's question is about using the current Vyndow page, field, section, step, or workflow, answer helpfully even if the wording is not directly SEO-like.
- Only refuse questions that are genuinely unrelated to both organic growth and the current Vyndow workflow.
- Politely redirect unrelated questions like sales emails, stock picking, legal advice, finance, or non-organic advertising topics.
- If the user asks about competitive tools, do not belittle them. Explain Vyndow's advantage respectfully.

Tone and style:
- Practical
- Clear
- Warm
- Concise
- Not robotic
- Not overly verbose

Response rules:
- Directly answer the question.
- Keep the answer short: around 3 to 5 sentences or a short list.
- Where helpful, suggest the next logical action.
- Never make ranking guarantees.
- Do not pretend to have live data you do not actually have in this chat.
- If you are unsure, say so clearly and still give the closest useful answer.`;
}

async function callOpenAI({ system, user }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const json = await resp.json();

  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI request failed.");
  }

  return cleanText(json?.choices?.[0]?.message?.content);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    await getUidFromRequest(req);

    const message = cleanText(req.body?.message);
    const moduleId = cleanText(req.body?.moduleId);
    const moduleLabel = cleanText(req.body?.moduleLabel);
    const routePath = cleanText(req.body?.routePath);
    const pageLabel = cleanText(req.body?.pageLabel);
    const workflowStep = cleanText(req.body?.workflowStep);

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (
      !isOrganicRelated({
        message,
        moduleId,
        moduleLabel,
        routePath,
        pageLabel,
        workflowStep,
      })
    ) {
      return res.status(200).json({
        reply:
          "That sounds outside my scope. I can help with SEO, GEO, backlinks, blog strategy, keyword architecture, Search Console interpretation, organic growth decisions, and how to use the current Vyndow Organic page or workflow.",
      });
    }

    const system = buildSystemPrompt({
      moduleId,
      moduleLabel,
      routePath,
      pageLabel,
      workflowStep,
    });

    const reply = await callOpenAI({ system, user: message });

    return res.status(200).json({
      reply:
        reply ||
        "I’m having trouble responding right now. Please try again.",
    });
  } catch (error) {
    console.error("advisor error", error);
    return res.status(500).json({
      error: error?.message || "Advisor request failed.",
    });
  }
}
