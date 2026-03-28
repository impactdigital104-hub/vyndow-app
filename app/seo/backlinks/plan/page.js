"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../../VyndowShell";
import AuthGate from "../../../components/AuthGate";
import { auth, db } from "../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../suiteLifecycleClient";

const PAGE_BG =
  "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)";
const CARD_BG = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
const CARD_BORDER = "1px solid rgba(124,58,237,0.20)";
const SHADOW = "0 10px 26px rgba(15,23,42,0.06)";

function cleanDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function formatTimestamp(value) {
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

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeGapOpportunities(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const normalizedDomain = cleanDomain(item?.normalizedDomain || item?.referringDomain || "");
      const linkedCompetitors = Array.from(
        new Set(
          (Array.isArray(item?.linkedCompetitors) ? item.linkedCompetitors : [])
            .map((entry) => cleanDomain(entry))
            .filter(Boolean)
        )
      );

      return {
        referringDomain: String(item?.referringDomain || normalizedDomain).trim() || normalizedDomain,
        normalizedDomain,
        linkedCompetitors,
        linkedCompetitorCount:
          Number.isFinite(Number(item?.linkedCompetitorCount))
            ? Number(item.linkedCompetitorCount)
            : linkedCompetitors.length,
        source: String(item?.source || "competitor_gap").trim(),
        discoveredAt: item?.discoveredAt || null,
        updatedAt: item?.updatedAt || null,
      };
    })
    .filter((item) => item.normalizedDomain)
    .sort((a, b) => {
      if (b.linkedCompetitorCount !== a.linkedCompetitorCount) {
        return b.linkedCompetitorCount - a.linkedCompetitorCount;
      }
      return a.normalizedDomain.localeCompare(b.normalizedDomain);
    });
}

function normalizeGapMeta(value) {
  const meta = value || {};
  return {
    selfDomain: cleanDomain(meta?.selfDomain || ""),
    competitorCountAnalyzed:
      Number.isFinite(Number(meta?.competitorCountAnalyzed)) ? Number(meta.competitorCountAnalyzed) : 0,
    competitorSuccessCount:
      Number.isFinite(Number(meta?.competitorSuccessCount)) ? Number(meta.competitorSuccessCount) : 0,
    competitorFailedCount:
      Number.isFinite(Number(meta?.competitorFailedCount)) ? Number(meta.competitorFailedCount) : 0,
    totalGapDomains: Number.isFinite(Number(meta?.totalGapDomains)) ? Number(meta.totalGapDomains) : 0,
    generatedAt: meta?.generatedAt || null,
    updatedAt: meta?.updatedAt || null,
  };
}

function normalizeCompetitorProfiles(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanDomain(item?.normalizedDomain || item?.originalDomain || item?.domain || ""))
    .filter(Boolean);
}

