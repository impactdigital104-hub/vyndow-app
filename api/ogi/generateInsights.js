import admin from "../firebaseAdmin";
import { buildSearchAnalyticsForWebsite } from "./searchAnalytics";
import { buildVyndowContextForWebsite } from "./buildContext";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- HELPERS --------------------
function safeStr(x) {
  return String(x || "").trim();
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function roundTo(value, digits = 2) {
  const n = safeNum(value, 0);
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function pctChange(current, previous) {
  const c = safeNum(current, 0);
  const p = safeNum(previous, 0);
  if (p === 0) {
    if (c === 0) return 0;
    return 100;
  }
  return roundTo(((c - p) / p) * 100, 2);
}

function sumMetric(rows, key) {
  return safeArr(rows).reduce((sum, row) => sum + safeNum(row?.[key], 0), 0);
}

function weightedCtr(rows) {
  const clicks = sumMetric(rows, "clicks");
  const impressions = sumMetric(rows, "impressions");
  if (!impressions) return 0;
  return roundTo((clicks / impressions) * 100, 2);
}

function weightedPosition(rows) {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const row of safeArr(rows)) {
    const impressions = safeNum(row?.impressions, 0);
    const position = safeNum(row?.position, 0);
    if (impressions <= 0) continue;
    weightedSum += position * impressions;
    weightTotal += impressions;
  }

  if (!weightTotal) return 0;
  return roundTo(weightedSum / weightTotal, 2);
}

function makeTopMetrics(gscData) {
  const lastRows = safeArr(gscData?.last28Days?.querySummary);
  const prevRows = safeArr(gscData?.previous28Days?.querySummary);

  const lastImpressions = sumMetric(lastRows, "impressions");
  const prevImpressions = sumMetric(prevRows, "impressions");

  const lastClicks = sumMetric(lastRows, "clicks");
  const prevClicks = sumMetric(prevRows, "clicks");

  const lastCtr = weightedCtr(lastRows);
  const prevCtr = weightedCtr(prevRows);

  const lastPosition = weightedPosition(lastRows);
  const prevPosition = weightedPosition(prevRows);

  return {
    impressions: {
      last28: roundTo(lastImpressions, 0),
      previous28: roundTo(prevImpressions, 0),
      changePercent: pctChange(lastImpressions, prevImpressions),
    },
    clicks: {
      last28: roundTo(lastClicks, 0),
      previous28: roundTo(prevClicks, 0),
      changePercent: pctChange(lastClicks, prevClicks),
    },
    ctr: {
      last28: lastCtr,
      previous28: prevCtr,
      changePercent: pctChange(lastCtr, prevCtr),
    },
    position: {
      last28: lastPosition,
      previous28: prevPosition,
      changePercent: pctChange(prevPosition ? -lastPosition : 0, prevPosition ? -prevPosition : 0),
    },
  };
}

function compactQueryRows(rows, limit = 25) {
  return safeArr(rows)
    .filter((row) => safeStr(row?.query))
    .sort((a, b) => safeNum(b?.impressions) - safeNum(a?.impressions))
    .slice(0, limit)
    .map((row) => ({
      query: safeStr(row?.query),
      clicks: safeNum(row?.clicks),
      impressions: safeNum(row?.impressions),
      ctr: roundTo(row?.ctr, 2),
      position: roundTo(row?.position, 2),
    }));
}

function compactPageRows(rows, limit = 20) {
  return safeArr(rows)
    .filter((row) => safeStr(row?.page))
    .sort((a, b) => safeNum(b?.impressions) - safeNum(a?.impressions))
    .slice(0, limit)
    .map((row) => ({
      page: safeStr(row?.page),
      clicks: safeNum(row?.clicks),
      impressions: safeNum(row?.impressions),
      ctr: roundTo(row?.ctr, 2),
      position: roundTo(row?.position, 2),
    }));
}

function compactQueryPageRows(rows, limit = 30) {
  return safeArr(rows)
    .filter((row) => safeStr(row?.query) && safeStr(row?.page))
    .sort((a, b) => safeNum(b?.impressions) - safeNum(a?.impressions))
    .slice(0, limit)
    .map((row) => ({
      query: safeStr(row?.query),
      page: safeStr(row?.page),
      clicks: safeNum(row?.clicks),
      impressions: safeNum(row?.impressions),
      ctr: roundTo(row?.ctr, 2),
      position: roundTo(row?.position, 2),
    }));
}

function compactMappedTargetPages(rows, limit = 25) {
  return safeArr(rows)
    .slice(0, limit)
    .map((row) => ({
      targetUrl: safeStr(row?.targetUrl),
      primaryKeyword: safeStr(row?.primaryKeyword),
      pageLabel: safeStr(row?.pageLabel),
      pageType: safeStr(row?.pageType),
      sourceDocument: safeStr(row?.sourceDocument),
    }));
}

function compactOptimizedPages(rows, limit = 25) {
  return safeArr(rows)
    .slice(0, limit)
    .map((row) => ({
      pageId: safeStr(row?.pageId),
      url: safeStr(row?.url),
      title: safeStr(row?.title),
      approved: row?.approved === true,
      primaryKeyword: safeStr(row?.primaryKeyword),
      pageType: safeStr(row?.pageType),
      h1: safeStr(row?.h1),
    }));
}

function compactAuthorityBlogs(rows, limit = 20) {
  return safeArr(rows)
    .slice(0, limit)
    .map((row) => ({
      month: safeStr(row?.month),
      blogTitle: safeStr(row?.blogTitle),
      primaryKeyword: safeStr(row?.primaryKeyword),
      pillarName: safeStr(row?.pillarName),
      slug: safeStr(row?.slug),
      intent: safeStr(row?.intent),
      ctaFocus: safeStr(row?.ctaFocus),
      impactTag: safeStr(row?.impactTag),
    }));
}

function compactDraftBlogs(rows, limit = 20) {
  return safeArr(rows)
    .slice(0, limit)
    .map((row) => ({
      draftId: safeStr(row?.draftId),
      month: safeStr(row?.month),
      blogTitle: safeStr(row?.blogTitle),
      primaryKeyword: safeStr(row?.primaryKeyword),
      pillarName: safeStr(row?.pillarName),
      slug: safeStr(row?.slug),
      status: safeStr(row?.status),
      source: safeStr(row?.source),
    }));
}

function buildCompactAiPayload({ gscData, contextData }) {
  const topMetrics = makeTopMetrics(gscData);

  return {
    comparisonMeta: gscData?.comparisonMeta || {},
    topMetrics,
    gscHighlights: {
      last28TopQueries: compactQueryRows(gscData?.last28Days?.querySummary, 25),
      previous28TopQueries: compactQueryRows(gscData?.previous28Days?.querySummary, 20),
      last28TopPages: compactPageRows(gscData?.last28Days?.pageSummary, 20),
      previous28TopPages: compactPageRows(gscData?.previous28Days?.pageSummary, 15),
      last28QueryPagePairs: compactQueryPageRows(gscData?.last28Days?.queryPageMapping, 30),
    },
    strategyHighlights: {
      businessProfile: contextData?.strategyContext?.businessProfile || {},
      businessContext: contextData?.strategyContext?.businessContext || {},
      mappedTargetPages: compactMappedTargetPages(contextData?.derivedContext?.mappedTargetPages, 25),
      optimizedPages: compactOptimizedPages(contextData?.derivedContext?.optimizedPages, 25),
      authorityPlannedBlogs: compactAuthorityBlogs(contextData?.derivedContext?.authorityPlannedBlogs, 20),
      draftBlogTargets: compactDraftBlogs(contextData?.derivedContext?.draftBlogTargets, 20),
      knownStrategyUrls: safeArr(contextData?.derivedContext?.knownStrategyUrls).slice(0, 50),
    },
  };
}

function buildPrompt(aiPayload) {
  return `
You are Vyndow Organic Growth Intelligence.

You are analyzing:
1. Google Search Console performance data
2. Vyndow SEO strategy context

Your job is to return a concise, strategic, structured JSON output for a future UI.

STRICT RULES:
- Return VALID JSON only
- No markdown
- No code fences
- No commentary outside JSON
- Maximum 10 insights
- Prefer 8 insights if enough data exists
- Do not invent metrics not present in the input
- Do not forecast future traffic
- Keep language concise, actionable, and mostly non-technical
- Treat planned pages, planned blogs, and drafts as planned assets, not as live published assets
- Focus only on these six areas:
  1) Overall Organic Performance
  2) Keyword Opportunity Detection
  3) Cannibalization / Page Targeting Issues
  4) Underperforming Pages
  5) Content Gap Opportunities
  6) Vyndow Strategy Performance

JSON OUTPUT SHAPE:
{
  "summary": {
    "executiveSummary": "",
    "topMetrics": {
      "impressions": { "last28": 0, "previous28": 0, "changePercent": 0 },
      "clicks": { "last28": 0, "previous28": 0, "changePercent": 0 },
      "ctr": { "last28": 0, "previous28": 0, "changePercent": 0 },
      "position": { "last28": 0, "previous28": 0, "changePercent": 0 }
    }
  },
  "insights": [
    {
      "title": "",
      "type": "",
      "diagnosis": "",
      "whyItMatters": "",
      "recommendation": "",
      "generatedFix": {
        "titleTag": "",
        "metaDescription": "",
        "faqIdeas": [],
        "newPageSuggestion": "",
        "notes": ""
      },
      "actionType": ""
    }
  ],
  "actionPlan": [""]
}

FIELD RULES:
- summary.executiveSummary = 80 to 140 words
- insights = maximum 10
- each insight.type should be one of:
  "performance" | "keyword_opportunity" | "cannibalization" | "underperforming_page" | "content_gap" | "strategy_alignment"
- each insight.actionType should be one of:
  "seo" | "geo" | "strategy" | "backlink" | "general"
- generatedFix fields should be present in every insight, but may be empty strings if not relevant
- faqIdeas must always be an array
- actionPlan should contain 4 to 8 short prioritized action strings

INPUT DATA:
${JSON.stringify(aiPayload)}
  `.trim();
}

async function callOpenAIForInsights({ aiPayload }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const prompt = buildPrompt(aiPayload);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON Organic Growth Intelligence engine. Return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const msg =
      data?.error?.message ||
      `OpenAI error (status ${resp.status}) generating insights`;
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content || "";

  function extractJsonObject(s) {
    const str = String(s || "").trim();
    const fenced = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    const firstBrace = str.indexOf("{");
    const lastBrace = str.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return str.slice(firstBrace, lastBrace + 1);
    }
    return str;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    try {
      parsed = JSON.parse(extractJsonObject(text));
    } catch (e2) {
      throw new Error("MODEL_RETURNED_NON_JSON");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("BAD_AI_RESPONSE");
  }

  if (!parsed.summary || typeof parsed.summary !== "object") {
    throw new Error("BAD_AI_SUMMARY");
  }

  if (!Array.isArray(parsed.insights)) {
    throw new Error("BAD_AI_INSIGHTS");
  }

  if (!Array.isArray(parsed.actionPlan)) {
    throw new Error("BAD_AI_ACTION_PLAN");
  }

  parsed.insights = parsed.insights.slice(0, 10).map((item) => ({
    title: safeStr(item?.title),
    type: safeStr(item?.type),
    diagnosis: safeStr(item?.diagnosis),
    whyItMatters: safeStr(item?.whyItMatters),
    recommendation: safeStr(item?.recommendation),
    generatedFix: {
      titleTag: safeStr(item?.generatedFix?.titleTag),
      metaDescription: safeStr(item?.generatedFix?.metaDescription),
      faqIdeas: safeArr(item?.generatedFix?.faqIdeas).map((x) => safeStr(x)).filter(Boolean).slice(0, 6),
      newPageSuggestion: safeStr(item?.generatedFix?.newPageSuggestion),
      notes: safeStr(item?.generatedFix?.notes),
    },
    actionType: safeStr(item?.actionType),
  }));

  parsed.actionPlan = parsed.actionPlan
    .map((x) => safeStr(x))
    .filter(Boolean)
    .slice(0, 8);

  return parsed;
}

function buildGrowthRows(lastRows, previousRows, keyName) {
  const map = new Map();

  function touch(key) {
    const safeKey = safeStr(key);
    if (!safeKey) return null;
    if (!map.has(safeKey)) {
      map.set(safeKey, {
        [keyName]: safeKey,
        last28Clicks: 0,
        previous28Clicks: 0,
        growth: 0,
        growthPercent: 0,
        impressions: 0,
        position: 0,
      });
    }
    return map.get(safeKey);
  }

  for (const row of safeArr(previousRows)) {
    const entry = touch(row?.[keyName]);
    if (!entry) continue;
    entry.previous28Clicks += safeNum(row?.clicks, 0);
  }

  for (const row of safeArr(lastRows)) {
    const entry = touch(row?.[keyName]);
    if (!entry) continue;
    entry.last28Clicks += safeNum(row?.clicks, 0);
    entry.impressions += safeNum(row?.impressions, 0);
    entry.position = safeNum(row?.position, 0);
  }

  return Array.from(map.values())
    .map((row) => {
      const growth = safeNum(row?.last28Clicks) - safeNum(row?.previous28Clicks);
      return {
        ...row,
        growth,
        growthPercent: pctChange(row?.last28Clicks, row?.previous28Clicks),
        impressions: roundTo(row?.impressions, 0),
        position: roundTo(row?.position, 2),
      };
    })
    .filter((row) => safeNum(row?.growth) > 0)
    .sort((a, b) => {
      const growthDiff = safeNum(b?.growth) - safeNum(a?.growth);
      if (growthDiff !== 0) return growthDiff;
      const pctDiff = safeNum(b?.growthPercent) - safeNum(a?.growthPercent);
      if (pctDiff !== 0) return pctDiff;
      return safeNum(b?.last28Clicks) - safeNum(a?.last28Clicks);
    })
    .slice(0, 10);
}

function buildContributionBlock(rows, keyName) {
  const totalClicks = sumMetric(rows, "clicks");

  const topRows = safeArr(rows)
    .filter((row) => safeStr(row?.[keyName]))
    .sort((a, b) => safeNum(b?.clicks) - safeNum(a?.clicks))
    .slice(0, 10)
    .map((row) => ({
      [keyName]: safeStr(row?.[keyName]),
      clicks: safeNum(row?.clicks, 0),
      contributionPercent: totalClicks
        ? roundTo((safeNum(row?.clicks, 0) / totalClicks) * 100, 2)
        : 0,
      position: roundTo(row?.position, 2),
      impressions: roundTo(row?.impressions, 0),
    }));

  const top10ContributionPercent = roundTo(
    topRows.reduce((sum, row) => sum + safeNum(row?.contributionPercent, 0), 0),
    2
  );

  return {
    rows: topRows,
    top10ContributionPercent,
  };
}

function buildPerformanceAnalysis(gscData) {
  return {
    topGrowingPages: buildGrowthRows(
      gscData?.last28Days?.pageSummary,
      gscData?.previous28Days?.pageSummary,
      "page"
    ),
    topGrowingQueries: buildGrowthRows(
      gscData?.last28Days?.querySummary,
      gscData?.previous28Days?.querySummary,
      "query"
    ),
    topQueriesByClicks: buildContributionBlock(
      gscData?.last28Days?.querySummary,
      "query"
    ),
    topPagesByClicks: buildContributionBlock(
      gscData?.last28Days?.pageSummary,
      "page"
    ),
  };
}

function buildPatternAnalysis(performanceAnalysis) {
  const topQueriesContribution = safeNum(
    performanceAnalysis?.topQueriesByClicks?.top10ContributionPercent,
    0
  );
  const topPagesContribution = safeNum(
    performanceAnalysis?.topPagesByClicks?.top10ContributionPercent,
    0
  );
  const topGrowingPage = performanceAnalysis?.topGrowingPages?.[0];
  const topGrowingQuery = performanceAnalysis?.topGrowingQueries?.[0];

  const sentences = [];

  if (topQueriesContribution >= 70) {
    sentences.push(
      `Organic traffic is currently concentrated in a relatively narrow query set, with the top 10 queries driving ${roundTo(
        topQueriesContribution,
        0
      )}% of total clicks.`
    );
  } else {
    sentences.push(
      `Organic traffic is relatively diversified at the query level, with the top 10 queries contributing ${roundTo(
        topQueriesContribution,
        0
      )}% of total clicks.`
    );
  }

  if (topPagesContribution >= 70) {
    sentences.push(
      `Traffic is also concentrated across a small number of landing pages, with the top 10 pages contributing ${roundTo(
        topPagesContribution,
        0
      )}% of all clicks.`
    );
  } else {
    sentences.push(
      `Traffic is spread across a broader page mix, with the top 10 pages contributing ${roundTo(
        topPagesContribution,
        0
      )}% of all clicks.`
    );
  }

  if (topGrowingPage?.page) {
    sentences.push(
      `The strongest page-level momentum is currently on ${topGrowingPage.page}, which gained ${safeNum(
        topGrowingPage.growth,
        0
      )} clicks versus the previous period.`
    );
  }

  if (topGrowingQuery?.query) {
    sentences.push(
      `At the query level, "${topGrowingQuery.query}" shows the clearest upward movement and should be watched for scaling opportunities.`
    );
  }

  return {
    text: sentences.slice(0, 4).join(" "),
  };
}

function missingGscMessage(error) {
  const msg = safeStr(error?.message).toLowerCase();
  return (
    msg.includes("google search console property is not connected") ||
    msg.includes("google search console account tokens are missing") ||
    msg.includes("google search console refresh token is missing")
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use GET or POST." });
  }

  try {
    const uid = await getUidFromRequest(req);

    const websiteId = safeStr(
      req.method === "GET" ? req.query?.websiteId : req.body?.websiteId
    );

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    let gscData;
    try {
      gscData = await buildSearchAnalyticsForWebsite({ uid, websiteId });
    } catch (error) {
      if (missingGscMessage(error)) {
        return res.status(400).json({
          ok: false,
          error: "Google Search Console is not connected for this website.",
        });
      }
      throw error;
    }

    let contextData;
    try {
      contextData = await buildVyndowContextForWebsite({ uid, websiteId });
    } catch (error) {
      contextData = {
        effectiveContext: {
          effectiveUid: uid,
          effectiveWebsiteId: websiteId,
        },
        strategyContext: {
          businessProfile: {},
          businessContext: {},
          keywordMapping: {},
          pageOptimization: {},
          authorityPlan: {},
        },
        blogDraftContext: {
          drafts: [],
        },
        derivedContext: {
          mappedTargetPages: [],
          optimizedPages: [],
          authorityPlannedBlogs: [],
          draftBlogTargets: [],
          knownStrategyUrls: [],
        },
        contextWarning: error?.message || "Strategy context could not be loaded fully.",
      };
    }

    const aiPayload = buildCompactAiPayload({ gscData, contextData });
    const aiResult = await callOpenAIForInsights({ aiPayload });

    const performanceAnalysis = buildPerformanceAnalysis(gscData);
    const patternAnalysis = buildPatternAnalysis(performanceAnalysis);

    return res.status(200).json({
      ok: true,
      summary: aiResult.summary || {},
      insights: safeArr(aiResult.insights).slice(0, 10),
      actionPlan: safeArr(aiResult.actionPlan).slice(0, 8),
      performanceAnalysis,
      patternAnalysis,
      debugMeta: {
        websiteId,
        effectiveContext: contextData?.effectiveContext || {},
        comparisonMeta: gscData?.comparisonMeta || {},
        inputCounts: {
          last28QueryCount: safeArr(gscData?.last28Days?.querySummary).length,
          last28PageCount: safeArr(gscData?.last28Days?.pageSummary).length,
          last28QueryPageCount: safeArr(gscData?.last28Days?.queryPageMapping).length,
          mappedTargetPages: safeArr(contextData?.derivedContext?.mappedTargetPages).length,
          optimizedPages: safeArr(contextData?.derivedContext?.optimizedPages).length,
          authorityPlannedBlogs: safeArr(contextData?.derivedContext?.authorityPlannedBlogs).length,
          draftBlogTargets: safeArr(contextData?.derivedContext?.draftBlogTargets).length,
          knownStrategyUrls: safeArr(contextData?.derivedContext?.knownStrategyUrls).length,
        },
      },
    });
  } catch (error) {
    console.error("ogi/generateInsights error:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to generate Organic Growth Intelligence insights.",
    });
  }
}
