import admin from "../firebaseAdmin";
import {
  fetchAllSearchAnalyticsRows,
  getConnectedGscContext,
} from "../_lib/gscClient";

function toIsoDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date, days) {
  const safe = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  safe.setUTCDate(safe.getUTCDate() + days);
  return safe;
}

function buildComparisonRanges() {
  const today = new Date();
  const yesterday = addDaysUTC(today, -1);

  const last28Start = addDaysUTC(today, -28);
  const previous28Start = addDaysUTC(today, -56);
  const previous28End = addDaysUTC(today, -29);

  return {
    last28Start: toIsoDateUTC(last28Start),
    last28End: toIsoDateUTC(yesterday),
    previous28Start: toIsoDateUTC(previous28Start),
    previous28End: toIsoDateUTC(previous28End),
  };
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildQuerySummary(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    query: row?.keys?.[0] || "",
    clicks: safeNumber(row?.clicks),
    impressions: safeNumber(row?.impressions),
    ctr: safeNumber(row?.ctr),
    position: safeNumber(row?.position),
  }));
}

function buildPageSummary(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    page: row?.keys?.[0] || "",
    clicks: safeNumber(row?.clicks),
    impressions: safeNumber(row?.impressions),
    ctr: safeNumber(row?.ctr),
    position: safeNumber(row?.position),
  }));
}

function buildQueryPageMapping(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    query: row?.keys?.[0] || "",
    page: row?.keys?.[1] || "",
    clicks: safeNumber(row?.clicks),
    impressions: safeNumber(row?.impressions),
    ctr: safeNumber(row?.ctr),
    position: safeNumber(row?.position),
  }));
}

async function buildPeriodDatasets({ uid, property, tokens, startDate, endDate }) {
  const [queryRows, pageRows, queryPageRows] = await Promise.all([
    fetchAllSearchAnalyticsRows({
      uid,
      property,
      tokens,
      startDate,
      endDate,
      dimensions: ["query"],
    }),
    fetchAllSearchAnalyticsRows({
      uid,
      property,
      tokens,
      startDate,
      endDate,
      dimensions: ["page"],
    }),
    fetchAllSearchAnalyticsRows({
      uid,
      property,
      tokens,
      startDate,
      endDate,
      dimensions: ["query", "page"],
    }),
  ]);

  return {
    querySummary: buildQuerySummary(queryRows),
    pageSummary: buildPageSummary(pageRows),
    queryPageMapping: buildQueryPageMapping(queryPageRows),
  };
}

export async function buildSearchAnalyticsForWebsite({ uid, websiteId }) {
  const { property, tokens } = await getConnectedGscContext(uid, websiteId);
  const ranges = buildComparisonRanges();

  const [last28Days, previous28Days] = await Promise.all([
    buildPeriodDatasets({
      uid,
      property,
      tokens,
      startDate: ranges.last28Start,
      endDate: ranges.last28End,
    }),
    buildPeriodDatasets({
      uid,
      property,
      tokens,
      startDate: ranges.previous28Start,
      endDate: ranges.previous28End,
    }),
  ]);

  return {
    last28Days,
    previous28Days,
    comparisonMeta: {
      last28Start: ranges.last28Start,
      last28End: ranges.last28End,
      previous28Start: ranges.previous28Start,
      previous28End: ranges.previous28End,
      property,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use GET or POST." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token." });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const websiteId = String(
      req.method === "GET" ? req.query?.websiteId || "" : req.body?.websiteId || ""
    ).trim();

    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId." });
    }

    const payload = await buildSearchAnalyticsForWebsite({ uid, websiteId });

    return res.status(200).json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    console.error("ogi/searchAnalytics error:", error);

    const message =
      error?.message ||
      "Failed to fetch Google Search Console search analytics data.";

    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
}
