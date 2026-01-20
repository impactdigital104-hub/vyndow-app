"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../VyndowShell";
import { auth, db } from "../firebaseClient";

import { GEO_RUNS_COLLECTION, GEO_RUN_PAGES_SUBCOLLECTION } from "./geoModel";

export default function GeoPage() {
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

  // URL input
  const [urlListRaw, setUrlListRaw] = useState("");
  // Optional: AI questions (Phase 5C)
  // One question per line. Max 5 questions.
  const [aiQuestionsRaw, setAiQuestionsRaw] = useState("");

  // Run creation state
  const [creatingRun, setCreatingRun] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdRun, setCreatedRun] = useState(null);

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
  // Phase 5C: if AI questions are enabled (single URL), enforce max 5 questions
  (!aiQuestionsEnabled || !aiParsed.tooMany);


  // -----------------------------
  // Usage pill text
  // -----------------------------
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

    return `${pagesPerMonth} pages / month · ${planLabel}`;
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

      if (!resp.ok || !data?.ok) {
        // Quota exceeded payload
        if (data?.error === "QUOTA_EXCEEDED") {
          const d = data?.details || {};
          throw new Error(
            `Quota exceeded. Used ${d.used}/${d.limit} pages. Requested ${d.requested}. Extra remaining: ${d.extraRemaining ?? 0}.`
          );
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

        throw new Error(data?.error || "Failed to create GEO run.");
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
          </div>
        </div>

        <header>
          <h1 style={{ marginBottom: 6 }}>Vyndow GEO — AI Readiness Audit</h1>
          <p style={{ marginTop: 0, opacity: 0.9 }}>
            Paste one or more URLs below. Phase 2.2 now creates runs and reserves credits server-side.
          </p>
        </header>

        <section className="inputs-section">
          <h2 style={{ marginTop: 0 }}>Step 1: Enter URLs</h2>

          <div className="inputs-grid">
            <div className="inputs-card">
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

              {createdRun ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "#f0f9ff",
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Run created ✅</div>
                  <div>
                    <b>Run ID:</b> {createdRun.runId}
                  </div>
                  <div>
                    <b>Pages reserved:</b> {createdRun.pagesReserved}
                  </div>
                  <div>
                    <b>Month:</b> {createdRun.monthKey}
                  </div>
                  <div>
                    <b>Usage after:</b> {createdRun.usedAfter}/{createdRun.baseLimit} (extra remaining:{" "}
                    {createdRun.extraRemaining})
                  </div>
                  <div style={{ opacity: 0.7, marginTop: 6 }}>
                    Next Phase 2.3 will show Runs List and Run Detail pages.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="output-card">
              <h3 style={{ marginTop: 0 }}>Preview</h3>
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

              <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #eee" }} />

              <h3 style={{ marginTop: 0 }}>Firestore Model (Frozen)</h3>
              <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
                <div>
                  <b>Runs:</b> {GEO_RUNS_COLLECTION}/{"{runId}"}
                </div>
                <div>
                  <b>Pages:</b> {GEO_RUNS_COLLECTION}/{"{runId}"}/{GEO_RUN_PAGES_SUBCOLLECTION}/{"{pageId}"}
                </div>

                {ensureInfo?.ownerUid && ensureInfo?.websiteId ? (
                  <div style={{ marginTop: 10 }}>
                    <b>GEO module ensured at:</b>
                    <div style={{ wordBreak: "break-word" }}>
                      users/{ensureInfo.ownerUid}/websites/{ensureInfo.websiteId}/modules/geo
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>
    </VyndowShell>
  );
}