export default function BacklinkAuthorityPlanPage() {
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [websites, setWebsites] = useState([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");
  const [websitesLoading, setWebsitesLoading] = useState(true);

  const [gapState, setGapState] = useState("idle"); // idle | loading | empty | ready | running | error | blocked
  const [gapError, setGapError] = useState("");
  const [gapData, setGapData] = useState([]);
  const [gapMeta, setGapMeta] = useState({
    selfDomain: "",
    competitorCountAnalyzed: 0,
    competitorSuccessCount: 0,
    competitorFailedCount: 0,
    totalGapDomains: 0,
    generatedAt: null,
    updatedAt: null,
  });
  const [expandedGapDomain, setExpandedGapDomain] = useState("");
  const [partialNotice, setPartialNotice] = useState(false);

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
    async function loadStoredGapData() {
      if (!uid || !selectedWebsiteId || !websites.length) return;

      try {
        setGapState("loading");
        setGapError("");
        setPartialNotice(false);
        setExpandedGapDomain("");

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);

        if (!effectiveUid || !effectiveWebsiteId) {
          setGapData([]);
          setGapState("blocked");
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

        const selfDomain = cleanDomain(
          backlinksData?.selfProfile?.normalizedDomain || backlinksData?.selfProfile?.domain || ""
        );
        const competitorDomains = normalizeCompetitorProfiles(backlinksData?.competitorProfiles);

        if (!selfDomain || !competitorDomains.length) {
          setGapData([]);
          setGapMeta({
            selfDomain: "",
            competitorCountAnalyzed: 0,
            competitorSuccessCount: 0,
            competitorFailedCount: 0,
            totalGapDomains: 0,
            generatedAt: null,
            updatedAt: null,
          });
          setGapState("blocked");
          return;
        }

        const rows = normalizeGapOpportunities(backlinksData?.gapOpportunities);
        const meta = normalizeGapMeta(backlinksData?.gapMeta);

        setGapData(rows);
        setGapMeta({
          ...meta,
          selfDomain: meta.selfDomain || selfDomain,
          competitorCountAnalyzed: meta.competitorCountAnalyzed || competitorDomains.length,
        });

        if (meta.competitorFailedCount > 0) {
          setPartialNotice(true);
        }

        const hasPriorRun = Boolean(meta.generatedAt || meta.updatedAt);

        if (rows.length > 0 || hasPriorRun) {
          setGapState("ready");
        } else {
          setGapState("empty");
        }
      } catch (e) {
        console.error("Failed to load stored backlink gap data:", e);
        setGapError("We could not generate backlink opportunities right now. Please try again.");
        setGapState("error");
      }
    }

    loadStoredGapData();
  }, [uid, selectedWebsiteId, websites]);

  async function handleRunGapAnalysis() {
    try {
      if (!selectedWebsiteId || !auth.currentUser) return;

      setGapState("running");
      setGapError("");
      setPartialNotice(false);
      setExpandedGapDomain("");

      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch("/api/backlinks/gap-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          websiteId: selectedWebsiteId,
        }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "Gap analysis failed.");
      }

      const rows = normalizeGapOpportunities(json?.gapOpportunities);
      const meta = normalizeGapMeta(json?.gapMeta);

      setGapData(rows);
      setGapMeta(meta);
      setPartialNotice(Boolean(json?.partial || meta.competitorFailedCount > 0));
      setGapState("ready");
    } catch (e) {
      console.error("Gap analysis failed:", e);
      setGapError("We could not generate backlink opportunities right now. Please try again.");
      setGapState("error");
    }
  }

  const hasStoredGapData = useMemo(() => {
    return gapData.length > 0 || Boolean(gapMeta.generatedAt || gapMeta.updatedAt);
  }, [gapData, gapMeta]);

  const gapButtonText = hasStoredGapData ? "Refresh Gap Analysis" : "Run Gap Analysis";

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
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
                onClick={() => router.push("/seo/backlinks")}
                style={{ marginBottom: 16 }}
              >
                Back to Backlink Authority
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
                Backlink Authority Plan
              </h1>

              <p
                style={{
                  marginTop: 8,
                  color: "#4B5563",
                  lineHeight: 1.6,
                  fontSize: 14,
                  maxWidth: 820,
                }}
              >
                Identify backlink opportunities and generate a structured authority-building roadmap based on your competitors.
              </p>

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
                  Generate Backlink Authority Plan
                </div>

                <p
                  style={{
                    marginTop: 0,
                    color: "#4B5563",
                    lineHeight: 1.6,
                    fontSize: 14,
                    maxWidth: 820,
                  }}
                >
                  Vyndow will analyze referring domains linking to your competitors and identify backlink opportunities your website has not yet acquired.
                </p>

                <p
                  style={{
                    marginTop: 0,
                    color: "#4B5563",
                    lineHeight: 1.6,
                    fontSize: 14,
                    maxWidth: 820,
                  }}
                >
                  This analysis will help you close the authority gap and systematically build domain credibility.
                </p>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => console.log("Backlink plan generation coming in Stage 5")}
                  style={{ marginTop: 8 }}
                >
                  Generate Backlink Plan
                </button>
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
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: 8,
                  }}
                >
                  Competitor Backlink Gap
                </div>

                <p
                  style={{
                    marginTop: 0,
                    color: "#4B5563",
                    lineHeight: 1.6,
                    fontSize: 14,
                    maxWidth: 820,
                    marginBottom: 8,
                  }}
                >
                  Vyndow will identify websites that already link to your competitors but do not yet link to your website.
                  These domains form your first backlink opportunity pool.
                </p>

                {websitesLoading && (
                  <div style={{ fontSize: 14, color: "#6B7280", marginTop: 12 }}>
                    Loading saved backlink opportunities...
                  </div>
                )}

                {!websitesLoading && gapState === "blocked" && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 12,
                      background: "rgba(59,130,246,0.06)",
                      border: "1px solid rgba(59,130,246,0.18)",
                      color: "#1F2937",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    Backlink context is not ready yet. Please return to the Backlink Authority page and complete your backlink analysis first.
                  </div>
                )}

                {!websitesLoading && gapState === "loading" && (
                  <div style={{ fontSize: 14, color: "#6B7280", marginTop: 12 }}>
                    Loading saved backlink opportunities...
                  </div>
                )}

                {!websitesLoading && (gapState === "empty" || gapState === "ready" || gapState === "error") && (
                  <div style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleRunGapAnalysis}
                      disabled={gapState === "running" || !selectedWebsiteId || !authReady}
                    >
                      {gapButtonText}
                    </button>
                  </div>
                )}

                {!websitesLoading && gapState === "running" && (
                  <div style={{ marginTop: 14 }}>
                    <button type="button" className="btn btn-primary" disabled>
                      Running gap analysis...
                    </button>
                  </div>
                )}

                {gapState === "error" && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 12,
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.18)",
                      color: "#991B1B",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {gapError || "We could not generate backlink opportunities right now. Please try again."}
                  </div>
                )}

                {gapState === "ready" && partialNotice && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 12,
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.22)",
                      color: "#92400E",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    Some competitor domains could not be analyzed, but successful results are shown below.
                  </div>
                )}

                {gapState === "ready" && (
                  <div style={{ marginTop: 18 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 12,
                        marginBottom: 18,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid #E5E7EB",
                          background: "#FFFFFF",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>Your Domain</div>
                        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: "#111827" }}>
                          {gapMeta.selfDomain || "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid #E5E7EB",
                          background: "#FFFFFF",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
                          Competitors Analyzed
                        </div>
                        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: "#111827" }}>
                          {gapMeta.competitorCountAnalyzed || 0}
                        </div>
                      </div>

                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid #E5E7EB",
                          background: "#FFFFFF",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>Gap Domains</div>
                        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: "#111827" }}>
                          {gapMeta.totalGapDomains || gapData.length || 0}
                        </div>
                      </div>

                      <div
                        style={{
                          borderRadius: 12,
                          border: "1px solid #E5E7EB",
                          background: "#FFFFFF",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280" }}>Last Generated</div>
                        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 600, color: "#111827" }}>
                          {formatTimestamp(gapMeta.generatedAt || gapMeta.updatedAt)}
                        </div>
                      </div>
                    </div>

                    {gapData.length === 0 ? (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 12,
                          background: "rgba(16,185,129,0.06)",
                          border: "1px solid rgba(16,185,129,0.18)",
                          color: "#065F46",
                          fontSize: 14,
                          lineHeight: 1.6,
                        }}
                      >
                        No competitor gap domains were found in this run.
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            minWidth: 820,
                            background: "#FFFFFF",
                            borderRadius: 14,
                          }}
                        >
                          <thead>
                            <tr style={{ background: "rgba(30,102,255,0.04)" }}>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "12px 10px",
                                  fontSize: 12,
                                  color: "#6B7280",
                                  borderBottom: "1px solid #E5E7EB",
                                }}
                              >
                                Referring Domain
                              </th>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "12px 10px",
                                  fontSize: 12,
                                  color: "#6B7280",
                                  borderBottom: "1px solid #E5E7EB",
                                }}
                              >
                                Links To Competitors
                              </th>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "12px 10px",
                                  fontSize: 12,
                                  color: "#6B7280",
                                  borderBottom: "1px solid #E5E7EB",
                                }}
                              >
                                Competitor Count
                              </th>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "12px 10px",
                                  fontSize: 12,
                                  color: "#6B7280",
                                  borderBottom: "1px solid #E5E7EB",
                                }}
                              >
                                Action
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {gapData.map((row) => {
                              const expanded = expandedGapDomain === row.normalizedDomain;

                              return (
                                <FragmentRow
                                  key={row.normalizedDomain}
                                  row={row}
                                  expanded={expanded}
                                  onToggle={() =>
                                    setExpandedGapDomain((prev) =>
                                      prev === row.normalizedDomain ? "" : row.normalizedDomain
                                    )
                                  }
                                />
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}

function FragmentRow({ row, expanded, onToggle }) {
  return (
    <>
      <tr>
        <td
          style={{
            padding: "14px 10px",
            borderBottom: "1px solid #F3F4F6",
            fontSize: 14,
            color: "#111827",
            fontWeight: 600,
            verticalAlign: "top",
          }}
        >
          {row.referringDomain}
        </td>

        <td
          style={{
            padding: "14px 10px",
            borderBottom: "1px solid #F3F4F6",
            fontSize: 14,
            color: "#374151",
            verticalAlign: "top",
            lineHeight: 1.5,
          }}
        >
          {row.linkedCompetitors.join(", ")}
        </td>

        <td
          style={{
            padding: "14px 10px",
            borderBottom: "1px solid #F3F4F6",
            fontSize: 14,
            color: "#111827",
            verticalAlign: "top",
          }}
        >
          {row.linkedCompetitorCount}
        </td>

        <td
          style={{
            padding: "14px 10px",
            borderBottom: "1px solid #F3F4F6",
            verticalAlign: "top",
          }}
        >
          <button type="button" className="btn btn-soft-primary" onClick={onToggle}>
            {expanded ? "Hide" : "View"}
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td
            colSpan={4}
            style={{
              padding: "14px 12px 18px",
              background: "rgba(30,102,255,0.03)",
              borderBottom: "1px solid #E5E7EB",
            }}
          >
            <div style={{ fontSize: 14, color: "#111827", fontWeight: 700, marginBottom: 8 }}>
              {row.referringDomain}
            </div>

            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
              <div>
                <strong>Linked competitors:</strong> {row.linkedCompetitors.join(", ")}
              </div>
              <div style={{ marginTop: 6 }}>
                This domain links to {row.linkedCompetitorCount} competitor website
                {row.linkedCompetitorCount === 1 ? "" : "s"} but not to your site.
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
