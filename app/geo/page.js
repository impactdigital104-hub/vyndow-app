"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, doc, getDoc } from "firebase/firestore";


import VyndowShell from "../VyndowShell";
import { auth, db } from "../firebaseClient";

import { GEO_RUNS_COLLECTION, GEO_RUN_PAGES_SUBCOLLECTION } from "./geoModel";
import { GeoCard } from "../components/GeoUI";


export default function GeoPage() {
  function getMonthKeyClient() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

  const router = useRouter();

  // Auth
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Websites
  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  // GEO module (from /api/geo/ensure response)
  const [geoModule, setGeoModule] = useState(null);
  const [geoModuleLoading, setGeoModuleLoading] = useState(false);
  const [geoModuleError, setGeoModuleError] = useState("");
  const [ensureInfo, setEnsureInfo] = useState(null);
  function getEffectiveContext(websiteId) {
  // ensureInfo is set by /api/geo/ensure and may point to the owner context
  const effectiveUid = ensureInfo?.ownerUid || uid;
  const effectiveWebsiteId = ensureInfo?.websiteId || websiteId;
  return { effectiveUid, effectiveWebsiteId };
}


  // URL input
  const [urlListRaw, setUrlListRaw] = useState("");
  // Optional: AI questions (Phase 5C)
  // One question per line. Max 5 questions.
  const [aiQuestionsRaw, setAiQuestionsRaw] = useState("");

  // Run creation state
  const [creatingRun, setCreatingRun] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdRun, setCreatedRun] = useState(null);
    // Phase 7: quota UX (no feature gating)
  const [geoQuotaNotice, setGeoQuotaNotice] = useState(null); // { message, details }
  const [geoQuotaHardStop, setGeoQuotaHardStop] = useState(false); // true if remaining === 0
  const [geoUsedThisMonth, setGeoUsedThisMonth] = useState(0);
const [geoUsageLoading, setGeoUsageLoading] = useState(false);



  // -----------------------------
  // Auth gate (same as SEO)
  // -----------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
      setAuthReady(true);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  // -----------------------------
  // Load websites
  // -----------------------------
  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      try {
        setWebsitesLoading(true);
        setWebsitesError("");

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setWebsites(rows);

        let saved = "";
        try {
          saved = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch {}

        const exists = saved && rows.some((r) => r.id === saved);

        if (exists) {
          setSelectedWebsite(saved);
        } else if (rows.length) {
          setSelectedWebsite(rows[0].id);
          try {
            localStorage.setItem("vyndow_selectedWebsiteId", rows[0].id);
          } catch {}
        } else {
          setSelectedWebsite("");
        }
      } catch (e) {
        console.error("GEO loadWebsites error:", e);
        setWebsites([]);
        setWebsitesError(e?.message || "Unknown error while loading websites.");
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid]);

  useEffect(() => {
    if (!selectedWebsite) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsite);
    } catch {}
  }, [selectedWebsite]);
    // Clear any prior quota notice when switching website
