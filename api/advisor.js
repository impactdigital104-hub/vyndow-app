import admin from "./firebaseAdmin";
import { resolveEffectiveContext } from "./ogi/buildContext";

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
function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function extractTargetAudience(strategyDocs) {
  const businessContext = safeObj(strategyDocs.businessContext);
  const businessProfile = safeObj(strategyDocs.businessProfile);

  const aiVersion = safeObj(businessContext.aiVersion);
  const finalVersion = safeObj(businessContext.finalVersion);

  const audienceFromAi = aiVersion.target_audience;
  const audienceText = Array.isArray(audienceFromAi)
    ? audienceFromAi.map((item) => cleanText(item)).filter(Boolean).join(", ")
    : cleanText(audienceFromAi);

  return (
    audienceText ||
    cleanText(finalVersion.targetAudience) ||
    cleanText(finalVersion.targetCustomer) ||
    cleanText(businessProfile.targetCustomer)
  );
}

function pickKeywordClusteringView(docData) {
  const data = safeObj(docData);

  if (
    safeObj(data.finalVersion) &&
    (safeArr(data.finalVersion.pillars).length || safeArr(data.finalVersion.shortlist).length)
  ) {
    return safeObj(data.finalVersion);
  }

  if (
    safeObj(data.userVersion) &&
    (safeArr(data.userVersion.pillars).length || safeArr(data.userVersion.shortlist).length)
  ) {
    return safeObj(data.userVersion);
  }

  if (
    safeObj(data.aiVersion) &&
    (safeArr(data.aiVersion.pillars).length || safeArr(data.aiVersion.shortlist).length)
  ) {
    return safeObj(data.aiVersion);
  }

  return {};
}

function pickKeywordMappingView(docData) {
  const data = safeObj(docData);

  if (
    data.approved === true &&
    safeObj(data.finalVersion) &&
    (safeArr(data.finalVersion.existingPages).length || safeArr(data.finalVersion.gapPages).length)
  ) {
    return safeObj(data.finalVersion);
  }

  if (
    safeObj(data.userVersion) &&
    (safeArr(data.userVersion.existingPages).length || safeArr(data.userVersion.gapPages).length)
  ) {
    return safeObj(data.userVersion);
  }

  return {
    existingPages: safeArr(data.existingPages),
    gapPages: safeArr(data.gapPages),
  };
}

function normalizePageLabel(item) {
  return firstNonEmpty(
    item?.pageLabel,
    item?.label,
    item?.title,
    item?.primaryKeyword,
    item?.keyword,
    item?.suggestedSlug,
    item?.slug,
    item?.url
  );
}

