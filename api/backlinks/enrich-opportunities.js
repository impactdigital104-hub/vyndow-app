import admin from "../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId, website: null };
  }

  const website = snap.data() || {};
  const effectiveUid = website.ownerUid || uid;
  const effectiveWebsiteId = website.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId, website };
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function isLikelyDomain(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  if (v.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function asNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function classifyCategory(domain) {
  const value = String(domain || "").toLowerCase();

  if (
    /(directory|directories|citation|citations|yellowpages|business-listing|businesslisting|local-listing|localdirectory|submitlink|webdirectory)/.test(
      value
    )
  ) {
    return "directory";
  }

  if (/(listing|listings|review|reviews|marketplace|catalog|catalogue)/.test(value)) {
    return "listing";
  }

  if (/(association|society|council|chamber|federation|board|guild|institute|academy)/.test(value)) {
    return "association";
  }

  if (/(forum|community|board|discuss|discussion|quora|reddit|stackexchange|discourse)/.test(value)) {
    return "forum";
  }

  if (/(resource|resources|links|linkhub|library|knowledgebase|guides)/.test(value)) {
    return "resource page";
  }

  if (/(news|magazine|journal|media|press|times|post|herald|chronicle|gazette|wire)/.test(value)) {
    return "publication";
  }

  if (/(blog|blogs|medium|substack)/.test(value)) {
    return "blog";
  }

  return "other";
}

function categoryToMethod(category) {
  switch (category) {
    case "directory":
      return "directory listing";
    case "listing":
      return "profile submission";
    case "blog":
      return "guest post";
    case "association":
      return "membership";
    case "publication":
      return "editorial / PR";
    case "forum":
      return "manual review";
    case "resource page":
      return "outreach";
    default:
      return "manual review";
  }
}

function categoryToDifficulty(category) {
  switch (category) {
    case "directory":
    case "listing":
      return "easy";
    case "blog":
    case "forum":
    case "resource page":
      return "medium";
    case "publication":
    case "association":
      return "hard";
    default:
      return "medium";
  }
}

function extractAuthorityMetric(result) {
  const directCandidates = [
    result?.domain_rank,
    result?.rank,
    result?.rank_absolute,
    result?.authority_score,
    result?.domain_ascore,
    result?.domain_authority,
    result?.page_rank,
    result?.domain_from_rank,
    result?.domain_to_rank,
  ];

  for (const candidate of directCandidates) {
    const value = asNum(candidate, null);
    if (value != null) return Math.round(value);
  }

  const fallbackCandidates = [
    result?.referring_domains,
    result?.referring_main_domains,
    result?.backlinks,
  ];

  for (const candidate of fallbackCandidates) {
    const value = asNum(candidate, null);
    if (value != null) return Math.round(value);
  }

  return null;
}

async function postDataForSeoSummaryBatch(domains) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("Missing DATAFORSEO credentials on server.");
  }

  const safeDomains = uniqueStrings(domains.map((item) => normalizeDomain(item)).filter((item) => isLikelyDomain(item)));

  if (!safeDomains.length) {
    return new Map();
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const body = safeDomains.map((domain) => ({
    target: domain,
    include_subdomains: true,
    include_indirect_links: true,
    exclude_internal_backlinks: false,
    internal_list_limit: 10,
  }));

  const response = await fetch("https://api.dataforseo.com/v3/backlinks/summary/live", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }

  if (!json) {
    throw new Error("DataForSEO returned a non-JSON response.");
  }

  if (json?.status_code !== 20000) {
    throw new Error(json?.status_message || "DataForSEO request failed.");
  }

  const tasks = Array.isArray(json?.tasks) ? json.tasks : [];
  const out = new Map();

  safeDomains.forEach((domain, index) => {
    const task = tasks[index];
    if (!task || task.status_code !== 20000) {
      out.set(domain, {
        domainAuthority: null,
        partial: true,
      });
      return;
    }

    const result = Array.isArray(task?.result) ? task.result[0] || {} : {};
    out.set(domain, {
      domainAuthority: extractAuthorityMetric(result),
      partial: extractAuthorityMetric(result) == null,
    });
  });

  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};

    if (!websiteId) {
      return res.status(400).json({ error: "Missing websiteId" });
    }

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();
    const backlinksModuleRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks`
    );

    const backlinksSnap = await backlinksModuleRef.get();
    const backlinksData = backlinksSnap.exists ? backlinksSnap.data() || {} : {};

    const gapOpportunities = Array.isArray(backlinksData?.gapOpportunities)
      ? backlinksData.gapOpportunities
      : [];

    if (!gapOpportunities.length) {
      return res.status(400).json({
        error: "Run Gap Analysis first to generate backlink opportunities.",
      });
    }

    const MAX_ROWS = 250;
    const BATCH_SIZE = 50;

    const sortedRows = gapOpportunities
      .map((item) => ({
        referringDomain: normalizeDomain(item?.referringDomain || item?.normalizedDomain || ""),
        normalizedDomain: normalizeDomain(item?.normalizedDomain || item?.referringDomain || ""),
        linkedCompetitors: uniqueStrings(item?.linkedCompetitors || []).map((entry) => normalizeDomain(entry)),
        linkedCompetitorCount: Number.isFinite(Number(item?.linkedCompetitorCount))
          ? Number(item.linkedCompetitorCount)
          : uniqueStrings(item?.linkedCompetitors || []).length,
        source: String(item?.source || "competitor_gap").trim() || "competitor_gap",
        discoveredAt: item?.discoveredAt || null,
        updatedAt: item?.updatedAt || null,
      }))
      .filter((item) => isLikelyDomain(item.normalizedDomain))
      .sort((a, b) => {
        if (b.linkedCompetitorCount !== a.linkedCompetitorCount) {
          return b.linkedCompetitorCount - a.linkedCompetitorCount;
        }
        return a.normalizedDomain.localeCompare(b.normalizedDomain);
      });

    const rowsToProcess = sortedRows.slice(0, MAX_ROWS);
    const authorityMap = new Map();
    let partialCount = 0;

    for (let start = 0; start < rowsToProcess.length; start += BATCH_SIZE) {
      const batch = rowsToProcess.slice(start, start + BATCH_SIZE);
      const metrics = await postDataForSeoSummaryBatch(batch.map((row) => row.normalizedDomain));

      for (const row of batch) {
        const metric = metrics.get(row.normalizedDomain) || { domainAuthority: null, partial: true };
        authorityMap.set(row.normalizedDomain, metric);
        if (metric.partial) partialCount += 1;
      }
    }

    const nowIso = new Date().toISOString();

    const enrichedGapOpportunities = rowsToProcess.map((row) => {
      const metric = authorityMap.get(row.normalizedDomain) || { domainAuthority: null, partial: true };
      const category = classifyCategory(row.normalizedDomain);
      const acquisitionMethod = categoryToMethod(category);
      const difficulty = categoryToDifficulty(category);

      return {
        referringDomain: row.referringDomain,
        normalizedDomain: row.normalizedDomain,
        linkedCompetitors: row.linkedCompetitors,
        linkedCompetitorCount: row.linkedCompetitorCount,
        domainAuthority: metric.domainAuthority,
        category,
        acquisitionMethod,
        difficulty,
        source: "competitor_gap_enriched",
        discoveredAt: row.discoveredAt || nowIso,
        enrichedAt: nowIso,
        updatedAt: nowIso,
      };
    });

    const enrichmentMeta = {
      totalEnriched: enrichedGapOpportunities.length,
      processedCount: rowsToProcess.length,
      partialCount,
      capped: sortedRows.length > MAX_ROWS,
      capUsed: MAX_ROWS,
      source: "dataforseo_backlinks_summary_live + lightweight_classification",
      generatedAt: nowTs(),
      updatedAt: nowTs(),
    };

    await backlinksModuleRef.set(
      {
        enrichedGapOpportunities,
        enrichmentMeta,
        updatedAt: nowTs(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      enrichedGapOpportunities,
      enrichmentMeta: {
        totalEnriched: enrichedGapOpportunities.length,
        processedCount: rowsToProcess.length,
        partialCount,
        capped: sortedRows.length > MAX_ROWS,
        capUsed: MAX_ROWS,
        source: "dataforseo_backlinks_summary_live + lightweight_classification",
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
    });
  } catch (e) {
    console.error("enrich-opportunities error:", e);
    return res.status(500).json({
      error: "We could not analyze backlink opportunities right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