useEffect(() => {
  setGeoQuotaNotice(null);
  setGeoQuotaHardStop(false);

  // Load usage (used pages this month) so the pill always shows X/Y
  (async () => {
    try {
      setGeoUsageLoading(true);
      const used = await refreshGeoUsage({ db, uid, selectedWebsite, getEffectiveContext });
      setGeoUsedThisMonth(used);
    } catch (e) {
      console.error("Failed to load GEO usage:", e);
      setGeoUsedThisMonth(0);
    } finally {
      setGeoUsageLoading(false);
    }
  })();
}, [selectedWebsite, db, uid]);


  // Clear quota notice when user edits URLs (so they can try again with fewer URLs)
  useEffect(() => {
    setGeoQuotaNotice(null);
    setGeoQuotaHardStop(false);
  }, [urlListRaw]);


  // -----------------------------
  // Ensure GEO module doc exists + load values
  // -----------------------------
  useEffect(() => {
    async function ensureGeoModule() {
      if (!uid) return;
      if (!selectedWebsite) return;

      try {
        setGeoModuleLoading(true);
        setGeoModuleError("");
        setCreatedRun(null);
        setCreateError("");

        const token = await auth.currentUser.getIdToken();

        const resp = await fetch("/api/geo/ensure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ websiteId: selectedWebsite }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to ensure GEO module");
        }

        setGeoModule(data?.module || null);
        setEnsureInfo({
          ownerUid: data.ownerUid,
          websiteId: data.websiteId,
        });
      } catch (e) {
        console.error("GEO ensure error:", e);
        setGeoModule(null);
        setEnsureInfo(null);
        setGeoModuleError(e?.message || "Unknown error while ensuring GEO module.");
      } finally {
        setGeoModuleLoading(false);
      }
    }

    ensureGeoModule();
  }, [uid, selectedWebsite]);

  // -----------------------------
  // URL parsing + validation
  // -----------------------------
  const parsed = useMemo(() => {
    const lines = (urlListRaw || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const seen = new Set();
    const unique = [];
    for (const u of lines) {
      if (!seen.has(u)) {
        seen.add(u);
        unique.push(u);
      }
    }

    const valid = [];
    const invalid = [];

    for (const u of unique) {
      try {
        const urlObj = new URL(u);
        const protocolOk = urlObj.protocol === "http:" || urlObj.protocol === "https:";
        if (!protocolOk) invalid.push(u);
        else valid.push(u);
      } catch {
        invalid.push(u);
      }
    }

    return {
      totalLines: lines.length,
      uniqueCount: unique.length,
      valid,
      invalid,
      creditsToConsume: valid.length,
    };
  }, [urlListRaw]);
    // AI Questions parsing (max 5)
  const aiParsed = useMemo(() => {
    const lines = (aiQuestionsRaw || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    // de-dupe while preserving order
    const seen = new Set();
    const unique = [];
    for (const q of lines) {
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(q);
      }
    }

    return {
      questions: unique,
      count: unique.length,
      tooMany: unique.length > 5,
    };
  }, [aiQuestionsRaw]);

  const aiQuestionsEnabled = parsed.valid.length === 1;


  const canCreateRun =
  !creatingRun &&
  !!selectedWebsite &&
  !geoModuleLoading &&
  !geoModuleError &&
  parsed.creditsToConsume > 0 &&
  parsed.invalid.length === 0 &&
       (!aiQuestionsEnabled || !aiParsed.tooMany) &&
  !geoQuotaHardStop;



  // -----------------------------
  // Usage pill text
  // -----------------------------
  async function refreshGeoUsage({ db, uid, selectedWebsite, getEffectiveContext }) {
  if (!db || !uid || !selectedWebsite) return;

  const monthKey = getMonthKeyClient();
  const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsite);

  const usageRef = doc(
    db,
    "users",
    effectiveUid,
    "websites",
    effectiveWebsiteId,
    "geoUsage",
    monthKey
  );

  const snap = await getDoc(usageRef);
  const used = snap.exists() ? (snap.data()?.usedPagesThisMonth ?? 0) : 0;

  return Number(used) || 0;
}

  function buildGeoUsageSummary() {
    if (geoModuleLoading) return "Loading usage…";
    if (geoModuleError) return "Usage unavailable";
    if (!geoModule) return "Free Plan";

    const plan = (geoModule.plan || "free").toString();
    const pagesPerMonth = Number(geoModule.pagesPerMonth ?? 0);

    const planLabel =
      plan === "enterprise"
        ? "Enterprise Plan"
        : plan === "small_business"
        ? "Small Business Plan"
        : "Free Plan";
// If quota notice is showing, reflect usage instantly in the pill
if (geoQuotaNotice?.details?.used != null && geoQuotaNotice?.details?.limit != null) {
  const used = geoQuotaNotice.details.used;
  const limit = geoQuotaNotice.details.limit;
  const extra = typeof geoQuotaNotice.details.extraRemaining === "number" ? geoQuotaNotice.details.extraRemaining : 0;
  return `${used}/${limit} used · Extra remaining: ${extra} · ${planLabel}`;
}
        // If a run was just created, show fresh usage instantly in the pill
    if (createdRun?.usedAfter != null && createdRun?.baseLimit != null) {
      const extra = typeof createdRun.extraRemaining === "number" ? createdRun.extraRemaining : 0;
      return `${createdRun.usedAfter}/${createdRun.baseLimit} used · Extra remaining: ${extra} · ${planLabel}`;
    }

    if (geoUsageLoading) return `Loading… · ${planLabel}`;

const used = Number(geoUsedThisMonth ?? 0);
const total = Number(pagesPerMonth ?? 0);

return `${used} / ${total} used · ${planLabel}`;


  }

  // -----------------------------
  // Create run (Phase 2.2)
  // -----------------------------
  async function onCreateRun() {
    try {
      setCreatingRun(true);
      setCreateError("");
      setCreatedRun(null);

      const token = await auth.currentUser.getIdToken();

      const resp = await fetch("/api/geo/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          websiteId: selectedWebsite,
          urls: parsed.valid,
          // Phase 5C: allow questions only when exactly one URL is being audited
          aiQuestions:
            aiQuestionsEnabled && !aiParsed.tooMany && aiParsed.questions.length
              ? aiParsed.questions.slice(0, 5)
              : [],
        }),
      });

 const data = await resp.json().catch(() => ({}));

