"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import AuthGate from "../../../../../components/AuthGate";
import { auth, db } from "../../../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../../../suiteLifecycleClient";

const HOUSE = {
  primaryBlue: "#1E66FF",
  primaryPurple: "#6D28D9",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  cardBorder: "#E6E6EB",
  text: "#0F172A",
  subtext: "#475569",
};

function safeStr(x) {
  return String(x || "").trim();
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatDate(value) {
  const d = toDateOrNull(value);
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch (e) {
    return "—";
  }
}

function formatMonthYearFromDate(value) {
  const d = toDateOrNull(value);
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  } catch (e) {
    return "—";
  }
}

function getBillingCycleLabel(report) {
  const start = toDateOrNull(report?.billingCycle?.start || report?.cycleStart);
  if (start) return formatMonthYearFromDate(start);

  const cycleKey = safeStr(report?.billingCycle?.cycleKey || report?.cycleKey);
  if (cycleKey.includes("__")) {
    const startPart = cycleKey.split("__")[0];
    const parsed = new Date(startPart);
    if (!Number.isNaN(parsed.getTime())) {
      return formatMonthYearFromDate(parsed);
    }
  }

  const createdAt = toDateOrNull(report?.createdAt || report?.generatedAt);
  if (createdAt) return formatMonthYearFromDate(createdAt);

  return "—";
}

function formatMetricValue(label, value) {
  const n = safeNum(value, 0);
  if (label === "CTR") return `${n}%`;
  return n.toLocaleString();
}

function formatChangeText(value) {
  const n = safeNum(value, 0);
  return `${n > 0 ? "+" : ""}${n}%`;
}

