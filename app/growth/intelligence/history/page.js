"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../../VyndowShell";
import AuthGate from "../../../components/AuthGate";
import { auth, db } from "../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../suiteLifecycleClient";

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

export default function OrganicGrowthIntelligenceHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [uid, setUid] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");

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

        const queryWebsiteId = safeStr(searchParams.get("websiteId"));
        let restored = "";
        try {
          restored = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {}

        if (queryWebsiteId && rows.some((x) => x.id === queryWebsiteId)) {
          setSelectedWebsiteId(queryWebsiteId);
          try {
            localStorage.setItem("vyndow_selectedWebsiteId", queryWebsiteId);
          } catch (e) {}
        } else if (restored && rows.some((x) => x.id === restored)) {
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
  }, [uid, searchParams]);

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
    async function loadReports() {
      if (!uid || !selectedWebsiteId || websitesLoading) return;

      try {
        setReportsLoading(true);
        setReportsError("");
        setReports([]);

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
        const reportsCol = collection(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "ogiReports"
        );
        const reportsQuery = query(reportsCol, orderBy("createdAt", "desc"));
        const snap = await getDocs(reportsQuery);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setReports(rows);
      } catch (e) {
        console.error("Failed to load OGI reports:", e);
        setReports([]);
        setReportsError(e?.message || "Failed to load Organic Growth Intelligence reports.");
      } finally {
        setReportsLoading(false);
      }
    }

    loadReports();
  }, [uid, selectedWebsiteId, websites, websitesLoading]);

  const selectedWebsite = useMemo(() => {
    return websites.find((w) => w.id === selectedWebsiteId) || null;
  }, [websites, selectedWebsiteId]);

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
          <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 18 }}>
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
                  Organic Growth Intelligence Archive
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 30,
                        lineHeight: 1.18,
                        fontWeight: 900,
                        color: HOUSE.text,
                        letterSpacing: "-0.4px",
                      }}
                    >
                      Organic Growth Intelligence Reports
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
                      View previously generated intelligence reports for this website.
                    </p>
                  </div>

                  <button
                    onClick={() =>
                      router.push(
                        selectedWebsiteId
                          ? `/growth/intelligence?websiteId=${encodeURIComponent(selectedWebsiteId)}`
                          : "/growth/intelligence"
                      )
                    }
                    style={{
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: `1px solid ${HOUSE.cardBorder}`,
                      background: "white",
                      color: HOUSE.primaryBlue,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Back to OGI Dashboard
                  </button>
                </div>
              </div>
            </div>

            <SectionCard
              title="Website"
              subtitle="Choose the website whose Organic Growth Intelligence reports you want to review."
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
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      outline: "none",
                    }}
                  >
                    {websites.map((w) => (
                      <option key={w.id} value={w.id}>
                        {getWebsiteLabel(w)}
                      </option>
                    ))}
                  </select>
                  {selectedWebsite ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: HOUSE.subtext }}>
                      {getWebsiteSubtext(selectedWebsite)}
                    </div>
                  ) : null}
                </>
              )}
            </SectionCard>

            <SectionCard
              title="Report Archive"
              subtitle="Reports are listed newest first for the selected website."
            >
              {reportsError ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(220,38,38,0.08)",
                    color: HOUSE.danger,
                    border: "1px solid rgba(220,38,38,0.15)",
                  }}
                >
                  {reportsError}
                </div>
              ) : reportsLoading ? (
                <div style={{ color: HOUSE.subtext }}>Loading report archive…</div>
              ) : !selectedWebsiteId ? (
                <div style={{ color: HOUSE.subtext }}>Select a website to view its reports.</div>
              ) : reports.length === 0 ? (
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
                  <div style={{ fontWeight: 800 }}>
                    No Organic Growth Intelligence reports available yet.
                  </div>
                  <div style={{ marginTop: 8, color: HOUSE.subtext }}>
                    Generate your first report from the dashboard to see it appear here.
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button
                      onClick={() =>
                        router.push(
                          selectedWebsiteId
                            ? `/growth/intelligence?websiteId=${encodeURIComponent(selectedWebsiteId)}`
                            : "/growth/intelligence"
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
                      Back to OGI Dashboard
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: `1px solid ${HOUSE.cardBorder}`,
                        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: HOUSE.text }}>
                            {getBillingCycleLabel(report)} Report
                          </div>
                          <div style={{ marginTop: 6, color: HOUSE.subtext, fontSize: 14 }}>
                            Generated on {formatDate(report.createdAt)}
                          </div>
                          <div style={{ marginTop: 12, color: HOUSE.text, lineHeight: 1.65, fontSize: 14 }}>
                            {getSummaryPreview(report, 220)}
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
                          <StatusPill tone="neutral">Insights: {getInsightsCount(report)}</StatusPill>
                          <button
                            onClick={() =>
                              router.push(
                                `/growth/intelligence/report/${report.id}?websiteId=${encodeURIComponent(selectedWebsiteId)}`
                              )
                            }
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              border: "none",
                              background: HOUSE.primaryBlue,
                              color: "white",
                              fontWeight: 800,
                              cursor: "pointer",
                              boxShadow: "0 10px 22px rgba(30,102,255,0.22)",
                            }}
                          >
                            View Report
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
