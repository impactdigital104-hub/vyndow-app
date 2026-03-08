"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import VyndowShell from "../../VyndowShell";
import AuthGate from "../../components/AuthGate";
import { auth, db } from "../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../suiteLifecycleClient";

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

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};

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

function safeStr(x) {
  return String(x || "").trim();
}

function getWebsiteLabel(w) {
  return (
    safeStr(w?.websiteName) ||
    safeStr(w?.domain) ||
    safeStr(w?.websiteUrl) ||
    "Untitled website"
  );
}

function getWebsiteSubtext(w) {
  return safeStr(w?.websiteUrl) || safeStr(w?.domain) || "";
}

function getExecutiveSummary(report) {
  return safeStr(report?.summary?.executiveSummary || report?.executiveSummary);
}

function getSummaryPreview(report, maxLength = 220) {
  const text = getExecutiveSummary(report);
  if (!text) return "Summary preview not available for this report.";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function getInsightsCount(report) {
  if (Array.isArray(report?.insights)) return report.insights.length;
  return Number(report?.insightsCount || 0);
}

function getBillingCycleLabel(report) {
  const start = toDateOrNull(report?.billingCycle?.start || report?.cycleStart);
  if (start) {
    try {
      return start.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
    } catch (e) {}
  }

  const cycleKey = safeStr(report?.billingCycle?.cycleKey || report?.cycleKey);
  if (cycleKey.includes("__")) {
    const startPart = cycleKey.split("__")[0];
    const parsed = new Date(startPart);
    if (!Number.isNaN(parsed.getTime())) {
      try {
        return parsed.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
        });
      } catch (e) {}
    }
  }

  const createdAt = toDateOrNull(report?.createdAt || report?.generatedAt);
  if (createdAt) {
    try {
      return createdAt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
      });
    } catch (e) {}
  }

  return "—";
}

