"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../VyndowShell";
import AuthGate from "../../components/AuthGate";
import { auth, db } from "../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../suiteLifecycleClient";

const PAGE_BG =
  "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)";
const CARD_BG = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
const CARD_BORDER = "1px solid rgba(124,58,237,0.20)";
const SHADOW = "0 10px 26px rgba(15,23,42,0.06)";

function normalizeCompetitors(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          return String(item.domain || item.url || item.website || item.name || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function cleanDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function titleCaseGeoMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "—";
  if (raw === "country") return "Country";
  if (raw === "local") return "Local";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function safePillarsFromDoc(data) {
  const approved = data?.approved === true;

  const pillarSource =
    approved && Array.isArray(data?.finalVersion?.pillars)
      ? data.finalVersion.pillars
      : Array.isArray(data?.userVersion?.pillars)
      ? data.userVersion.pillars
      : Array.isArray(data?.aiVersion?.pillars)
      ? data.aiVersion.pillars
      : [];

  return pillarSource
    .map((pillar) => ({
      name: String(pillar?.name || pillar?.pillarName || "").trim(),
    }))
    .filter((pillar) => pillar.name);
}

function SummaryRow({ label, value, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "170px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderTop: "1px solid #eef2ff",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: "#6b7280" }}>{label}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{value}</div>
        {children}
      </div>
    </div>
  );
}

function SmallChip({ children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(30,102,255,0.14)",
        background: "rgba(30,102,255,0.06)",
        color: "#1d4ed8",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
}

function MetricBox({ label, value }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", letterSpacing: 0.2 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          lineHeight: 1.1,
          fontWeight: 800,
          color: "#111827",
        }}
      >
        {value}
      </div>
    </div>
  );
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

function normalizeSelfProfile(data) {
  const selfProfile = data || {};
  return {
    domain: String(selfProfile.domain || "").trim(),
    normalizedDomain: cleanDomain(selfProfile.normalizedDomain || selfProfile.domain || ""),
    referringDomains:
      Number.isFinite(Number(selfProfile.referringDomains)) ? Number(selfProfile.referringDomains) : null,
    totalBacklinks:
      Number.isFinite(Number(selfProfile.totalBacklinks)) ? Number(selfProfile.totalBacklinks) : null,
    authorityBuckets:
      selfProfile.authorityBuckets && typeof selfProfile.authorityBuckets === "object"
        ? selfProfile.authorityBuckets
        : null,
    source: String(selfProfile.source || "").trim(),
    lastAnalyzedAt: selfProfile.lastAnalyzedAt || null,
    updatedAt: selfProfile.updatedAt || null,
  };
}

export default function BacklinkAuthorityPage() {
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [websites, setWebsites] = useState([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");
  const [websitesLoading, setWebsitesLoading] = useState(true);

  const [contextState, setContextState] = useState("loading"); // loading | ready | missing | error
  const [contextError, setContextError] = useState("");
  const [contextData, setContextData] = useState(null);

  const [selfProfileState, setSelfProfileState] = useState("idle"); // idle | loading | empty | ready | running | error | blocked
  const [selfProfileError, setSelfProfileError] = useState("");
  const [selfProfileData, setSelfProfileData] = useState(null);

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
    async function loadBacklinkContext() {
      if (!uid || !selectedWebsiteId || !websites.length) return;

      try {
        setContextState("loading");
        setContextError("");

        const { effectiveUid, effectiveWebsiteId, website } = getEffectiveContext(selectedWebsiteId);
        if (!effectiveUid || !effectiveWebsiteId) {
          setContextData(null);
          setContextState("missing");
          return;
        }

        const businessProfileRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "seo",
          "strategy",
          "businessProfile"
        );

        const keywordPoolRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "seo",
          "strategy",
          "keywordPool"
        );

        const keywordClusteringRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "seo",
          "strategy",
          "keywordClustering"
        );

        const [businessProfileSnap, keywordPoolSnap, keywordClusteringSnap] = await Promise.all([
          getDoc(businessProfileRef),
          getDoc(keywordPoolRef),
          getDoc(keywordClusteringRef),
        ]);

        if (!businessProfileSnap.exists() || !keywordPoolSnap.exists() || !keywordClusteringSnap.exists()) {
          setContextData(null);
          setContextState("missing");
          return;
        }

        const businessProfile = businessProfileSnap.data() || {};
        const keywordPool = keywordPoolSnap.data() || {};
        const keywordClustering = keywordClusteringSnap.data() || {};

        const competitorsRaw = normalizeCompetitors(businessProfile?.competitors);
        const competitors = Array.from(new Set(competitorsRaw.map(cleanDomain).filter(Boolean)));

        const pillars = safePillarsFromDoc(keywordClustering);
        const pillarNames = Array.from(new Set(pillars.map((pillar) => pillar.name).filter(Boolean)));

        const geoMode = String(keywordPool?.geo_mode || "").trim().toLowerCase();
        const geography = String(keywordPool?.location_name || "").trim();
        const industry = String(businessProfile?.industry || "").trim();
        const websiteLabel = cleanDomain(
          website?.domain || website?.website || website?.url || website?.name || website?.label || ""
        );

        if (!websiteLabel || !industry || !geoMode || !geography) {
          setContextData(null);
          setContextState("missing");
          return;
        }

        setContextData({
          websiteLabel,
          industry,
          geography,
          geoMode,
          competitors,
          pillarCount: pillarNames.length,
          pillarNames,
        });
        setContextState("ready");
      } catch (e) {
        console.error("Failed to load backlink context:", e);
        setContextData(null);
        setContextState("error");
        setContextError(e?.message || "Failed to load backlink context.");
      }
    }

    loadBacklinkContext();
  }, [uid, selectedWebsiteId, websites]);

  useEffect(() => {
    async function loadStoredSelfProfile() {
      if (!uid || !selectedWebsiteId || !websites.length) return;

      if (contextState === "missing") {
        setSelfProfileData(null);
        setSelfProfileError("");
        setSelfProfileState("blocked");
        return;
      }

      if (contextState !== "ready") return;

      try {
        setSelfProfileState("loading");
        setSelfProfileError("");

        const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
        if (!effectiveUid || !effectiveWebsiteId) {
          setSelfProfileData(null);
          setSelfProfileState("empty");
          return;
        }

        const backlinksModuleRef = doc(
          db,
          "users",
          effectiveUid,
          "websites",
          effectiveWebsiteId,
          "modules",
          "backlinks"
        );

        const snap = await getDoc(backlinksModuleRef);

        if (!snap.exists()) {
          setSelfProfileData(null);
          setSelfProfileState("empty");
          return;
        }

        const moduleData = snap.data() || {};
        const normalized = normalizeSelfProfile(moduleData?.selfProfile || null);

        if (!normalized.normalizedDomain && normalized.referringDomains == null && normalized.totalBacklinks == null) {
          setSelfProfileData(null);
          setSelfProfileState("empty");
          return;
        }

        setSelfProfileData(normalized);
        setSelfProfileState("ready");
      } catch (e) {
        console.error("Failed to load stored backlink profile:", e);
        setSelfProfileData(null);
        setSelfProfileError("We could not load your saved backlink profile right now.");
        setSelfProfileState("error");
      }
    }

    loadStoredSelfProfile();
  }, [uid, selectedWebsiteId, websites, contextState]);

  const canShowContext = contextState === "ready" && contextData;
  const planButtonDisabled = contextState !== "ready";

  const competitorPreview = useMemo(() => {
    return canShowContext ? contextData.competitors.slice(0, 8) : [];
  }, [canShowContext, contextData]);

  const pillarPreview = useMemo(() => {
    return canShowContext ? contextData.pillarNames.slice(0, 8) : [];
  }, [canShowContext, contextData]);

  async function handleAnalyzeSelfBacklinks() {
    try {
      if (!auth.currentUser) {
        router.replace("/login");
        return;
      }

      setSelfProfileError("");
      setSelfProfileState("running");

      const idToken = await auth.currentUser.getIdToken();

      const res = await fetch("/api/backlinks/analyze-self", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          websiteId: selectedWebsiteId,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(
          json?.error || "We could not analyze your backlink profile right now. Please try again."
        );
      }

      const normalized = normalizeSelfProfile(json?.profile || {});
      setSelfProfileData(normalized);
      setSelfProfileState("ready");
    } catch (e) {
      console.error("Backlink self-analysis failed:", e);
      setSelfProfileError("We could not analyze your backlink profile right now. Please try again.");
      setSelfProfileState("error");
    }
  }

  const showAuthorityBuckets =
    selfProfileData?.authorityBuckets &&
    typeof selfProfileData.authorityBuckets === "object" &&
    Object.keys(selfProfileData.authorityBuckets).length > 0;

  return (
    <AuthGate>
      <VyndowShell activeModule="seo">
        <div
          style={{
            padding: 28,
            background: PAGE_BG,
            borderRadius: 18,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 980,
              margin: "0 auto",
              paddingTop: 6,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.2,
                fontWeight: 800,
                color: "#111827",
              }}
            >
              Backlink Authority
            </h1>

            <p
              style={{
                marginTop: 10,
                color: "#374151",
                lineHeight: 1.65,
                fontSize: 16,
              }}
            >
              Build domain authority and close the gap with your competitors.
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
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#111827",
                  marginBottom: 10,
                }}
              >
                Backlink Authority Plan
              </div>

              <p
                style={{
                  marginTop: 0,
                  color: "#374151",
                  lineHeight: 1.7,
                }}
              >
                This module will analyze your current backlink profile, compare it with your competitors,
                and generate a plan-based monthly backlink action list.
              </p>

              <button
                type="button"
                className="btn btn-primary"
                disabled={planButtonDisabled}
                title={
                  planButtonDisabled
                    ? "Strategy context must load first."
                    : "Backlink plan generation will be connected in the next stage."
                }
                style={{
                  marginTop: 8,
                  opacity: planButtonDisabled ? 0.65 : 1,
                  cursor: planButtonDisabled ? "not-allowed" : "pointer",
                }}
              >
                Generate Backlink Plan
              </button>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  color: "#6b7280",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Context and backlink analysis will be connected in the next stage.
              </p>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 22,
                borderRadius: 18,
                border: CARD_BORDER,
                background: CARD_BG,
                boxShadow: SHADOW,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#111827",
                  marginBottom: 10,
                }}
              >
                Backlink Context
              </div>

              {!authReady || websitesLoading || contextState === "loading" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 16,
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  Loading your Strategy context…
                </div>
              ) : null}

              {contextState === "error" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    padding: 16,
                    color: "#991b1b",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {contextError || "Failed to load backlink context."}
                </div>
              ) : null}

              {contextState === "missing" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #fde68a",
                    background: "#fffbeb",
                    padding: 16,
                    color: "#92400e",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#111827" }}>Strategy context not ready</div>
                  <div style={{ marginTop: 6 }}>
                    Backlink Authority needs your Strategy setup before it can generate a plan. Please complete your Strategy setup first.
                  </div>
                  <a
                    href="/seo/strategy"
                    className="btn btn-soft-primary"
                    style={{ marginTop: 12, display: "inline-flex" }}
                  >
                    Open Strategy
                  </a>
                </div>
              ) : null}

              {canShowContext ? (
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: "6px 16px 14px",
                  }}
                >
                  <SummaryRow label="Website" value={contextData.websiteLabel} />
                  <SummaryRow label="Industry" value={contextData.industry} />
                  <SummaryRow label="Geography" value={contextData.geography} />
                  <SummaryRow label="Geo Mode" value={titleCaseGeoMode(contextData.geoMode)} />
                  <SummaryRow label="Competitors" value={String(contextData.competitors.length)}>
                    {competitorPreview.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {competitorPreview.map((domain) => (
                          <SmallChip key={domain}>{domain}</SmallChip>
                        ))}
                      </div>
                    ) : null}
                  </SummaryRow>
                  <SummaryRow label="Keyword Pillars" value={String(contextData.pillarCount)}>
                    {pillarPreview.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {pillarPreview.map((name) => (
                          <SmallChip key={name}>{name}</SmallChip>
                        ))}
                      </div>
                    ) : null}
                  </SummaryRow>
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 22,
                borderRadius: 18,
                border: CARD_BORDER,
                background: CARD_BG,
                boxShadow: SHADOW,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#111827",
                  marginBottom: 10,
                }}
              >
                Your Current Backlink Profile
              </div>

              {contextState === "missing" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #fde68a",
                    background: "#fffbeb",
                    padding: 16,
                    color: "#92400e",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  Complete your Strategy setup first to unlock your backlink baseline.
                </div>
              ) : null}

              {(selfProfileState === "loading" || selfProfileState === "running") && contextState === "ready" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 16,
                    color: "#6b7280",
                    fontSize: 14,
                  }}
                >
                  {selfProfileState === "running"
                    ? "Analyzing your backlink profile…"
                    : "Loading your saved backlink baseline…"}
                </div>
              ) : null}

              {selfProfileState === "error" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    padding: 16,
                    color: "#991b1b",
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}
                >
                  {selfProfileError || "We could not analyze your backlink profile right now. Please try again."}
                </div>
              ) : null}

              {selfProfileState === "empty" && contextState === "ready" ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 16,
                  }}
                >
                  <div style={{ color: "#374151", fontSize: 14, lineHeight: 1.7 }}>
                    Analyze your current backlink profile to establish your authority baseline.
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAnalyzeSelfBacklinks}
                    style={{ marginTop: 14 }}
                  >
                    Analyze My Backlinks
                  </button>
                </div>
              ) : null}

              {selfProfileState === "ready" && selfProfileData ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <MetricBox label="Domain Analyzed" value={selfProfileData.normalizedDomain || "—"} />
                    <MetricBox
                      label="Referring Domains"
                      value={
                        selfProfileData.referringDomains == null
                          ? "—"
                          : String(selfProfileData.referringDomains)
                      }
                    />
                    <MetricBox
                      label="Total Backlinks"
                      value={
                        selfProfileData.totalBacklinks == null
                          ? "—"
                          : String(selfProfileData.totalBacklinks)
                      }
                    />
                    <MetricBox
                      label="Last Analyzed"
                      value={formatTimestamp(selfProfileData.lastAnalyzedAt || selfProfileData.updatedAt)}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 16,
                      borderTop: "1px solid #eef2ff",
                      paddingTop: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#111827",
                        marginBottom: 8,
                      }}
                    >
                      Authority Distribution Summary
                    </div>

                    {showAuthorityBuckets ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(selfProfileData.authorityBuckets).map(([label, count]) => (
                          <SmallChip key={label}>
                            {label}: {String(count)}
                          </SmallChip>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
                        Authority mix will be expanded in the next stages.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-soft-primary"
                    onClick={handleAnalyzeSelfBacklinks}
                    style={{ marginTop: 16 }}
                  >
                    Refresh Backlink Analysis
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