// Phase 7: standardized quota payload (show notice + buttons, NOT red error)
if (data?.code === "GEO_LIMIT_REACHED" || data?.error === "QUOTA_EXCEEDED") {
  const d = data?.details || {};
  const msg = data?.message || "You’ve reached your monthly GEO URL limit.";

  // Clear red error if any
  setCreateError("");

  // Show calm notice
  setGeoQuotaNotice({ message: msg, details: d });

  // Hard stop only if remaining is 0 (fully exhausted)
  const remaining = Number(d.remaining ?? 0);
  setGeoQuotaHardStop(remaining <= 0);

  // IMPORTANT: stop here; do not proceed
  return;
}



        // Domain mismatch payload
        if (data?.error === "URL_DOMAIN_MISMATCH") {
          const domain = data?.websiteDomain || "(unknown domain)";
          const bad = (data?.invalidForWebsite || []).slice(0, 3).join(" | ");
          throw new Error(
            `Some URLs don’t belong to the selected website domain (${domain}). Example: ${bad}`
          );
        }

        // Invalid URLs payload
        if (data?.error === "INVALID_URLS") {
          const bad = (data?.invalid || []).slice(0, 3).join(" | ");
          throw new Error(`Invalid URLs detected. Example: ${bad}`);
        }

 

      setCreatedRun({
        runId: data.runId,
        pagesReserved: data.pagesReserved,
        monthKey: data.monthKey,
        usedAfter: data.usedAfter,
        baseLimit: data.baseLimit,
        extraRemaining: data.extraRemaining,
        overflowUsed: data.overflowUsed,
      });

      // OPTIONAL: clear input after successful run creation
      setUrlListRaw("");
    } catch (e) {
      console.error("Create GEO run failed:", e);
      setCreateError(e?.message || "Unknown error creating GEO run.");
    } finally {
      setCreatingRun(false);
    }
  }

  // -----------------------------
  // Render
  // -----------------------------
  if (!authReady) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Checking login…</div>;
  }

  return (
    <VyndowShell activeModule="geo">
      <main className="page">
        {/* Top bar: Website / Brand selector + usage (same layout as /seo) */}
        <div className="project-bar">
          <div className="project-bar-left">
            <label
              htmlFor="websiteSelect"
              className="project-bar-label"
              style={{ color: "#6D28D9" }}
            >
              Website / Brand
            </label>

            <select
              id="websiteSelect"
              className="project-bar-select"
              value={selectedWebsite}
              onChange={(e) => setSelectedWebsite(e.target.value)}
            >
              {websitesLoading ? (
                <option value="">Loading websites...</option>
              ) : websitesError ? (
                <option value="">Error loading websites: {websitesError}</option>
              ) : websites.length === 0 ? (
                <option value="">No websites yet</option>
              ) : (
                websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.domain})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="project-bar-right">
            <div className="project-bar-usage-label">GEO Usage</div>
            <div className="project-bar-usage-pill">{buildGeoUsageSummary()}</div>
                            {geoQuotaHardStop ? (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => router.push("/pricing")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Upgrade Plan
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/pricing")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Buy More URLs
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/websites")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Add Website
                </button>
              </div>
            ) : null}

          </div>
        </div>

        <div className="geo-page">
          <div className="geo-header">
            <div>
              <h1 className="geo-title">Vyndow GEO — AI Readiness Audit</h1>
              <p className="geo-subtitle">
                Audit one or more URLs for AI answer readiness, credibility signals, and machine-readable structure.
                Runs reserve credits server-side and remain available in your Runs list.
              </p>
            </div>


          </div>

          <div className="geo-grid-2">
            <GeoCard title="Step 1 — Enter URLs">

              <div className="field-group">
                <label htmlFor="geoUrls">URLs (one per line)</label>
                <textarea
                  id="geoUrls"
                  rows={10}
                  placeholder={`https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/page-3`}
                  value={urlListRaw}
                  onChange={(e) => setUrlListRaw(e.target.value)}
                />

                <div style={{ fontSize: 13, marginTop: 10, opacity: 0.85 }}>
                  This will consume: <b>{parsed.creditsToConsume}</b> pages
                  {parsed.invalid.length > 0 ? (
                    <span style={{ marginLeft: 10 }}>
                      · Invalid: <b>{parsed.invalid.length}</b>
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={onCreateRun}
                disabled={!canCreateRun}
                className={canCreateRun ? "btn btn-primary" : "btn-disabled"}
                style={{ marginTop: 8 }}
                title={
                  !canCreateRun
                    ? parsed.invalid.length > 0
                      ? "Fix invalid URLs first."
                      : parsed.creditsToConsume === 0
                      ? "Paste at least one valid URL."
                      : "Loading module/website…"
                    : "Create a new GEO audit run"
                }
              >
                {creatingRun ? "Creating Audit Run…" : "Create Audit Run"}
              </button>

              {createError ? (
                <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
                  {createError}
                </div>
              ) : null}
              {geoQuotaNotice ? (
                <div
                  className="error-box"
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: 12,
                  }}
                >
                  <strong>Monthly limit reached (or this run exceeds remaining).</strong>
                  <br />
                  {geoQuotaNotice.message}
                  {geoQuotaNotice?.details ? (
                    <>
                      <br />
                      <span style={{ fontSize: "0.9rem" }}>
                        Used: <b>{geoQuotaNotice.details.used ?? 0}</b> /
                        <b> {geoQuotaNotice.details.limit ?? 0}</b> · Remaining:{" "}
                        <b>{geoQuotaNotice.details.remaining ?? 0}</b>
                      </span>
                    </>
                  ) : null}
                  <br />
<div style={{ fontSize: "0.85rem" }}>
  Tip: Upgrade your plan or buy more URL credits. You can also add another website.
</div>

<div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
  <button
    type="button"
    className="btn btn-primary"
    onClick={() => router.push("/pricing")}
  >
    Upgrade Plan
  </button>

  <button
    type="button"
   className="btn btn-outline-primary"
    onClick={() => router.push("/pricing")}
  >
    Buy More URLs
  </button>

  <button
    type="button"
   className="btn btn-outline-primary"
    onClick={() => router.push("/websites")}
  >
    Add Website
  </button>
</div>

                </div>
              ) : null}


              {createdRun ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 14,
                    borderRadius: 14,
                    background: "#ecfeff",
                    border: "1px solid #a5f3fc",
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>Run created ✅</div>
                    <div style={{ opacity: 0.75 }}>
                      {createdRun.pagesReserved} page(s) reserved
                    </div>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <b>Run ID:</b> {createdRun.runId}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <b>Usage after:</b> {createdRun.usedAfter}/{createdRun.baseLimit}
                    {typeof createdRun.extraRemaining === "number" ? (
                      <>
                        {" "}
                        · Extra remaining: <b>{createdRun.extraRemaining}</b>
                      </>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => router.push("/geo/runs")}
                    >
                      Go to Runs
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        // Keep the user on the page to create another run
                        setCreatedRun(null);
                      }}
                    >
                      Create another run
                    </button>
                  </div>
                </div>
              ) : null}

             </GeoCard>
            <GeoCard title="Preview & Validation">
                              {/* Phase 5C: Optional AI Questions (single-URL only) */}
              <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#faf5ff" }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: "#6D28D9" }}>
                  Optional: AI Questions (Max 5)
                </div>
                <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                  These questions are evaluated using only the content on the audited page.
                  {aiQuestionsEnabled ? null : (
                    <span> (Available when auditing exactly one URL.)</span>
                  )}
                </div>

                <textarea
                  rows={5}
                  placeholder={
                    aiQuestionsEnabled
                      ? "Example:\nWhat services do you offer?\nHow do pricing plans work?\nWhat is your refund policy?\nHow can I contact support?\nWhere are you located?"
                      : "Enter exactly one valid URL on the left to enable questions."
                  }
                  value={aiQuestionsRaw}
                  onChange={(e) => setAiQuestionsRaw(e.target.value)}
                  disabled={!aiQuestionsEnabled}
                  style={{ width: "100%" }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
                  <div style={{ opacity: 0.8 }}>{aiParsed.count} / 5 questions</div>
                  {aiParsed.tooMany ? (
                    <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                      Please reduce to 5 questions.
                    </div>
                  ) : null}
                </div>
              </div>


              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                <div>
                  <b>Total lines:</b> {parsed.totalLines}
                </div>
                <div>
                  <b>Unique URLs:</b> {parsed.uniqueCount}
                </div>
                <div>
                  <b>Valid URLs (pages to scan):</b> {parsed.valid.length}
                </div>
                <div>
                  <b>Invalid URLs:</b> {parsed.invalid.length}
                </div>

                {parsed.invalid.length > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <b>Invalid list:</b>
                    <ul style={{ marginTop: 6 }}>
                      {parsed.invalid.slice(0, 8).map((u) => (
                        <li key={u} style={{ wordBreak: "break-word" }}>
                          {u}
                        </li>
                      ))}
                      {parsed.invalid.length > 8 ? <li>…and more</li> : null}
                    </ul>
                  </div>
                ) : null}
              </div>


            </GeoCard>
          </div>
        </div>
      </main>
    </VyndowShell>
  );
}
