"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../../../VyndowShell";
import AuthGate from "../../../../components/AuthGate";
import { auth, db } from "../../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../../suiteLifecycleClient";

const HOUSE = {
  primaryBlue: "#1E66FF",
  primaryPurple: "#6D28D9",
  accentTeal: "#06B6D4",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  bgSoft: "#FFF7ED",
  cardBorder: "#E6E6EB",
  text: "#0F172A",
  subtext: "#475569",
};

const CARD_STYLE = {
  background: "white",
  borderRadius: 16,
  border: `1px solid ${HOUSE.cardBorder}`,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  overflow: "hidden",
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

function formatChange(value, invertPositive = false) {
  const n = safeNum(value, 0);
  const display = `${n > 0 ? "+" : ""}${n}%`;
  const positive = invertPositive ? n < 0 : n > 0;
  const neutral = n === 0;

  return {
    text: display,
    color: neutral ? HOUSE.subtext : positive ? HOUSE.success : HOUSE.danger,
    bg: neutral
      ? "rgba(71,85,105,0.08)"
      : positive
      ? "rgba(22,163,74,0.10)"
      : "rgba(220,38,38,0.08)",
    border: neutral
      ? "rgba(71,85,105,0.14)"
      : positive
      ? "rgba(22,163,74,0.18)"
      : "rgba(220,38,38,0.16)",
  };
}

function StatusPill({ children, tone = "neutral" }) {
  const toneStyle =
    tone === "success"
      ? {
          background: "rgba(22,163,74,0.12)",
          color: HOUSE.success,
          borderColor: "rgba(22,163,74,0.25)",
        }
      : tone === "warning"
      ? {
          background: "rgba(245,158,11,0.12)",
          color: HOUSE.warning,
          borderColor: "rgba(245,158,11,0.25)",
        }
      : tone === "danger"
      ? {
          background: "rgba(220,38,38,0.10)",
          color: HOUSE.danger,
          borderColor: "rgba(220,38,38,0.20)",
        }
      : {
          background: "rgba(30,102,255,0.08)",
          color: HOUSE.primaryBlue,
          borderColor: "rgba(30,102,255,0.18)",
        };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        whiteSpace: "nowrap",
        border: `1px solid ${toneStyle.borderColor}`,
        ...toneStyle,
      }}
    >
      {children}
    </span>
  );
}