function deriveStrategyProgress({
  businessProfile,
  pageDiscovery,
  businessContext,
  keywordClustering,
  keywordMapping,
  pageOptimization,
  authorityPlan,
}) {
  const steps = [
    {
      label: "Business Profile",
      done: safeObj(businessProfile).status === "draft" || Object.keys(safeObj(businessProfile)).length > 0,
    },
    {
      label: "Page Discovery",
      done: Object.keys(safeObj(pageDiscovery)).length > 0,
    },
    {
      label: "URL Audit",
      done: safeObj(pageDiscovery).auditLocked === true,
    },
    {
      label: "Business Context",
      done: safeObj(businessContext).approved === true,
    },
    {
      label: "Keyword Clustering",
      done: safeObj(keywordClustering).approved === true,
    },
    {
      label: "Keyword Mapping",
      done: safeObj(keywordMapping).approved === true,
    },
    {
      label: "On-Page Blueprint",
      done: Object.keys(safeObj(pageOptimization).pages).length > 0,
    },
    {
      label: "90-Day Plan",
      done: Object.keys(safeObj(authorityPlan)).length > 0,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const totalCount = steps.length;
  const nextIncomplete = steps.find((step) => !step.done)?.label || "";

  let overallStatus = "Not started";
  if (completedCount === 0) overallStatus = "Not started";
  else if (completedCount >= totalCount) overallStatus = "Complete";
  else overallStatus = "In progress";

  return {
    overallStatus,
    completedCount,
    totalCount,
    nextIncomplete,
    completedLabels: steps.filter((step) => step.done).map((step) => step.label),
  };
}

async function loadStrategyAdvisorContext({ uid, websiteId }) {
  const cleanWebsiteId = cleanText(websiteId);
  if (!cleanWebsiteId) return null;

  const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, cleanWebsiteId);
  const db = admin.firestore();

  const strategyBase = `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy`;

  const websiteRef = db.doc(`users/${effectiveUid}/websites/${effectiveWebsiteId}`);
  const businessProfileRef = db.doc(`${strategyBase}/businessProfile`);
  const pageDiscoveryRef = db.doc(`${strategyBase}/pageDiscovery`);
  const businessContextRef = db.doc(`${strategyBase}/businessContext`);
  const keywordClusteringRef = db.doc(`${strategyBase}/keywordClustering`);
  const keywordMappingRef = db.doc(`${strategyBase}/keywordMapping`);
  const pageOptimizationRef = db.doc(`${strategyBase}/pageOptimization`);
  const authorityPlanRef = db.doc(`${strategyBase}/authorityPlan`);

  const [
    websiteSnap,
    businessProfileSnap,
    pageDiscoverySnap,
    businessContextSnap,
    keywordClusteringSnap,
    keywordMappingSnap,
    pageOptimizationSnap,
    authorityPlanSnap,
  ] = await Promise.all([
    websiteRef.get(),
    businessProfileRef.get(),
    pageDiscoveryRef.get(),
    businessContextRef.get(),
    keywordClusteringRef.get(),
    keywordMappingRef.get(),
    pageOptimizationRef.get(),
    authorityPlanRef.get(),
  ]);

  const websiteDoc = websiteSnap.exists ? safeObj(websiteSnap.data()) : {};
  const businessProfile = businessProfileSnap.exists ? safeObj(businessProfileSnap.data()) : {};
  const pageDiscovery = pageDiscoverySnap.exists ? safeObj(pageDiscoverySnap.data()) : {};
  const businessContext = businessContextSnap.exists ? safeObj(businessContextSnap.data()) : {};
  const keywordClustering = keywordClusteringSnap.exists ? safeObj(keywordClusteringSnap.data()) : {};
  const keywordMapping = keywordMappingSnap.exists ? safeObj(keywordMappingSnap.data()) : {};
  const pageOptimization = pageOptimizationSnap.exists ? safeObj(pageOptimizationSnap.data()) : {};
  const authorityPlan = authorityPlanSnap.exists ? safeObj(authorityPlanSnap.data()) : {};

  const keywordClusteringView = pickKeywordClusteringView(keywordClustering);
  const keywordMappingView = pickKeywordMappingView(keywordMapping);

  const pillars = safeArr(keywordClusteringView.pillars)
    .map((pillar) => ({
      name: cleanText(pillar?.name),
      keywordCount: safeArr(pillar?.keywords).length,
    }))
    .filter((pillar) => pillar.name);

  const mappedPages = safeArr(keywordMappingView.existingPages)
    .map((page) => normalizePageLabel(page))
    .filter(Boolean);

  const gapPages = safeArr(keywordMappingView.gapPages)
    .map((page) => normalizePageLabel(page))
    .filter(Boolean);

  const optimizedPages = Object.values(safeObj(pageOptimization.pages))
    .map((page) => firstNonEmpty(page?.title, page?.url, page?.primaryKeyword))
    .filter(Boolean);

  const progress = deriveStrategyProgress({
    businessProfile,
    pageDiscovery,
    businessContext,
    keywordClustering,
    keywordMapping,
    pageOptimization,
    authorityPlan,
  });

  const totalShortlistedKeywords = safeArr(keywordClusteringView.shortlist).length;
  const blueprintPageCount = Object.keys(safeObj(pageOptimization.pages)).length;

  return {
    effectiveUid,
    effectiveWebsiteId,
    businessName: firstNonEmpty(businessProfile.businessName, websiteDoc.name, websiteDoc.websiteName),
    websiteUrl: firstNonEmpty(websiteDoc.websiteUrl, websiteDoc.domain, websiteDoc.url, websiteDoc.siteUrl),
    industry: firstNonEmpty(businessProfile.industry, safeObj(websiteDoc.profile).industry),
    targetAudience: extractTargetAudience({ businessProfile, businessContext }),
    pillars,
    totalShortlistedKeywords,
    mappedPages,
    gapPages,
    optimizedPages,
    blueprintPageCount,
    authorityPlanExists: Object.keys(authorityPlan).length > 0,
    progress,
  };
}

function formatStrategyDataForPrompt(strategyData) {
  if (!strategyData) {
    return "Current Strategy Data: Not available for this request.";
  }

  const lines = ["Current Strategy Data:"];

  const topLines = [
    ["Business Name", strategyData.businessName],
    ["Website URL", strategyData.websiteUrl],
    ["Industry", strategyData.industry],
    ["Target Audience", strategyData.targetAudience],
  ];

  for (const [label, value] of topLines) {
    const cleanValue = cleanText(value);
    if (cleanValue) {
      lines.push(`${label}: ${cleanValue}`);
    }
  }

  if (strategyData.pillars.length) {
    lines.push("");
    lines.push("Pillars:");
    for (const pillar of strategyData.pillars.slice(0, 6)) {
      const suffix =
        Number.isFinite(pillar.keywordCount) && pillar.keywordCount > 0
          ? ` (${pillar.keywordCount} keywords)`
          : "";
      lines.push(`- ${pillar.name}${suffix}`);
    }
  }

  if (strategyData.totalShortlistedKeywords > 0) {
    lines.push("");
    lines.push(`Keyword Shortlist Count: ${strategyData.totalShortlistedKeywords}`);
  }

  if (strategyData.mappedPages.length) {
    lines.push("");
    lines.push("Mapped Pages:");
    for (const page of strategyData.mappedPages.slice(0, 8)) {
      lines.push(`- ${page}`);
    }
  }

  if (strategyData.gapPages.length) {
    lines.push("");
    lines.push("Identified Content Gaps:");
    for (const page of strategyData.gapPages.slice(0, 6)) {
      lines.push(`- ${page}`);
    }
  }

  if (strategyData.blueprintPageCount > 0 || strategyData.authorityPlanExists) {
    lines.push("");
    lines.push("Strategy Outputs:");
    if (strategyData.blueprintPageCount > 0) {
      lines.push(`- On-Page Blueprint pages generated: ${strategyData.blueprintPageCount}`);
    }
    if (strategyData.authorityPlanExists) {
      lines.push("- 90-Day Authority Plan: available");
    }
  }

  if (strategyData.progress) {
    lines.push("");
    lines.push(
      `Roadmap Status: ${strategyData.progress.overallStatus} (${strategyData.progress.completedCount}/${strategyData.progress.totalCount} major steps completed)`
    );
    if (strategyData.progress.nextIncomplete) {
      lines.push(`Next Incomplete Major Step: ${strategyData.progress.nextIncomplete}`);
    }
  }

  return lines.join("\n");
}

function getPageFieldSchema({ moduleId, routePath, pageLabel, workflowStep }) {
  const route = cleanText(routePath);
  const page = cleanText(pageLabel).toLowerCase();
  const step = cleanText(workflowStep).toLowerCase();
  const module = cleanText(moduleId).toLowerCase();

  if (
    module === "strategy" ||
    route === "/seo/strategy" ||
    route.startsWith("/seo/strategy/") ||
    page === "strategy"
  ) {
    const baseFields = [
      {
        name: "businessDescription",
        label: "Business Description",
        purpose:
          "Helps Vyndow understand what the business offers, how it is positioned, and what kind of messaging should shape the organic strategy.",
        whatToEnter:
          "Enter a short plain-English description of the business, its services or products, who it serves, and what makes it different.",
      },
      {
        name: "targetAudience",
        label: "Target Audience",
        purpose:
          "Helps Vyndow understand who the business wants to attract so strategy recommendations align with the right audience intent.",
        whatToEnter:
          "Enter the main customer types you want to reach, such as small business owners, local families, enterprise buyers, or students.",
      },
      {
        name: "targetGeography",
        label: "Target Geography",
        purpose:
          "Defines the location focus of the organic strategy so Vyndow can shape recommendations around the right market.",
        whatToEnter:
          "Enter the country, city, region, or service area you want to target in search.",
      },
      {
        name: "competitorUrls",
        label: "Competitor URLs",
        purpose:
          "Used by Vyndow to analyze competing websites for keyword coverage, topical focus, and organic opportunities.",
        whatToEnter:
          "Enter website URLs of real search competitors offering similar services, products, or content to a similar audience.",
      },
    ];

    const businessProfileFields = [
      {
        name: "businessName",
        label: "Business Name",
        purpose:
          "Helps Vyndow identify the brand it is building the strategy for.",
        whatToEnter:
          "Enter the actual business or brand name exactly as you want it reflected in strategy and content guidance.",
      },
      {
        name: "websiteUrl",
        label: "Website URL",
        purpose:
          "Tells Vyndow which website the strategy should be built around.",
        whatToEnter:
          "Enter the main website address for the business, usually the homepage domain.",
      },
      ...baseFields,
    ];

    if (step.includes("business profile")) {
      return businessProfileFields;
    }

    return baseFields;
  }

  if (
    module === "seo" ||
    route === "/seo" ||
    (route.startsWith("/seo/") && !route.startsWith("/seo/strategy") && !route.startsWith("/seo/backlinks"))
  ) {
    return [
      {
        name: "blogTopic",
        label: "Blog Topic",
        purpose:
          "Defines the main topic the content piece should cover.",
        whatToEnter:
          "Enter the exact topic or angle you want the blog to focus on.",
      },
      {
        name: "primaryKeyword",
        label: "Primary Keyword",
        purpose:
          "Tells Vyndow the main search term the blog should target.",
        whatToEnter:
          "Enter the core keyword or phrase the blog should be optimized around.",
      },
      {
        name: "brandVoice",
        label: "Brand Voice",
        purpose:
          "Helps Vyndow shape the tone and style of the content.",
        whatToEnter:
          "Enter the tone you want, such as professional, friendly, expert, warm, or authoritative.",
      },
    ];
  }

  if (module === "geo" || route === "/geo" || route.startsWith("/geo/")) {
    return [
      {
        name: "targetPage",
        label: "Target Page",
        purpose:
          "Tells Vyndow which page is being prepared for stronger AI-search visibility.",
        whatToEnter:
          "Enter or select the page you want to improve for GEO guidance.",
      },
      {
        name: "answerFocus",
        label: "Answer Focus",
        purpose:
          "Helps Vyndow understand what type of AI answer coverage the page should support.",
        whatToEnter:
          "Enter the topic, question theme, or intent the page should answer clearly.",
      },
      {
        name: "geoObjective",
        label: "GEO Objective",
        purpose:
          "Defines the outcome Vyndow should optimize for in AI-driven search visibility.",
        whatToEnter:
          "Enter the result you want, such as clearer AI answers, stronger topical coverage, or better citation readiness.",
      },
    ];
  }

  if (
    module === "backlinks" ||
    route === "/seo/backlinks" ||
    route.startsWith("/seo/backlinks/")
  ) {
    return [
      {
        name: "competitorDomain",
        label: "Competitor Domain",
        purpose:
          "Helps Vyndow compare backlink profiles against relevant competitors.",
        whatToEnter:
          "Enter a competing domain that targets similar search demand in your market.",
      },
      {
        name: "targetWebsite",
        label: "Target Website",
        purpose:
          "Identifies the website whose backlink authority is being improved.",
        whatToEnter:
          "Enter the main website or domain you want backlink recommendations for.",
      },
      {
        name: "backlinkObjective",
        label: "Backlink Objective",
        purpose:
          "Clarifies the type of authority-building outcome the user wants.",
        whatToEnter:
          "Enter the main goal, such as closing a backlink gap, improving authority, or finding outreach targets.",
      },
    ];
  }

  if (
    module === "ogi" ||
    route === "/growth/intelligence" ||
    route.startsWith("/growth/intelligence/")
  ) {
    return [
      {
        name: "reportSelection",
        label: "Report Selection",
        purpose:
          "Determines which organic performance report the user is viewing or generating.",
        whatToEnter:
          "Choose the report or website context you want Vyndow to analyze.",
      },
      {
        name: "analysisScope",
        label: "Analysis Scope",
        purpose:
          "Defines which part of organic performance the report should focus on.",
        whatToEnter:
          "Enter or select the area you want insight on, such as traffic trends, ranking gaps, or CTR issues.",
      },
    ];
  }

  return [];
}

function formatPageFieldsForPrompt(pageFields) {
  if (!pageFields.length) {
    return "No specific page fields are available for this page yet.";
  }

  return pageFields
    .map(
      (field) =>
        `- ${field.label}\n  Purpose: ${field.purpose}\n  What the user should enter: ${field.whatToEnter}`
    )
    .join("\n");
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

  return (
    map[moduleId] ||
    "Prioritize practical organic growth guidance and help the user complete the current Vyndow workflow."
  );
}

function buildSystemPrompt({
  moduleId,
  moduleLabel,
  routePath,
  pageLabel,
  workflowStep,
  pageFields,
  strategyData,
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
- When a user asks about a field, explain what the field means, why Vyndow asks for it, and what type of information they should enter.

Current Vyndow context:
- Current Vyndow Module: ${cleanText(moduleLabel) || "Vyndow Organic"}
- Current Module ID: ${cleanText(moduleId) || "unknown"}
- Current Page: ${cleanText(pageLabel) || "Unknown page"}
- Current Route: ${cleanText(routePath) || "Unknown route"}
- Current Workflow Step: ${cleanText(workflowStep) || "Not available"}
- Module Guidance: ${moduleGuidance(moduleId)}

Current Page Fields:
${formatPageFieldsForPrompt(pageFields)}

${formatStrategyDataForPrompt(strategyData)}

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
- what should I fill in competitor url
- what should I write in business profile

Field-aware behavior:
- If the user asks about a page field, use the Current Page Fields list first.
- Explain the field in plain English.
- Explain why Vyndow uses that field.
- Guide the user on the type of information to enter.
- If the exact field is not listed, still answer using the nearest current-page context and stay practical.

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
- Do not pretend to have user data unless it was actually loaded for this request.
- If Strategy data is present, use it carefully and only reference values that appear in Current Strategy Data.
- If a Strategy field is missing, unavailable, or not shown in Current Strategy Data, say you do not have that specific Strategy data yet and then give general guidance.
- If the user asks what they should do next, use Next Incomplete Major Step first when Strategy data is available.
- If the user asks what pages to build first, use Mapped Pages or Identified Content Gaps when available.
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
   const uid = await getUidFromRequest(req);

    const message = cleanText(req.body?.message);
    const moduleId = cleanText(req.body?.moduleId);
    const moduleLabel = cleanText(req.body?.moduleLabel);
    const routePath = cleanText(req.body?.routePath);
    const pageLabel = cleanText(req.body?.pageLabel);
const workflowStep = cleanText(req.body?.workflowStep);
const websiteId = cleanText(req.body?.websiteId);

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

    const pageFields = getPageFieldSchema({
      moduleId,
      routePath,
      pageLabel,
      workflowStep,
    });

    let strategyData = null;

    if (
      websiteId &&
      (
        moduleId === "strategy" ||
        routePath === "/seo/strategy" ||
        routePath.startsWith("/seo/strategy/")
      )
    ) {
      try {
        strategyData = await loadStrategyAdvisorContext({ uid, websiteId });
      } catch (strategyError) {
        console.error("advisor strategy context error", strategyError);
        strategyData = null;
      }
    }

    const system = buildSystemPrompt({
      moduleId,
      moduleLabel,
      routePath,
      pageLabel,
      workflowStep,
      pageFields,
      strategyData,
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
