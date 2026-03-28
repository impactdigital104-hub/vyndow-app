"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from "firebase/firestore";

import VyndowShell from "../../../VyndowShell";
import AuthGate from "../../../components/AuthGate";
import { auth, db } from "../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../suiteLifecycleClient";

const PAGE_BG =
  "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)";
const CARD_BG = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
const CARD_BORDER = "1px solid rgba(124,58,237,0.20)";
const SHADOW = "0 10px 26px rgba(15,23,42,0.06)";

const PLAN_TARGETS = {
  free: { total: 25, foundation: 10, industry: 10, authority: 5 },
  starter: { total: 50, foundation: 20, industry: 20, authority: 10 },
  growth: { total: 100, foundation: 40, industry: 35, authority: 25 },
  pro: { total: 200, foundation: 80, industry: 70, authority: 50 },
};

const CATEGORY_WEIGHTS = {
  publication: 20,
  association: 18,
  blog: 15,
  directory: 8,
  listing: 8,
  forum: 5,
  "resource page": 12,
  resource_page: 12,
  other: 0,
};

const DIFFICULTY_PENALTIES = {
  easy: 0,
  medium: 10,
  hard: 20,
};

const TABLE_PAGE_SIZE = 50;

function cleanDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function normalizePlan(value) {
  const raw = String(value || "free").toLowerCase().trim();

  if (raw === "small_business") return "starter";
  if (raw === "enterprise") return "pro";
  if (PLAN_TARGETS[raw]) return raw;

  return "free";
}

function formatLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "—";

  return text
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatDate(value) {
  if (!value) return "—";

  let date = null;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  if (!date) return "—";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeCategory(value) {
  const raw = String(value || "other").trim().toLowerCase();

  if (!raw) return "other";
  if (raw === "resource" || raw === "resource-page" || raw === "resource_page") {
    return "resource page";
  }

  return raw;
}

function normalizeDifficulty(value) {
  const raw = String(value || "medium").trim().toLowerCase();

  if (raw === "easy" || raw === "medium" || raw === "hard") return raw;

  return "medium";
}

function normalizeOpportunity(item) {
  const normalizedDomain = cleanDomain(
    item?.normalizedDomain || item?.referringDomain || item?.domain || ""
  );

  if (!normalizedDomain) return null;

  const linkedCompetitors = Array.from(
    new Set(
      (
        Array.isArray(item?.linkedCompetitors)
          ? item.linkedCompetitors
          : Array.isArray(item?.competitors)
          ? item.competitors
          : []
      )
        .map((entry) => cleanDomain(entry))
        .filter(Boolean)
    )
  );

  const domainRankValue = Number(item?.domainRank);
  const domainRank = Number.isFinite(domainRankValue) ? domainRankValue : 0;

  const competitorCountValue = Number(
    item?.competitorCount ?? item?.linkedCompetitorCount ?? linkedCompetitors.length
  );
  const competitorCount = Number.isFinite(competitorCountValue)
    ? competitorCountValue
    : linkedCompetitors.length;

  return {
    normalizedDomain,
    referringDomain:
      String(item?.referringDomain || item?.domain || normalizedDomain).trim() ||
      normalizedDomain,
    linkedCompetitors,
    competitorCount,
    linkedCompetitorCount: competitorCount,
    domainRank,
    category: normalizeCategory(item?.category),
    method:
      String(item?.method || item?.acquisitionMethod || "manual review").trim() ||
      "manual review",
    difficulty: normalizeDifficulty(item?.difficulty),
  };
}

function hydrateStoredStrategyRow(item) {
  const base = normalizeOpportunity(item);
  if (!base) return null;

  const bamScoreValue = Number(item?.bamScore);
  const priorityScoreValue = Number(item?.priorityScore);

  return {
    ...base,
    bamScore: Number.isFinite(bamScoreValue)
      ? bamScoreValue
      : Number.isFinite(priorityScoreValue)
      ? priorityScoreValue
      : 0,
    priorityScore: Number.isFinite(priorityScoreValue)
      ? priorityScoreValue
      : Number.isFinite(bamScoreValue)
      ? bamScoreValue
      : 0,
    priorityTier: String(item?.priorityTier || "foundation").trim().toLowerCase() || "foundation",
    recommendedThisCycle: true,
  };
}

function getCategoryWeight(category) {
  return CATEGORY_WEIGHTS[normalizeCategory(category)] ?? 0;
}

function getDifficultyPenalty(difficulty) {
  return DIFFICULTY_PENALTIES[normalizeDifficulty(difficulty)] ?? 10;
}

function getPriorityTier(row) {
  const category = normalizeCategory(row?.category);
  const difficulty = normalizeDifficulty(row?.difficulty);
  const rank = Number.isFinite(Number(row?.domainRank)) ? Number(row.domainRank) : 0;

  if (category === "publication" || difficulty === "hard" || rank >= 60) {
    return "authority";
  }

  if (
    category === "blog" ||
    category === "resource page" ||
    category === "association" ||
    difficulty === "medium" ||
    rank >= 30
  ) {
    return "industry";
  }

  return "foundation";
}

function scoreOpportunity(row) {
  const competitorCount = Number.isFinite(Number(row?.competitorCount))
    ? Number(row.competitorCount)
    : 0;
  const domainRank = Number.isFinite(Number(row?.domainRank)) ? Number(row.domainRank) : 0;
  const categoryWeight = getCategoryWeight(row?.category);
  const difficultyPenalty = getDifficultyPenalty(row?.difficulty);

  const priorityScore = Math.round(
    competitorCount * 30 + domainRank * 0.5 + categoryWeight - difficultyPenalty
  );

  return {
    ...row,
    bamScore: priorityScore,
    priorityScore,
    priorityTier: getPriorityTier(row),
    recommendedThisCycle: true,
  };
}

function getPlanTargets(plan) {
  return PLAN_TARGETS[normalizePlan(plan)] || PLAN_TARGETS.free;
}

function sortByScoreDesc(rows) {
  return [...rows].sort((a, b) => {
    if (b.bamScore !== a.bamScore) return b.bamScore - a.bamScore;
    if (b.competitorCount !== a.competitorCount) return b.competitorCount - a.competitorCount;
    if (b.domainRank !== a.domainRank) return b.domainRank - a.domainRank;
    return a.normalizedDomain.localeCompare(b.normalizedDomain);
  });
}

function buildRecommendedRows(scoredRows, targets) {
  const byTier = {
    foundation: sortByScoreDesc(
      scoredRows.filter((row) => row.priorityTier === "foundation")
    ),
    industry: sortByScoreDesc(scoredRows.filter((row) => row.priorityTier === "industry")),
    authority: sortByScoreDesc(scoredRows.filter((row) => row.priorityTier === "authority")),
  };

  const selectedMap = new Map();

  function takeFromTier(tier, count) {
    const picked = [];

    for (const row of byTier[tier]) {
      if (picked.length >= count) break;
      if (selectedMap.has(row.normalizedDomain)) continue;

      selectedMap.set(row.normalizedDomain, row);
      picked.push(row);
    }

    return picked;
  }

  const selectedRows = [
    ...takeFromTier("foundation", targets.foundation),
    ...takeFromTier("industry", targets.industry),
    ...takeFromTier("authority", targets.authority),
  ];

  if (selectedRows.length < targets.total) {
    const fallbackRows = sortByScoreDesc(scoredRows).filter(
      (row) => !selectedMap.has(row.normalizedDomain)
    );

    for (const row of fallbackRows) {
      if (selectedRows.length >= targets.total) break;
      selectedMap.set(row.normalizedDomain, row);
      selectedRows.push(row);
    }
  }

  return sortByScoreDesc(selectedRows).slice(0, targets.total);
}

export default function BacklinkAuthorityStrategyPage() {
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [websites, setWebsites] = useState([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [suitePlan, setSuitePlan] = useState("free");

  const [pageState, setPageState] = useState("loading"); // loading | blocked | empty | ready | error
  const [pageError, setPageError] = useState("");
  const [strategyMeta, setStrategyMeta] = useState(null);
  const [strategyRows, setStrategyRows] = useState([]);
  const [generationState, setGenerationState] = useState("idle");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        await runSuiteLifecycleCheck(user.uid);
      } catch (e) {
        console.error("Suite lifecycle check failed:", e);
      }

      setUid(user.uid);
      setAuthReady(true);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  useEffect(() => {
    async function loadSuitePlan() {
      if (!uid) return;

      try {
        const suiteRef = doc(db, "users", uid, "entitlements", "suite");
        const snap = await getDoc(suiteRef);
        const planRaw = snap.exists() ? snap.data()?.plan : "free";

        setSuitePlan(normalizePlan(planRaw));
      } catch (e) {
        console.error("Failed to load suite plan:", e);
        setSuitePlan("free");
      }
    }

    loadSuitePlan();
  }, [uid]);

  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      try {
        setWebsitesLoading(true);

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setWebsites(rows);

        let restored = "";
        try {
          restored = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {
          // ignore
        }

        const restoredExists = restored && rows.some((x) => x.id === restored);
        const pick = restoredExists ? restored : rows[0]?.id || "";
        setSelectedWebsiteId((prev) => prev || pick);
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setSelectedWebsiteId("");
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid]);

  useEffect(() => {
    if (!selectedWebsiteId) return;

    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsiteId);
    } catch (e) {
      // ignore
    }
  }, [selectedWebsiteId]);

  function getEffectiveContext(websiteId) {
    const id = websiteId || selectedWebsiteId;
    const website = websites.find((item) => item.id === id);

    const effectiveUid = website?.ownerUid || uid;
    const effectiveWebsiteId = website?.ownerWebsiteId || id;

    return { effectiveUid, effectiveWebsiteId, website };
  }

  useEffect(() => {
    async function loadStoredStrategy() {
      if (!uid || !selectedWebsiteId || !websites.length) return;

      try {
        setPageState("loading");
        setPageError("");

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);

        if (!effectiveUid || !effectiveWebsiteId) {
          setStrategyMeta(null);
          setStrategyRows([]);
          setPageState("blocked");
          return;
        }

        const backlinksRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "backlinks"
        );

        const backlinksSnap = await getDoc(backlinksRef);
        const backlinksData = backlinksSnap.exists() ? backlinksSnap.data() || {} : {};

        const chunksRef = collection(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "backlinks",
          "enrichedGapChunks"
        );

        const chunkSnap = await getDocs(query(chunksRef, orderBy("index", "asc")));
        const allChunkRows = [];

        chunkSnap.forEach((chunkDoc) => {
          const chunkData = chunkDoc.data() || {};
          const items = Array.isArray(chunkData?.items) ? chunkData.items : [];
          items.forEach((item) => allChunkRows.push(item));
        });

        const hasEnrichedUniverse =
          allChunkRows.length > 0 ||
          Number(backlinksData?.enrichmentMeta?.totalEnriched || 0) > 0;

        if (!hasEnrichedUniverse) {
          setStrategyMeta(null);
          setStrategyRows([]);
          setPageState("blocked");
          return;
        }

        const storedMeta = backlinksData?.strategyMeta || null;
        const storedRows = Array.isArray(backlinksData?.recommendedStrategyRows)
          ? backlinksData.recommendedStrategyRows
              .map((item) => hydrateStoredStrategyRow(item))
              .filter(Boolean)
          : [];

        if (storedMeta && storedRows.length > 0) {
          setStrategyMeta(storedMeta);
          setStrategyRows(sortByScoreDesc(storedRows));
          setPageState("ready");
          return;
        }

        setStrategyMeta(null);
        setStrategyRows([]);
        setPageState("empty");
      } catch (e) {
        console.error("Failed to load backlink strategy:", e);
        setPageError("We could not generate your backlink strategy right now. Please try again.");
        setPageState("error");
      }
    }

    loadStoredStrategy();
  }, [uid, selectedWebsiteId, websites]);

  async function handleGenerateStrategy() {
    try {
      if (!selectedWebsiteId || !auth.currentUser || !authReady) return;

      setGenerationState("loading");
      setPageError("");

      const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);

      if (!effectiveUid || !effectiveWebsiteId) {
        throw new Error("Missing strategy context.");
      }

      const backlinksRef = doc(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "modules",
        "backlinks"
      );

      const backlinksSnap = await getDoc(backlinksRef);
      const backlinksData = backlinksSnap.exists() ? backlinksSnap.data() || {} : {};

      const chunksRef = collection(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "modules",
        "backlinks",
        "enrichedGapChunks"
      );

      const chunkSnap = await getDocs(query(chunksRef, orderBy("index", "asc")));
      const mergedMap = new Map();

      chunkSnap.forEach((chunkDoc) => {
        const chunkData = chunkDoc.data() || {};
        const items = Array.isArray(chunkData?.items) ? chunkData.items : [];

        items.forEach((item) => {
          const normalized = normalizeOpportunity(item);
          if (!normalized) return;
          mergedMap.set(normalized.normalizedDomain, normalized);
        });
      });

      const fullUniverse = Array.from(mergedMap.values());

      if (!fullUniverse.length || Number(backlinksData?.enrichmentMeta?.totalEnriched || 0) <= 0) {
        setStrategyMeta(null);
        setStrategyRows([]);
        setPageState("blocked");
        return;
      }

      const scoredRows = sortByScoreDesc(fullUniverse.map(scoreOpportunity));
      const targets = getPlanTargets(suitePlan);
      const recommendedRows = buildRecommendedRows(scoredRows, targets);
      const nowIso = new Date().toISOString();

      const strategyMetaPayload = {
        plan: normalizePlan(suitePlan),
        totalRecommended: recommendedRows.length,
        foundationTarget: targets.foundation,
        industryTarget: targets.industry,
        authorityTarget: targets.authority,
        generatedAt: nowIso,
        updatedAt: nowIso,
        source: "bam_scoring_v1",
      };

      const recommendedStrategyRowsPayload = recommendedRows.map((row) => ({
        normalizedDomain: row.normalizedDomain,
        referringDomain: row.referringDomain,
        bamScore: row.bamScore,
        priorityScore: row.priorityScore,
        priorityTier: row.priorityTier,
        recommendedThisCycle: true,
        domainRank: row.domainRank,
        category: row.category,
        method: row.method,
        difficulty: row.difficulty,
        competitorCount: row.competitorCount,
        linkedCompetitors: row.linkedCompetitors,
      }));

      await setDoc(
        backlinksRef,
        {
          strategyMeta: strategyMetaPayload,
          recommendedStrategyRows: recommendedStrategyRowsPayload,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      setStrategyMeta(strategyMetaPayload);
      setStrategyRows(recommendedRows);
      setPageState("ready");
    } catch (e) {
      console.error("Backlink strategy generation failed:", e);
      setPageError("We could not generate your backlink strategy right now. Please try again.");
      setPageState("error");
    } finally {
      setGenerationState("idle");
    }
  }

  const targets = useMemo(() => getPlanTargets(suitePlan), [suitePlan]);

  const counts = useMemo(() => {
    return strategyRows.reduce(
      (acc, row) => {
        if (row.priorityTier === "foundation") acc.foundation += 1;
        if (row.priorityTier === "industry") acc.industry += 1;
        if (row.priorityTier === "authority") acc.authority += 1;
        return acc;
      },
      { foundation: 0, industry: 0, authority: 0 }
    );
  }, [strategyRows]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(strategyRows.length / TABLE_PAGE_SIZE));
  }, [strategyRows.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [strategyRows.length, selectedWebsiteId]);

  const pagedRows = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * TABLE_PAGE_SIZE;
    return strategyRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [strategyRows, currentPage, totalPages]);

  return (
    <AuthGate>
      <VyndowShell>
        <div
          style={{
            minHeight: "100vh",
            background: PAGE_BG,
            padding: "28px 20px 60px",
          }}
        >
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div
              style={{
                borderRadius: 24,
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(255,255,255,0.72)",
                boxShadow: SHADOW,
                backdropFilter: "blur(10px)",
                padding: 24,
              }}
            >
              <button
                type="button"
                className="btn btn-soft-primary"
                onClick={() => router.push("/seo/backlinks/plan")}
                style={{ marginBottom: 16 }}
              >
                Back to Opportunities
              </button>

              <h1
                style={{
                  margin: 0,
                  fontSize: 24,
                  lineHeight: 1.3,
                  fontWeight: 700,
                  color: "#111827",
                  letterSpacing: "-0.01em",
                }}
              >
                Backlink Authority Strategy
              </h1>

              <p
                style={{
                  marginTop: 8,
                  color: "#4B5563",
                  lineHeight: 1.6,
                  fontSize: 14,
                  maxWidth: 860,
                }}
              >
                Prioritized using Vyndow’s BAM Score to help you build authority with the right backlink mix for your current plan.
              </p>

              <div
                style={{
                  marginTop: 18,
                  padding: 16,
                  borderRadius: 16,
                  background: "rgba(109,40,217,0.06)",
                  border: "1px solid rgba(109,40,217,0.14)",
                  color: "#374151",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                <strong>BAM Score = Backlink Acquisition Model score.</strong> BAM Score reflects
                Vyndow’s internal backlink prioritization model, which evaluates competitor backlink
                overlap, domain rank, link category, and acquisition difficulty to surface stronger
                backlink opportunities.
                <div style={{ marginTop: 10 }}>
                  <strong>Foundation</strong> covers easier, lower-effort opportunities such as
                  directories, listings, and forums. <strong>Industry</strong> covers niche-relevant
                  opportunities such as blogs, associations, and resource pages.{" "}
                  <strong>Authority</strong> covers harder, higher-value opportunities such as
                  publications and stronger domains.
                </div>
              </div>


              {websitesLoading || pageState === "loading" ? (
                <div style={{ marginTop: 22, fontSize: 14, color: "#6B7280" }}>
                  Loading backlink strategy...
                </div>
              ) : null}

              {!websitesLoading && pageState === "blocked" && (
                <div
                  style={{
                    marginTop: 22,
                    padding: 22,
                    borderRadius: 18,
                    border: CARD_BORDER,
                    background: CARD_BG,
                    boxShadow: SHADOW,
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#111827",
                      marginBottom: 8,
                    }}
                  >
                    Backlink strategy is available after opportunity analysis is completed.
                  </div>

                  <p
                    style={{
                      marginTop: 0,
                      color: "#4B5563",
                      lineHeight: 1.6,
                      fontSize: 14,
                    }}
                  >
                    Please finish analyzing backlink opportunities first.
                  </p>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => router.push("/seo/backlinks/plan")}
                  >
                    Go to Opportunity Analysis
                  </button>
                </div>
              )}

              {!websitesLoading && pageState === "empty" && (
                <div
                  style={{
                    marginTop: 22,
                    padding: 22,
                    borderRadius: 18,
                    border: CARD_BORDER,
                    background: CARD_BG,
                    boxShadow: SHADOW,
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "#111827",
                      marginBottom: 8,
                    }}
                  >
                    Strategy is ready to be generated.
                  </div>

                  <p
                    style={{
                      marginTop: 0,
                      color: "#4B5563",
                      lineHeight: 1.6,
                      fontSize: 14,
                      maxWidth: 840,
                    }}
                  >
                    Vyndow will read your full enriched opportunity dataset from chunk storage,
                    score every opportunity with BAM Score, and build your recommended backlink mix
                    for this cycle.
                  </p>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleGenerateStrategy}
                    disabled={generationState === "loading" || !authReady}
                  >
                    {generationState === "loading"
                      ? "Generating Backlink Strategy..."
                      : "Generate Backlink Strategy"}
                  </button>
                </div>
              )}

              {pageState === "error" && (
                <div
                  style={{
                    marginTop: 22,
                    padding: 14,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    color: "#991B1B",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {pageError || "We could not generate your backlink strategy right now. Please try again."}
                </div>
              )}

              {pageState === "ready" && (
                <>
                  <div
                    style={{
                      marginTop: 22,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <SummaryCard
                      label="Current Plan"
                      value={formatLabel(strategyMeta?.plan || suitePlan)}
                    />
                    <SummaryCard
                      label="Recommended Opportunities"
                      value={String(strategyMeta?.totalRecommended || strategyRows.length || 0)}
                      helperText="Upgrade your plan to unlock more opportunities"
                    />
                                        <SummaryCard
                      label="Foundation"
                      value={String(counts.foundation)}
                    />
                    <SummaryCard
                      label="Industry"
                      value={String(counts.industry)}
                    />
                    <SummaryCard
                      label="Authority"
                      value={String(counts.authority)}
                    />
                    <SummaryCard
                      label="Last Generated"
                      value={formatDate(strategyMeta?.updatedAt || strategyMeta?.generatedAt)}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 22,
                      padding: 22,
                      borderRadius: 18,
                      border: CARD_BORDER,
                      background: CARD_BG,
                      boxShadow: SHADOW,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 16,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#111827",
                          }}
                        >
                          Recommended Backlink Strategy
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 14,
                            color: "#4B5563",
                          }}
                        >
                          Sorted by BAM Score from highest to lowest.
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-soft-primary"
                        onClick={handleGenerateStrategy}
                        disabled={generationState === "loading" || !authReady}
                      >
                        {generationState === "loading" ? "Regenerating..." : "Regenerate Strategy"}
                      </button>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          minWidth: 1100,
                          background: "#FFFFFF",
                          borderRadius: 14,
                        }}
                      >
                        <thead>
                          <tr style={{ background: "rgba(30,102,255,0.04)" }}>
                            <TableHead>Domain</TableHead>
                            <TableHead>BAM Score</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Difficulty</TableHead>
                            <TableHead>Competitors</TableHead>
                            <TableHead>Priority Tier</TableHead>
                          </tr>
                        </thead>

                        <tbody>
                          {pagedRows.map((row) => (
                            <tr key={row.normalizedDomain}>
                              <TableCell strong>{row.referringDomain}</TableCell>
                              <TableCell strong>{row.bamScore}</TableCell>
                              <TableCell>{row.domainRank || "—"}</TableCell>
                              <TableCell>{formatLabel(row.category)}</TableCell>
                              <TableCell>{formatLabel(row.method)}</TableCell>
                              <TableCell>{formatLabel(row.difficulty)}</TableCell>
                              <TableCell>
                                {row.competitorCount} competitor{row.competitorCount === 1 ? "" : "s"}
                              </TableCell>
                              <TableCell>{formatLabel(row.priorityTier)}</TableCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 14,
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-soft-primary"
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          disabled={currentPage <= 1}
                        >
                          Previous
                        </button>

                        {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                          (pageNumber) => (
                            <button
                              key={pageNumber}
                              type="button"
                              className={
                                currentPage === pageNumber
                                  ? "btn btn-primary"
                                  : "btn btn-soft-primary"
                              }
                              onClick={() => setCurrentPage(pageNumber)}
                            >
                              {pageNumber}
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          className="btn btn-soft-primary"
                          onClick={() =>
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                          }
                          disabled={currentPage >= totalPages}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}

function SummaryCard({ label, value, helperText = "" }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: "#111827" }}>
        {value}
      </div>
      {helperText ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: "#6D28D9",
            fontWeight: 500,
          }}
        >
          {helperText}
        </div>
      ) : null}
    </div>
  );
}

function TableHead({ children }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px 10px",
        fontSize: 12,
        color: "#6B7280",
        borderBottom: "1px solid #E5E7EB",
      }}
    >
      {children}
    </th>
  );
}

function TableCell({ children, strong = false }) {
  return (
    <td
      style={{
        padding: "14px 10px",
        borderBottom: "1px solid #F3F4F6",
        fontSize: 14,
        color: "#374151",
        fontWeight: strong ? 600 : 400,
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}