function SectionCard({ title, subtitle, right, children }) {
  return (
    <div style={CARD_STYLE}>
      <div
        style={{
          padding: "16px 18px",
          background: "linear-gradient(90deg, rgba(109,40,217,0.10), rgba(30,102,255,0.08))",
          borderBottom: `1px solid ${HOUSE.cardBorder}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 20,
              color: HOUSE.primaryPurple,
              letterSpacing: "-0.2px",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: HOUSE.subtext,
                lineHeight: 1.35,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function MetricCard({ label, metric, invertPositive = false }) {
  const last28 = safeNum(metric?.last28, 0);
  const previous28 = safeNum(metric?.previous28, 0);
  const change = safeNum(metric?.changePercent, 0);
  const changeUi = formatChange(change, invertPositive);

  const isPercentMetric = label === "CTR";
  const formattedLast28 = isPercentMetric ? `${last28}%` : last28.toLocaleString();
  const formattedPrevious28 = isPercentMetric ? `${previous28}%` : previous28.toLocaleString();

  return (
    <div
      style={{
        ...CARD_STYLE,
        padding: 18,
        minHeight: 165,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: HOUSE.subtext }}>
        {label}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: HOUSE.subtext }}>Last 28 days</div>
        <div
          style={{
            marginTop: 4,
            fontSize: 28,
            fontWeight: 900,
            color: HOUSE.text,
            lineHeight: 1.1,
          }}
        >
          {formattedLast28}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11, color: HOUSE.subtext }}>Previous 28 days</div>
        <div
          style={{
            marginTop: 4,
            fontSize: 17,
            fontWeight: 800,
            color: HOUSE.subtext,
            lineHeight: 1.1,
          }}
        >
          {formattedPrevious28}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            borderRadius: 999,
            border: `1px solid ${changeUi.border}`,
            background: changeUi.bg,
            color: changeUi.color,
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          <span>{changeUi.text.startsWith("-") ? "↓" : changeUi.text === "0%" ? "→" : "↑"}</span>
          <span>{changeUi.text}</span>
        </span>
      </div>
    </div>
  );
}

function GeneratedFixBlock({ generatedFix }) {
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
    return <div style={{ color: HOUSE.subtext }}>No direct generated fix was returned for this insight.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {titleTag ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Suggested title tag</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.65 }}>{titleTag}</div>
        </div>
      ) : null}

      {metaDescription ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Suggested meta description</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.65 }}>{metaDescription}</div>
        </div>
      ) : null}

      {faqIdeas.length > 0 ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>FAQ ideas</div>
          <ol style={{ margin: "8px 0 0 18px", color: HOUSE.subtext, lineHeight: 1.7 }}>
            {faqIdeas.map((item, idx) => (
              <li key={`${idx}-${item}`}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {newPageSuggestion ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>New page suggestion</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.65 }}>{newPageSuggestion}</div>
        </div>
      ) : null}

      {notes ? (
        <div>
          <div style={{ fontWeight: 800, color: HOUSE.text }}>Notes</div>
          <div style={{ marginTop: 4, color: HOUSE.subtext, lineHeight: 1.65 }}>{notes}</div>
        </div>
      ) : null}
    </div>
  );
}

function InsightCard({ insight, index }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        ...CARD_STYLE,
        border: `1px solid ${HOUSE.cardBorder}`,
        transition: "all 0.18s ease",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: 16,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <StatusPill tone="neutral">Insight {index + 1}</StatusPill>
              {safeStr(insight?.type) ? (
                <StatusPill tone="neutral">{safeStr(insight?.type)}</StatusPill>
              ) : null}
              {safeStr(insight?.actionType) ? (
                <StatusPill tone="warning">{safeStr(insight?.actionType)}</StatusPill>
              ) : null}
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 20,
                lineHeight: 1.35,
                fontWeight: 900,
                color: HOUSE.text,
              }}
            >
              {safeStr(insight?.title) || `Insight ${index + 1}`}
            </div>
          </div>

          <div
            style={{
              minWidth: 28,
              height: 28,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: "white",
              color: HOUSE.primaryPurple,
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            {open ? "▾" : "▸"}
          </div>
        </div>
      </button>

      {open ? (
        <div
          style={{
            padding: 18,
            paddingTop: 0,
            display: "grid",
            gap: 16,
            borderTop: `1px solid ${HOUSE.cardBorder}`,
            background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)",
          }}
        >
          <div style={{ paddingTop: 18 }}>
            <div style={{ fontWeight: 800, color: HOUSE.text }}>Problem</div>
            <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.7 }}>
              {safeStr(insight?.diagnosis) || "—"}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, color: HOUSE.text }}>Why It Matters</div>
            <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.7 }}>
              {safeStr(insight?.whyItMatters) || "—"}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 800, color: HOUSE.text }}>Recommended Action</div>
            <div style={{ marginTop: 6, color: HOUSE.subtext, lineHeight: 1.7 }}>
              {safeStr(insight?.recommendation) || "—"}
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 14,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            }}
          >
            <div style={{ fontWeight: 800, color: HOUSE.text }}>Generated Fix</div>
            <div style={{ marginTop: 8 }}>
              <GeneratedFixBlock generatedFix={insight?.generatedFix || {}} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OgiReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const reportId = safeStr(params?.reportId);
  const websiteIdFromQuery = safeStr(searchParams?.get("websiteId"));

  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

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
        console.error("Failed to load OGI report:", e);
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

  const printUrl = useMemo(() => {
    const websiteIdForLink = safeStr(report?.websiteId) || safeStr(report?.effectiveWebsiteId) || websiteIdFromQuery;
    if (!reportId) return "";
    if (websiteIdForLink) {
      return `/growth/intelligence/report/${reportId}/print?websiteId=${encodeURIComponent(websiteIdForLink)}`;
    }
    return `/growth/intelligence/report/${reportId}/print`;
  }, [report, reportId, websiteIdFromQuery]);

  return (
    <AuthGate>
      <VyndowShell activeModule="growth">
        <div
          style={{
            padding: 28,
            background:
              "linear-gradient(180deg, rgba(124,58,237,0.06) 0%, rgba(30,102,255,0.04) 100%)",
            minHeight: "100%",
          }}
        >
          <div style={{ width: "100%", maxWidth: 1180, margin: "0 auto" }}>
            <div
              style={{
                ...CARD_STYLE,
                border: `1px solid rgba(109,40,217,0.18)`,
                background:
                  "linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)",
              }}
            >
              <div style={{ padding: 22 }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
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
                      Vyndow Organic - Live
                    </div>

                    <h1
                      style={{
                        margin: "14px 0 0 0",
                        fontSize: 30,
                        lineHeight: 1.18,
                        fontWeight: 900,
                        color: HOUSE.text,
                        letterSpacing: "-0.4px",
                      }}
                    >
                      Organic Growth Intelligence Report
                    </h1>

                    <div
                      style={{
                        marginTop: 10,
                        color: HOUSE.subtext,
                        fontSize: 15,
                        lineHeight: 1.7,
                      }}
                    >
                      Website: <strong style={{ color: HOUSE.text }}>{safeStr(report?.websiteLabel) || safeStr(report?.websiteUrl) || "—"}</strong>
                      <br />
                      Report Date: <strong style={{ color: HOUSE.text }}>{formatDate(report?.createdAt)}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (printUrl) window.open(printUrl, "_blank", "noopener,noreferrer");
                      }}
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
                      Open Printable Report
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push("/growth/intelligence")}
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
                      Back to OGI Dashboard
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ marginTop: 18, ...CARD_STYLE, padding: 22, color: HOUSE.subtext }}>
                Loading report…
              </div>
            ) : error ? (
              <div style={{ marginTop: 18, ...CARD_STYLE, padding: 22 }}>
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
              </div>
            ) : (
              <>
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 14,
                  }}
                >
                  <MetricCard label="Impressions" metric={kpi?.impressions} />
                  <MetricCard label="Clicks" metric={kpi?.clicks} />
                  <MetricCard label="CTR" metric={kpi?.ctr} />
                  <MetricCard label="Avg Position" metric={kpi?.position} invertPositive />
                </div>

                <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
                  <SectionCard
                    title="Executive Summary"
                    subtitle="A concise overview of what is working, what is not, and where Vyndow sees the strongest next-step opportunities."
                  >
                    <div
                      style={{
                        color: HOUSE.subtext,
                        fontSize: 15,
                        lineHeight: 1.8,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {safeStr(report?.summary?.executiveSummary) || "No executive summary available."}
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Insights"
                    subtitle="Each card shows the problem, why it matters, the recommended action, and any generated fix returned by the AI engine."
                    right={
                      <StatusPill tone="neutral">
                        {Array.isArray(report?.insights) ? report.insights.length : 0} insights
                      </StatusPill>
                    }
                  >
                    {Array.isArray(report?.insights) && report.insights.length > 0 ? (
                      <div style={{ display: "grid", gap: 16 }}>
                        {report.insights.map((insight, idx) => (
                          <InsightCard key={`insight-${idx}`} insight={insight} index={idx} />
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: HOUSE.subtext }}>No insights available.</div>
                    )}
                  </SectionCard>

                  <SectionCard
                    title="30 Day Action Plan"
                    subtitle="A compact prioritized list of actions for the next 30 days."
                  >
                    {Array.isArray(report?.actionPlan) && report.actionPlan.length > 0 ? (
                      <ol
                        style={{
                          margin: 0,
                          paddingLeft: 22,
                          color: HOUSE.subtext,
                          lineHeight: 1.9,
                          fontSize: 15,
                        }}
                      >
                        {report.actionPlan.map((item, idx) => (
                          <li key={`plan-${idx}`} style={{ marginBottom: 10 }}>
                            {safeStr(item)}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div style={{ color: HOUSE.subtext }}>No action plan available.</div>
                    )}
                  </SectionCard>
                </div>
              </>
            )}
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
