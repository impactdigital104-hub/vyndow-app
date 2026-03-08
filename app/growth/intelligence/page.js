"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
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

function formatDateTime(value) {
  const d = toDateOrNull(value);
  if (!d) return "—";
  try {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

  const [effectiveContext, setEffectiveContext] = useState({
    effectiveUid: "",
    effectiveWebsiteId: "",
  });

  const [currentCycleReport, setCurrentCycleReport] = useState(null);
  const [latestReport, setLatestReport] = useState(null);

  const [generateState, setGenerateState] = useState("idle");
  const [generateError, setGenerateError] = useState("");
  const [inlinePreview, setInlinePreview] = useState(null);

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
        setInlinePreview(null);

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
        setEffectiveContext({ effectiveUid, effectiveWebsiteId });

        const suiteRef = doc(db, "users", effectiveUid, "entitlements", "suite");
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

        const [suiteSnap, currentSnap, latestSnap] = await Promise.all([
          getDoc(suiteRef),
          getDoc(currentCycleRef),
          getDoc(latestRef),
        ]);

        const suiteData = suiteSnap.exists() ? suiteSnap.data() || {} : {};
        const cycleStart = toDateOrNull(suiteData.cycleStart);
        const cycleEnd = toDateOrNull(suiteData.cycleEnd);
        const cycleKey =
          cycleStart && cycleEnd
            ? `${cycleStart.toISOString().slice(0, 10)}__${cycleEnd.toISOString().slice(0, 10)}`
            : "";

        setCycleInfo({ cycleKey, cycleStart, cycleEnd });

        const currentData = currentSnap.exists() ? currentSnap.data() || {} : null;
        const latestData = latestSnap.exists() ? latestSnap.data() || {} : null;

        setCurrentCycleReport(currentData);
        setLatestReport(latestData);
      } catch (e) {
        console.error("Failed to load OGI dashboard status:", e);
        setStatusError(e?.message || "Failed to load Organic Growth Intelligence status.");
        setCurrentCycleReport(null);
        setLatestReport(null);
      } finally {
        setStatusLoading(false);
      }
    }

    loadStatus();
  }, [uid, selectedWebsiteId, websites]);

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
    !generateState.startsWith("generating") &&
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
          cycleStart: cycleInfo.cycleStart ? Timestamp.fromDate(cycleInfo.cycleStart) : null,
          cycleEnd: cycleInfo.cycleEnd ? Timestamp.fromDate(cycleInfo.cycleEnd) : null,
          generatedAt,
          generatedByUid: uid,
          websiteId: selectedWebsiteId,
          effectiveUid,
          effectiveWebsiteId,
          summary: data.summary || {},
          insights: Array.isArray(data.insights) ? data.insights : [],
          actionPlan: Array.isArray(data.actionPlan) ? data.actionPlan : [],
          debugMeta: data.debugMeta || {},
        },
        { merge: true }
      );

      await setDoc(
        latestRef,
        {
          cycleKey: cycleInfo.cycleKey || "",
          generatedAt,
          websiteId: selectedWebsiteId,
          effectiveUid,
          effectiveWebsiteId,
          executiveSummary: safeStr(data?.summary?.executiveSummary),
          insightsCount: Array.isArray(data?.insights) ? data.insights.length : 0,
          actionPlanCount: Array.isArray(data?.actionPlan) ? data.actionPlan.length : 0,
        },
        { merge: true }
      );

      const currentDocLocal = {
        cycleKey: cycleInfo.cycleKey || "",
        cycleStart: cycleInfo.cycleStart ? Timestamp.fromDate(cycleInfo.cycleStart) : null,
        cycleEnd: cycleInfo.cycleEnd ? Timestamp.fromDate(cycleInfo.cycleEnd) : null,
        generatedAt,
        summary: data.summary || {},
        insights: Array.isArray(data.insights) ? data.insights : [],
        actionPlan: Array.isArray(data.actionPlan) ? data.actionPlan : [],
      };

      const latestDocLocal = {
        cycleKey: cycleInfo.cycleKey || "",
        generatedAt,
        executiveSummary: safeStr(data?.summary?.executiveSummary),
        insightsCount: Array.isArray(data?.insights) ? data.insights.length : 0,
        actionPlanCount: Array.isArray(data?.actionPlan) ? data.actionPlan.length : 0,
      };

      setCurrentCycleReport(currentDocLocal);
      setLatestReport(latestDocLocal);
      setInlinePreview({
        executiveSummary: safeStr(data?.summary?.executiveSummary),
        insightsCount: Array.isArray(data?.insights) ? data.insights.length : 0,
        actionPlanCount: Array.isArray(data?.actionPlan) ? data.actionPlan.length : 0,
      });
      setGenerateState("success");
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
                              Next report available on:{" "}
                              <strong>{formatDate(cycleInfo.cycleEnd)}</strong>
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
                  subtitle="This action runs the completed backend intelligence engine using GSC data and Vyndow strategy context."
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
                        A fresh report will be generated from your current GSC data and Vyndow strategy context.
                      </div>
                    )}
                  </div>
                </SectionCard>

                {(generateState === "success" || inlinePreview || currentCycleReport?.summary) ? (
                  <SectionCard
                    title="Latest Generated Result"
                    subtitle="This is only a lightweight preview for now. The full report detail page comes next."
                    right={<StatusPill tone="success">Report ready</StatusPill>}
                  >
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: `1px solid ${HOUSE.cardBorder}`,
                        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 800, color: HOUSE.text }}>
                        Executive Summary
                      </div>
                      <p
                        style={{
                          marginTop: 10,
                          marginBottom: 0,
                          color: HOUSE.subtext,
                          lineHeight: 1.7,
                        }}
                      >
                        {safeStr(
                          inlinePreview?.executiveSummary ||
                            currentCycleReport?.summary?.executiveSummary
                        ) || "Report generated successfully."}
                      </p>

                      <div
                        style={{
                          marginTop: 14,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <StatusPill tone="neutral">
                          Insights returned:{" "}
                          {Number(
                            inlinePreview?.insightsCount ||
                              currentCycleReport?.insights?.length ||
                              0
                          )}
                        </StatusPill>
                        <StatusPill tone="neutral">
                          Action items:{" "}
                          {Number(
                            inlinePreview?.actionPlanCount ||
                              currentCycleReport?.actionPlan?.length ||
                              0
                          )}
                        </StatusPill>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <button
                          type="button"
                          disabled
                          title="Full report detail page will be added in OGI-5B."
                          style={{
                            padding: "10px 14px",
                            borderRadius: 12,
                            border: `1px solid ${HOUSE.cardBorder}`,
                            background: "white",
                            color: HOUSE.subtext,
                            fontWeight: 700,
                            cursor: "not-allowed",
                          }}
                        >
                          Full Report View Coming Next
                        </button>
                      </div>
                    </div>
                  </SectionCard>
                ) : null}
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <SectionCard
                  title="Most Recent Report"
                  subtitle="A simple placeholder so this dashboard already feels complete without full history yet."
                >
                  {!latestReport?.generatedAt ? (
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
                      <div style={{ fontWeight: 800 }}>Not generated yet</div>
                      <div style={{ marginTop: 8, color: HOUSE.subtext }}>
                        Once you generate your first Organic Growth Intelligence report,
                        the latest generated timestamp will appear here.
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
                      <div style={{ fontSize: 14, color: HOUSE.subtext }}>
                        Last generated report
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 18,
                          fontWeight: 900,
                          color: HOUSE.text,
                        }}
                      >
                        {formatDateTime(latestReport.generatedAt)}
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <StatusPill tone="neutral">
                          Insights: {Number(latestReport?.insightsCount || 0)}
                        </StatusPill>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Module Scope"
                  subtitle="This page is intentionally lightweight."
                >
                  <div style={{ color: HOUSE.subtext, lineHeight: 1.7 }}>
                    This dashboard is only the entry point for Organic Growth Intelligence.
                    It handles:
                    <div style={{ marginTop: 10 }}>
                      • report eligibility
                      <br />
                      • billing-cycle aware generation
                      <br />
                      • generation state
                      <br />
                      • lightweight recent-result preview
                    </div>

                    <div style={{ marginTop: 12 }}>
                      The full report detail experience will be added in the next phase.
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Billing-Cycle Guardrail"
                  subtitle="What has been implemented in this phase."
                >
                  <div style={{ color: HOUSE.subtext, lineHeight: 1.7 }}>
                    The page reads the active billing cycle from the suite entitlement
                    document and stores the generated OGI result against the effective
                    website context for that cycle.
                    <div style={{ marginTop: 12 }}>
                      If a report already exists for the current cycle, generation is blocked
                      and the page shows the next available date.
                    </div>
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