function StatusPill({ tone = "neutral", children }) {
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

export default function OrganicGrowthIntelligencePage() {
  const router = useRouter();

  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");

  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [cycleInfo, setCycleInfo] = useState({
    cycleKey: "",
    cycleStart: null,
    cycleEnd: null,
  });

  const [currentCycleReport, setCurrentCycleReport] = useState(null);
  const [latestReport, setLatestReport] = useState(null);
  const [latestReportLoading, setLatestReportLoading] = useState(false);
  const [latestReportError, setLatestReportError] = useState("");

  const [generateState, setGenerateState] = useState("idle");
  const [generateError, setGenerateError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/login";
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
  }, []);

  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      try {
        setWebsitesLoading(true);
        setWebsitesError("");

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setWebsites(rows);

        let restored = "";
        try {
          restored = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {}

        if (restored && rows.some((x) => x.id === restored)) {
          setSelectedWebsiteId(restored);
        } else if (rows.length) {
          setSelectedWebsiteId(rows[0].id);
          try {
            localStorage.setItem("vyndow_selectedWebsiteId", rows[0].id);
          } catch (e) {}
        } else {
          setSelectedWebsiteId("");
        }
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setWebsitesError(e?.message || "Failed to load websites.");
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
    } catch (e) {}
  }, [selectedWebsiteId]);

  function getEffectiveContext(websiteId) {
    const id = websiteId || selectedWebsiteId;
    const w = websites.find((x) => x.id === id);

    const effectiveUid = w?.ownerUid || uid;
    const effectiveWebsiteId = w?.ownerWebsiteId || id;

    return { effectiveUid, effectiveWebsiteId };
  }

  useEffect(() => {
    async function loadStatus() {
      if (!uid || !selectedWebsiteId) return;

      try {
        setStatusLoading(true);
        setStatusError("");
        setGenerateError("");

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);

        const suiteRef = doc(db, "users", effectiveUid, "entitlements", "suite");
        const currentSnapRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "ogi",
          "dashboard",
          "currentCycle"
        );

        const [suiteSnap, currentSnap] = await Promise.all([
          getDoc(suiteRef),
          getDoc(currentSnapRef),
        ]);

        const suiteData = suiteSnap.exists() ? suiteSnap.data() || {} : {};
        const cycleStart = toDateOrNull(suiteData.cycleStart);
        const cycleEnd = toDateOrNull(suiteData.cycleEnd);
        const cycleKey =
          cycleStart && cycleEnd
            ? `${cycleStart.toISOString().slice(0, 10)}__${cycleEnd.toISOString().slice(0, 10)}`
            : "";

        setCycleInfo({ cycleKey, cycleStart, cycleEnd });
        setCurrentCycleReport(currentSnap.exists() ? currentSnap.data() || {} : null);
      } catch (e) {
        console.error("Failed to load OGI dashboard status:", e);
        setStatusError(e?.message || "Failed to load Organic Growth Intelligence status.");
        setCurrentCycleReport(null);
      } finally {
        setStatusLoading(false);
      }
    }

    loadStatus();
  }, [uid, selectedWebsiteId, websites]);

  useEffect(() => {
    async function loadLatestReport() {
      if (!uid || !selectedWebsiteId || websitesLoading) return;

      try {
        setLatestReportLoading(true);
        setLatestReportError("");
        setLatestReport(null);

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
        const reportsCol = collection(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "ogiReports"
        );
        const reportsQuery = query(reportsCol, orderBy("createdAt", "desc"), limit(1));
        const snap = await getDocs(reportsQuery);

        if (snap.empty) {
          setLatestReport(null);
          return;
        }

        const firstDoc = snap.docs[0];
        setLatestReport({ id: firstDoc.id, ...firstDoc.data() });
      } catch (e) {
        console.error("Failed to load latest OGI report:", e);
        setLatestReport(null);
        setLatestReportError(e?.message || "Failed to load latest report.");
      } finally {
        setLatestReportLoading(false);
      }
    }

    loadLatestReport();
  }, [uid, selectedWebsiteId, websites, websitesLoading]);

  const selectedWebsite = useMemo(() => {
    return websites.find((w) => w.id === selectedWebsiteId) || null;
  }, [websites, selectedWebsiteId]);

  const currentCycleKeyFromReport = safeStr(currentCycleReport?.cycleKey);
  const alreadyGeneratedThisCycle =
    !!cycleInfo.cycleKey &&
    !!currentCycleKeyFromReport &&
    currentCycleKeyFromReport === cycleInfo.cycleKey &&
    !!currentCycleReport?.generatedAt;

  const canGenerate =
    !!selectedWebsiteId &&
    !statusLoading &&
    generateState !== "generating" &&
    !alreadyGeneratedThisCycle;

  async function handleGenerateReport() {
    if (!selectedWebsiteId) {
      setGenerateError("Please select a website first.");
      return;
    }

    try {
      setGenerateError("");
      setGenerateState("generating");

      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("You are not logged in.");
      }

      const idToken = await currentUser.getIdToken();

      const resp = await fetch("/api/ogi/generateInsights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ websiteId: selectedWebsiteId }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.ok !== true) {
        throw new Error(data?.error || "Failed to generate Organic Growth Intelligence report.");
      }

      const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
      const generatedAt = Timestamp.now();

      const reportsCol = collection(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "ogiReports"
      );
      const reportRef = doc(reportsCol);
      const reportId = reportRef.id;

      const billingCycle = {
        cycleKey: cycleInfo.cycleKey || "",
        start: cycleInfo.cycleStart ? Timestamp.fromDate(cycleInfo.cycleStart) : null,
        end: cycleInfo.cycleEnd ? Timestamp.fromDate(cycleInfo.cycleEnd) : null,
      };

      const kpi = data?.summary?.topMetrics || {};
      const websiteLabel = getWebsiteLabel(selectedWebsite);
      const websiteUrl = getWebsiteSubtext(selectedWebsite);

      await setDoc(
        reportRef,
        {
          createdAt: generatedAt,
          billingCycle,
          summary: data.summary || {},
          insights: Array.isArray(data.insights) ? data.insights : [],
          actionPlan: Array.isArray(data.actionPlan) ? data.actionPlan : [],
          kpi,
          websiteId: selectedWebsiteId,
          effectiveUid,
          effectiveWebsiteId,
          websiteLabel,
          websiteUrl,
          debugMeta: data.debugMeta || {},
        },
        { merge: true }
      );

      const currentCycleRef = doc(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "modules",
        "ogi",
        "dashboard",
        "currentCycle"
      );

      const latestRef = doc(
        db,
        "users",
        effectiveUid,
        "websites",
        effectiveWebsiteId,
        "modules",
        "ogi",
        "dashboard",
        "latest"
      );

      await setDoc(
        currentCycleRef,
        {
          cycleKey: cycleInfo.cycleKey || "",
          cycleStart: billingCycle.start,
          cycleEnd: billingCycle.end,
          generatedAt,
          generatedByUid: uid,
          reportId,
          websiteId: selectedWebsiteId,
          effectiveUid,
          effectiveWebsiteId,
          executiveSummary: safeStr(data?.summary?.executiveSummary),
          insightsCount: Array.isArray(data?.insights) ? data.insights.length : 0,
          actionPlanCount: Array.isArray(data?.actionPlan) ? data.actionPlan.length : 0,
        },
        { merge: true }
      );

      await setDoc(
        latestRef,
        {
          cycleKey: cycleInfo.cycleKey || "",
          generatedAt,
          reportId,
          websiteId: selectedWebsiteId,
          effectiveUid,
          effectiveWebsiteId,
          executiveSummary: safeStr(data?.summary?.executiveSummary),
          insightsCount: Array.isArray(data?.insights) ? data.insights.length : 0,
          actionPlanCount: Array.isArray(data?.actionPlan) ? data.actionPlan.length : 0,
        },
        { merge: true }
      );

      setGenerateState("success");

      router.push(
        `/growth/intelligence/report/${reportId}?websiteId=${encodeURIComponent(selectedWebsiteId)}`
      );
    } catch (e) {
      console.error("OGI generation failed:", e);
      setGenerateError(e?.message || "Failed to generate Organic Growth Intelligence report.");
      setGenerateState("error");
    }
  }

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
          <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto" }}>
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
                  Organic Growth Intelligence
                </h1>

                <p
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    color: HOUSE.subtext,
                    fontSize: 15,
                    lineHeight: 1.7,
                    maxWidth: 860,
                  }}
                >
                  Understand what is working, what is not, and what Vyndow recommends
                  for the next 30 days based on your Google Search Console data and your
                  Vyndow SEO strategy.
                </p>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <StatusPill tone="neutral">1 report per billing cycle per website</StatusPill>
                  <StatusPill tone="neutral">Manual generation</StatusPill>
                  <StatusPill tone="neutral">GSC + Vyndow strategy aware</StatusPill>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.9fr)",
                gap: 18,
              }}
            >
              <div style={{ display: "grid", gap: 18 }}>
                <SectionCard
                  title="Report Eligibility"
                  subtitle="Check whether this website can generate an Organic Growth Intelligence report in the current billing cycle."
                  right={
                    alreadyGeneratedThisCycle ? (
                      <StatusPill tone="warning">Already generated this cycle</StatusPill>
                    ) : (
                      <StatusPill tone="success">Eligible to generate</StatusPill>
                    )
                  }
                >
                  {websitesLoading ? (
                    <div style={{ color: HOUSE.subtext }}>Loading your websites…</div>
                  ) : websitesError ? (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(220,38,38,0.08)",
                        color: HOUSE.danger,
                        border: "1px solid rgba(220,38,38,0.15)",
                      }}
                    >
                      {websitesError}
                    </div>
                  ) : websites.length === 0 ? (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        background: HOUSE.bgSoft,
                        border: `1px solid ${HOUSE.cardBorder}`,
                        color: HOUSE.text,
                        lineHeight: 1.65,
                      }}
                    >
                      No website profile was found yet. Please create a website first in
                      <strong> Websites &amp; Clients</strong>.
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: 13,
                            fontWeight: 700,
                            marginBottom: 6,
                            color: "#111827",
                          }}
                        >
                          Select website
                        </label>
                        <select
                          value={selectedWebsiteId}
                          onChange={(e) => setSelectedWebsiteId(e.target.value)}
                          style={inputStyle}
                        >
                          {websites.map((w) => (
                            <option key={w.id} value={w.id}>
                              {getWebsiteLabel(w)}
                            </option>
                          ))}
                        </select>
                        {selectedWebsite ? (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              color: HOUSE.subtext,
                            }}
                          >
                            {getWebsiteSubtext(selectedWebsite)}
                          </div>
                        ) : null}
                      </div>

                      {statusError ? (
                        <div
                          style={{
                            marginBottom: 14,
                            padding: 12,
                            borderRadius: 12,
                            background: "rgba(220,38,38,0.08)",
                            color: HOUSE.danger,
                            border: "1px solid rgba(220,38,38,0.15)",
                          }}
                        >
                          {statusError}
                        </div>
                      ) : null}

                      <div
                        style={{
                          padding: 16,
                          borderRadius: 14,
                          border: `1px solid ${HOUSE.cardBorder}`,
                          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                        }}
                      >
                        {!selectedWebsiteId ? (
                          <div style={{ color: HOUSE.subtext }}>
                            Select a website to continue.
                          </div>
                        ) : statusLoading || !authReady ? (
                          <div style={{ color: HOUSE.subtext }}>
                            Checking billing-cycle eligibility…
                          </div>
                        ) : alreadyGeneratedThisCycle ? (
                          <>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: HOUSE.text,
                              }}
                            >
                              This cycle’s report has already been generated.
                            </div>
                            <div
                              style={{
                                marginTop: 8,
                                color: HOUSE.subtext,
                                lineHeight: 1.65,
                              }}
                            >
                              Next report available on: <strong>{formatDate(cycleInfo.cycleEnd)}</strong>
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 800,
                                color: HOUSE.text,
                              }}
                            >
                              This cycle’s report has not been generated yet.
                            </div>
                            <div
                              style={{
                                marginTop: 8,
                                color: HOUSE.subtext,
                                lineHeight: 1.65,
                              }}
                            >
                              You can generate one Organic Growth Intelligence report for
                              this website in the current billing cycle.
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </SectionCard>

                <SectionCard
                  title="Generate Report"
                  subtitle="This action runs the completed backend intelligence engine, stores the report, and opens the report detail page."
                >
                  {generateError ? (
                    <div
                      style={{
                        marginBottom: 14,
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(220,38,38,0.08)",
                        color: HOUSE.danger,
                        border: "1px solid rgba(220,38,38,0.15)",
                      }}
                    >
                      {generateError}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <button
                      onClick={handleGenerateReport}
                      disabled={!canGenerate}
                      style={{
                        padding: "12px 16px",
                        borderRadius: 12,
                        border: "none",
                        background: canGenerate ? HOUSE.primaryBlue : "#CBD5E1",
                        color: "white",
                        fontWeight: 800,
                        cursor: canGenerate ? "pointer" : "not-allowed",
                        boxShadow: canGenerate
                          ? "0 10px 22px rgba(30,102,255,0.22)"
                          : "none",
                      }}
                    >
                      {generateState === "generating"
                        ? "Generating report…"
                        : "Generate This Cycle’s Report"}
                    </button>

                    {generateState === "generating" ? (
                      <div style={{ color: HOUSE.subtext }}>
                        Generating your Organic Growth Intelligence report… This may take a few moments.
                      </div>
                    ) : alreadyGeneratedThisCycle ? (
                      <div style={{ color: HOUSE.subtext }}>
                        Report generation is locked for this website in the current billing cycle.
                      </div>
                    ) : (
                      <div style={{ color: HOUSE.subtext }}>
                        The generated report will be stored and opened automatically.
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <SectionCard
                  title="Latest Report"
                  subtitle="Preview the most recent Organic Growth Intelligence report for this website."
                  right={
                    selectedWebsiteId ? (
                      <button
                        onClick={() =>
                          router.push(
                            `/growth/intelligence/history?websiteId=${encodeURIComponent(selectedWebsiteId)}`
                          )
                        }
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: `1px solid ${HOUSE.cardBorder}`,
                          background: "white",
                          color: HOUSE.primaryBlue,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        View All Reports
                      </button>
                    ) : null
                  }
                >
                  {latestReportError ? (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(220,38,38,0.08)",
                        color: HOUSE.danger,
                        border: "1px solid rgba(220,38,38,0.15)",
                      }}
                    >
                      {latestReportError}
                    </div>
                  ) : latestReportLoading ? (
                    <div style={{ color: HOUSE.subtext }}>Loading latest report…</div>
                  ) : !selectedWebsiteId ? (
                    <div style={{ color: HOUSE.subtext }}>Select a website to view report history.</div>
                  ) : !latestReport?.id ? (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: `1px solid ${HOUSE.cardBorder}`,
                        background: HOUSE.bgSoft,
                        color: HOUSE.text,
                        lineHeight: 1.65,
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>No reports generated yet.</div>
                      <div style={{ marginTop: 8, color: HOUSE.subtext }}>
                        Generate your first Organic Growth Intelligence report to see insights here.
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: `1px solid ${HOUSE.cardBorder}`,
                        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                      }}
                    >
                      <div style={{ fontSize: 14, color: HOUSE.subtext }}>Latest Report</div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 20,
                          fontWeight: 900,
                          color: HOUSE.text,
                        }}
                      >
                        {getBillingCycleLabel(latestReport)}
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                        <div style={{ color: HOUSE.text, fontSize: 14, lineHeight: 1.55 }}>
                          <strong>Generated on:</strong> {formatDate(latestReport.createdAt)}
                        </div>
                        <div style={{ color: HOUSE.text, fontSize: 14, lineHeight: 1.55 }}>
                          <strong>Billing cycle:</strong> {getBillingCycleLabel(latestReport)}
                        </div>
                        <div style={{ color: HOUSE.text, fontSize: 14, lineHeight: 1.65 }}>
                          <strong>Executive summary:</strong> {getSummaryPreview(latestReport, 190)}
                        </div>
                      </div>

                      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <StatusPill tone="neutral">
                          Insights generated: {getInsightsCount(latestReport)}
                        </StatusPill>
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <button
                          onClick={() =>
                            router.push(
                              `/growth/intelligence/report/${latestReport.id}?websiteId=${encodeURIComponent(selectedWebsiteId)}`
                            )
                          }
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
                          View Full Report
                        </button>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Billing-Cycle Guardrail"
                  subtitle="What is enforced on this page."
                >
                  <div style={{ color: HOUSE.subtext, lineHeight: 1.7 }}>
                    This page reads the active billing cycle from the suite entitlement
                    document. It blocks a second Organic Growth Intelligence report for the
                    same website in the same billing cycle.
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                    <div style={{ color: HOUSE.text, fontWeight: 800 }}>
                      Current cycle start:{" "}
                      <span style={{ color: HOUSE.subtext, fontWeight: 600 }}>
                        {formatDate(cycleInfo.cycleStart)}
                      </span>
                    </div>
                    <div style={{ color: HOUSE.text, fontWeight: 800 }}>
                      Current cycle end:{" "}
                      <span style={{ color: HOUSE.subtext, fontWeight: 600 }}>
                        {formatDate(cycleInfo.cycleEnd)}
                      </span>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