function GeneratedFixPrintBlock({ generatedFix }) {
  const titleTag = safeStr(generatedFix?.titleTag);
  const metaDescription = safeStr(generatedFix?.metaDescription);
  const faqIdeas = Array.isArray(generatedFix?.faqIdeas)
    ? generatedFix.faqIdeas.map((x) => safeStr(x)).filter(Boolean)
    : [];
  const newPageSuggestion = safeStr(generatedFix?.newPageSuggestion);
  const notes = safeStr(generatedFix?.notes);

  const hasAnything =
    !!titleTag || !!metaDescription || faqIdeas.length > 0 || !!newPageSuggestion || !!notes;

  if (!hasAnything) {
    return <div style={{ color: HOUSE.subtext, lineHeight: 1.7 }}>No direct generated fix was returned for this insight.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {titleTag ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Suggested title tag</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.7 }}>{titleTag}</div>
        </div>
      ) : null}

      {metaDescription ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Suggested meta description</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.7 }}>{metaDescription}</div>
        </div>
      ) : null}

      {faqIdeas.length > 0 ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>FAQ ideas</div>
          <ol style={{ margin: "8px 0 0 18px", color: HOUSE.subtext, lineHeight: 1.8 }}>
            {faqIdeas.map((item, idx) => (
              <li key={`${idx}-${item}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {newPageSuggestion ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>New page suggestion</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.7 }}>{newPageSuggestion}</div>
        </div>
      ) : null}

      {notes ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Notes</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.7 }}>{notes}</div>
        </div>
      ) : null}
    </div>
  );
}

function MetricPrintCard({ label, metric }) {
  return (
    <div
      style={{
        border: `1px solid ${HOUSE.cardBorder}`,
        borderRadius: 14,
        padding: 16,
        background: "white",
        breakInside: "avoid",
        pageBreakInside: "avoid",
      }}
    >
      <div style={{ fontSize: 13, color: HOUSE.subtext, fontWeight: 700 }}>{label}</div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: HOUSE.subtext }}>Last 28 days</div>
          <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: HOUSE.text }}>
            {formatMetricValue(label, metric?.last28)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: HOUSE.subtext }}>Previous 28 days</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: HOUSE.text }}>
            {formatMetricValue(label, metric?.previous28)}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: HOUSE.subtext }}>Change</div>
          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: HOUSE.text }}>
            {formatChangeText(metric?.changePercent)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OgiPrintableReportPage() {
  const router = useRouter();
  const params = useParams();

  const reportId = safeStr(params?.reportId);

  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [websiteIdFromQuery, setWebsiteIdFromQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const paramsFromUrl = new URLSearchParams(window.location.search);
      setWebsiteIdFromQuery(safeStr(paramsFromUrl.get("websiteId")));
    } catch (e) {
      setWebsiteIdFromQuery("");
    }
  }, []);

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

  async function loadReportDirect(uidValue, websiteId) {
    if (!websiteId || !reportId) return null;

    const websiteRef = doc(db, "users", uidValue, "websites", websiteId);
    const websiteSnap = await getDoc(websiteRef);

    const websiteData = websiteSnap.exists() ? websiteSnap.data() || {} : {};
    const effectiveUid = websiteData?.ownerUid || uidValue;
    const effectiveWebsiteId = websiteData?.ownerWebsiteId || websiteId;

    const reportRef = doc(
      db,
      "users",
      effectiveUid,
      "websites",
      effectiveWebsiteId,
      "ogiReports",
      reportId
    );

    const reportSnap = await getDoc(reportRef);
    if (!reportSnap.exists()) return null;

    return {
      id: reportSnap.id,
      effectiveUid,
      effectiveWebsiteId,
      ...reportSnap.data(),
    };
  }

  async function loadReportByScanning(uidValue) {
    const websitesRef = collection(db, "users", uidValue, "websites");
    const q = query(websitesRef, orderBy("createdAt", "desc"));
    const websitesSnap = await getDocs(q);

    const tried = new Set();

    for (const websiteDoc of websitesSnap.docs) {
      const websiteData = websiteDoc.data() || {};
      const rawWebsiteId = websiteDoc.id;
      const effectiveUid = websiteData?.ownerUid || uidValue;
      const effectiveWebsiteId = websiteData?.ownerWebsiteId || rawWebsiteId;
      const key = `${effectiveUid}__${effectiveWebsiteId}`;

      if (tried.has(key)) continue;
      tried.add(key);

      const reportRef = doc(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "ogiReports",
        reportId
      );

      const reportSnap = await getDoc(reportRef);
      if (reportSnap.exists()) {
        return {
          id: reportSnap.id,
          effectiveUid,
          effectiveWebsiteId,
          ...reportSnap.data(),
        };
      }
    }

    return null;
  }

  useEffect(() => {
    async function load() {
      if (!authReady || !uid || !reportId) return;

      try {
        setLoading(true);
        setError("");

        let found = null;

        if (websiteIdFromQuery) {
          found = await loadReportDirect(uid, websiteIdFromQuery);
        }

        if (!found) {
          found = await loadReportByScanning(uid);
        }

        if (!found) {
          setReport(null);
          setError("Report not found");
          return;
        }

        setReport(found);
      } catch (e) {
        console.error("Failed to load printable OGI report:", e);
        setReport(null);
        setError(e?.message || "Failed to load report.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [authReady, uid, reportId, websiteIdFromQuery]);

  const kpi = useMemo(() => {
    return report?.kpi || report?.summary?.topMetrics || {};
  }, [report]);

  const backUrl = useMemo(() => {
    const websiteIdForLink = safeStr(report?.websiteId) || safeStr(report?.effectiveWebsiteId) || websiteIdFromQuery;
    if (!reportId) return "/growth/intelligence";
    if (websiteIdForLink) {
      return `/growth/intelligence/report/${reportId}?websiteId=${encodeURIComponent(websiteIdForLink)}`;
    }
    return `/growth/intelligence/report/${reportId}`;
  }, [report, reportId, websiteIdFromQuery]);

  return (
    <AuthGate>
      <>
        <style jsx global>{`
          html, body {
            background: #ffffff;
          }

          @media print {
            @page {
              size: auto;
              margin: 16mm;
            }

            body {
              background: #ffffff !important;
            }

            .print-hide {
              display: none !important;
            }

            .print-shell {
              max-width: none !important;
              padding: 0 !important;
            }

            .print-section,
            .print-card,
            .print-insight,
            .print-kpi-card {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}</style>

        <div style={{ background: "#ffffff", minHeight: "100vh" }}>
          <div
            className="print-shell"
            style={{
              width: "100%",
              maxWidth: 1080,
              margin: "0 auto",
              padding: 28,
            }}
          >
            <div
              className="print-hide"
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <button
                type="button"
                onClick={() => router.push(backUrl)}
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: `1px solid ${HOUSE.cardBorder}`,
                  background: "white",
                  color: HOUSE.text,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Back to Report
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: HOUSE.primaryBlue,
                  color: "white",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 10px 22px rgba(30,102,255,0.22)",
                }}
              >
                Print / Save as PDF
              </button>
            </div>

            {loading ? (
              <div style={{ color: HOUSE.subtext, padding: 10 }}>Loading report…</div>
            ) : error ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "rgba(220,38,38,0.08)",
                  color: HOUSE.danger,
                  border: "1px solid rgba(220,38,38,0.15)",
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 24 }}>
                <section
                  className="print-section"
                  style={{
                    border: `1px solid ${HOUSE.cardBorder}`,
                    borderRadius: 18,
                    padding: 24,
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      borderRadius: 999,
                      fontWeight: 800,
                      fontSize: 12,
                      color: HOUSE.primaryBlue,
                      background: "rgba(30,102,255,0.08)",
                      border: "1px solid rgba(30,102,255,0.16)",
                    }}
                  >
                    Vyndow Organic
                  </div>

                  <h1
                    style={{
                      margin: "16px 0 0 0",
                      fontSize: 34,
                      lineHeight: 1.15,
                      fontWeight: 900,
                      color: HOUSE.text,
                      letterSpacing: "-0.4px",
                    }}
                  >
                    Organic Growth Intelligence Report
                  </h1>

                  <div
                    style={{
                      marginTop: 14,
                      color: HOUSE.subtext,
                      fontSize: 15,
                      lineHeight: 1.8,
                    }}
                  >
                    Website: <strong style={{ color: HOUSE.text }}>{safeStr(report?.websiteLabel) || safeStr(report?.websiteUrl) || "—"}</strong>
                    <br />
                    Generated: <strong style={{ color: HOUSE.text }}>{formatDate(report?.createdAt)}</strong>
                    <br />
                    Billing Cycle: <strong style={{ color: HOUSE.text }}>{getBillingCycleLabel(report)}</strong>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 14,
                      color: HOUSE.subtext,
                      lineHeight: 1.7,
                    }}
                  >
                    AI-generated insights based on Google Search Console data and Vyndow SEO strategy.
                  </div>
                </section>

                <section className="print-section" style={{ display: "grid", gap: 14 }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: HOUSE.text,
                    }}
                  >
                    KPI Summary
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <div className="print-kpi-card">
                      <MetricPrintCard label="Impressions" metric={kpi?.impressions} />
                    </div>
                    <div className="print-kpi-card">
                      <MetricPrintCard label="Clicks" metric={kpi?.clicks} />
                    </div>
                    <div className="print-kpi-card">
                      <MetricPrintCard label="CTR" metric={kpi?.ctr} />
                    </div>
                    <div className="print-kpi-card">
                      <MetricPrintCard label="Average Position" metric={kpi?.position} />
                    </div>
                  </div>
                </section>

                <section
                  className="print-section"
                  style={{
                    border: `1px solid ${HOUSE.cardBorder}`,
                    borderRadius: 18,
                    padding: 22,
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: HOUSE.text,
                    }}
                  >
                    Executive Summary
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: HOUSE.subtext,
                      fontSize: 15,
                      lineHeight: 1.9,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {safeStr(report?.summary?.executiveSummary) || "No executive summary available."}
                  </div>
                </section>

                <section className="print-section" style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 900,
                        color: HOUSE.text,
                      }}
                    >
                      Insights
                    </div>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 10px",
                        borderRadius: 999,
                        fontWeight: 800,
                        fontSize: 12,
                        color: HOUSE.primaryBlue,
                        background: "rgba(30,102,255,0.08)",
                        border: "1px solid rgba(30,102,255,0.18)",
                      }}
                    >
                      {Array.isArray(report?.insights) ? report.insights.length : 0} insights
                    </div>
                  </div>

                  {Array.isArray(report?.insights) && report.insights.length > 0 ? (
                    <div style={{ display: "grid", gap: 16 }}>
                      {report.insights.map((insight, idx) => (
                        <div
                          key={`print-insight-${idx}`}
                          className="print-insight"
                          style={{
                            border: `1px solid ${HOUSE.cardBorder}`,
                            borderRadius: 18,
                            padding: 20,
                            background: "white",
                          }}
                        >
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 10px",
                                borderRadius: 999,
                                fontWeight: 800,
                                fontSize: 12,
                                color: HOUSE.primaryBlue,
                                background: "rgba(30,102,255,0.08)",
                                border: "1px solid rgba(30,102,255,0.18)",
                              }}
                            >
                              Insight {idx + 1}
                            </div>

                            {safeStr(insight?.type) ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "7px 10px",
                                  borderRadius: 999,
                                  fontWeight: 800,
                                  fontSize: 12,
                                  color: HOUSE.primaryBlue,
                                  background: "rgba(30,102,255,0.08)",
                                  border: "1px solid rgba(30,102,255,0.18)",
                                }}
                              >
                                {safeStr(insight?.type)}
                              </div>
                            ) : null}
                          </div>

                          <div
                            style={{
                              marginTop: 14,
                              fontSize: 22,
                              lineHeight: 1.35,
                              fontWeight: 900,
                              color: HOUSE.text,
                            }}
                          >
                            {safeStr(insight?.title) || `Insight ${idx + 1}`}
                          </div>

                          <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
                            <div>
                              <div style={{ fontWeight: 800, color: HOUSE.text }}>Problem</div>
                              <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.8 }}>
                                {safeStr(insight?.diagnosis) || "—"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 800, color: HOUSE.text }}>Why It Matters</div>
                              <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.8 }}>
                                {safeStr(insight?.whyItMatters) || "—"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontWeight: 800, color: HOUSE.text }}>Recommended Action</div>
                              <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.8 }}>
                                {safeStr(insight?.recommendation) || "—"}
                              </div>
                            </div>

                            <div
                              style={{
                                padding: 16,
                                borderRadius: 14,
                                border: `1px solid ${HOUSE.cardBorder}`,
                                background: "#ffffff",
                              }}
                            >
                              <div style={{ fontWeight: 800, color: HOUSE.text }}>Generated Fix</div>
                              <div style={{ marginTop: 10 }}>
                                <GeneratedFixPrintBlock generatedFix={insight?.generatedFix || {}} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: HOUSE.subtext }}>No insights available.</div>
                  )}
                </section>

                <section
                  className="print-section"
                  style={{
                    border: `1px solid ${HOUSE.cardBorder}`,
                    borderRadius: 18,
                    padding: 22,
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: HOUSE.text,
                    }}
                  >
                    30-Day Action Plan
                  </div>

                  {Array.isArray(report?.actionPlan) && report.actionPlan.length > 0 ? (
                    <ol
                      style={{
                        margin: "14px 0 0 0",
                        paddingLeft: 24,
                        color: HOUSE.subtext,
                        lineHeight: 1.95,
                        fontSize: 15,
                      }}
                    >
                      {report.actionPlan.map((item, idx) => (
                        <li key={`print-plan-${idx}`} style={{ marginBottom: 10 }}>
                          {safeStr(item)}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div style={{ marginTop: 14, color: HOUSE.subtext }}>No action plan available.</div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </>
    </AuthGate>
  );
}
