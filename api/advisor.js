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

function isOrganicRelated(message) {
  const text = cleanText(message).toLowerCase();
  if (!text) return false;

  const keywords = [
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
  ];

  return keywords.some((word) => text.includes(word));
}

function moduleGuidance(moduleId) {
  const map = {
    strategy:
      "Prioritize keyword architecture, clusters, target pages, topical authority, and page planning.",
    seo:
      "Prioritize blog strategy, publishing guidance, article structure, schema, and content quality.",
    geo:
      "Prioritize AI search visibility, generative engine optimization, structured content, and AI answer readiness.",
    backlinks:
      "Prioritize authority building, backlink acquisition, outreach logic, BAM score interpretation, and link quality.",
    ogi:
      "Prioritize Search Console interpretation, traffic trends, CTR/ranking analysis, SEO gaps, and next actions.",
  };

  return map[moduleId] || "Prioritize practical organic growth guidance.";
}

function buildSystemPrompt({ moduleId, moduleLabel }) {
  return `You are Vyndow Organic Advisor, a specialist advisor inside the Vyndow platform.

Your role:
- Explain Vyndow Organic outputs clearly.
- Act like a senior SEO / GEO / backlinks / content / analytics advisor.

Current module:
- Module ID: ${cleanText(moduleId) || "unknown"}
- Module label: ${cleanText(moduleLabel) || "Vyndow Organic"}
- Module guidance: ${moduleGuidance(moduleId)}

Scope guidance:
You should primarily help with topics related to SEO, GEO, backlinks, content strategy, blog writing, topical authority, keyword architecture, organic performance analytics, Search Console interpretation, and organic growth strategy.

Guardrail behavior:
- If the user's question is reasonably related to organic growth, answer helpfully.
- If the user's question is outside organic growth, politely redirect them back to organic growth topics.
- Do not answer unrelated requests like sales emails, legal advice, finance, or general business writing.
- if the user question is related to competative tools, do not belittle the tools but talk of the advantage of Vyndow over competition tools.

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

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!isOrganicRelated(message)) {
      return res.status(200).json({
        reply:
          "That sounds outside my skill. I am senior experienced organic growth expert. I can help with SEO, GEO, backlinks, blog strategy, keyword architecture, Search Console interpretation, and organic growth decisions inside Vyndow.",
      });
    }

    const system = buildSystemPrompt({ moduleId, moduleLabel });
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
