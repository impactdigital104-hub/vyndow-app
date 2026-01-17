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

  // Phase 2.1 UI: URL input
  const [urlListRaw, setUrlListRaw] = useState("");

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
  // Load websites (same as SEO page uses)
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

        // Prefer saved websiteId (shared convention used across modules)
        let saved = "";
        try {
          saved = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {
          // ignore
        }

        const exists = saved && rows.some((r) => r.id === saved);

        if (exists) {
          setSelectedWebsite(saved);
        } else if (rows.length) {
          setSelectedWebsite(rows[0].id);
          try {
            localStorage.setItem("vyndow_selectedWebsiteId", rows[0].id);
          } catch (e) {
            // ignore
          }
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

  // Persist selected website (so other pages can use same context)
  useEffect(() => {
    if (!selectedWebsite) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsite);
    } catch (e) {
      // ignore
    }
  }, [selectedWebsite]);

  // -----------------------------
  // Ensure GEO module doc exists + load its values (plan/pagesPerMonth/etc)
  // -----------------------------
  useEffect(() => {
    async function ensureGeoModule() {
      if (!uid) return;
      if (!selectedWebsite) return;

      try {
        setGeoModuleLoading(true);
        setGeoModuleError("");

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
  // URL parsing + validation (Phase 2.1 only)
  // -----------------------------
  const parsed = useMemo(() => {
    const lines = (urlListRaw || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    // De-dupe while preserving order
    const seen = new Set();
    const unique = [];
    for (const u of lines) {
      const key = u;
      if (!seen.has(key)) {
        seen.add(key);
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

  // -----------------------------
  // Usage pill text (Phase 2.1 = plan display only)
  // -----------------------------
  function buildGeoUsageSummary() {
    if (geoModuleLoading) return "Loading usage…";
    if (geoModuleError) return "Usage unavailable";
    if (!geoModule) return "Free Plan";

    const plan = (geoModule.plan || "free").toString();
    const pagesPerMonth = Number(geoModule.pagesPerMonth ?? 0);

    // Phase 2.1: we show plan + pagesPerMonth only (no counters yet)
    const planLabel =
      plan === "enterprise"
        ? "Enterprise Plan"
        : plan === "small_business"
        ? "Small Business Plan"
        : "Free Plan";

    return `${pagesPerMonth} pages / month · ${planLabel}`;
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
            Paste one or more URLs below. In Phase 2.1, we’re building the UI and data model.
            Phase 2.2 will create runs and reserve credits server-side.
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
                className="btn-disabled"
                disabled
                title="Phase 2.2 will connect this button to POST /api/geo/run"
                style={{ marginTop: 8 }}
              >
                Create Audit Run (Phase 2.2)
              </button>

              <div style={{ fontSize: 12, marginTop: 10, opacity: 0.7 }}>
                Phase 2.1 note: No Firestore writes happen from this button yet.
              </div>
            </div>

            <div className="output-card">
              <h3 style={{ marginTop: 0 }}>Preview</h3>

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
