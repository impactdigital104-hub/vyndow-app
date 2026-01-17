"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../../VyndowShell";
import { auth, db } from "../../../firebaseClient";

export default function GeoRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const runId = params?.runId;

  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Websites selector (same pattern as /seo and /geo)
  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  // GEO module pill (from ensure)
  const [geoModule, setGeoModule] = useState(null);
  const [geoModuleLoading, setGeoModuleLoading] = useState(false);
  const [geoModuleError, setGeoModuleError] = useState("");

  // Run detail
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);

  // Auth gate
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
      setAuthReady(true);
    });

    return () => (typeof unsub === "function" ? unsub() : undefined);
  }, [router]);

  // Load websites
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

        // Prefer websiteId from query param (deep-link support)
        const qpWebsiteId = searchParams.get("websiteId") || "";
        const qpExists = qpWebsiteId && rows.some((r) => r.id === qpWebsiteId);

        let saved = "";
        try {
          saved = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch {}

        const savedExists = saved && rows.some((r) => r.id === saved);

        if (qpExists) {
          setSelectedWebsite(qpWebsiteId);
        } else if (savedExists) {
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
        setWebsites([]);
        setWebsitesError(e?.message || "Unknown error while loading websites.");
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid, searchParams]);

  useEffect(() => {
    if (!selectedWebsite) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsite);
    } catch {}
  }, [selectedWebsite]);

  // Ensure GEO module for pill
  useEffect(() => {
    async function ensureGeo() {
      if (!uid || !selectedWebsite) return;

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
        if (!resp.ok || !data?.ok) throw new Error(data?.error || "Failed to ensure GEO module");

        setGeoModule(data?.module || null);
      } catch (e) {
        setGeoModule(null);
        setGeoModuleError(e?.message || "Usage unavailable");
      } finally {
        setGeoModuleLoading(false);
      }
    }

    ensureGeo();
  }, [uid, selectedWebsite]);

  function buildGeoUsageSummary() {
    if (geoModuleLoading) return "Loading usage…";
    if (geoModuleError) return "Usage unavailable";
    if (!geoModule) return "Free Plan";

    const plan = (geoModule.plan || "free").toString();
    const pagesPerMonth = Number(geoModule.pagesPerMonth ?? 0);

    const planLabel =
      plan === "enterprise" ? "Enterprise Plan"
      : plan === "small_business" ? "Small Business Plan"
      : "Free Plan";

    return `${pagesPerMonth} pages / month · ${planLabel}`;
  }

  // Load run detail from API
  useEffect(() => {
    async function loadRunDetail() {
      if (!uid || !runId || !selectedWebsite) return;

      try {
        setLoading(true);
        setError("");
        setRun(null);
        setPages([]);

        const token = await auth.currentUser.getIdToken();
        const resp = await fetch("/api/geo/runDetail", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ websiteId: selectedWebsite, runId }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) throw new Error(data?.error || "Failed to load run detail");

        setRun(data.run || null);
        setPages(Array.isArray(data.pages) ? data.pages : []);
      } catch (e) {
        setRun(null);
        setPages([]);
        setError(e?.message || "Unknown error loading run detail.");
      } finally {
        setLoading(false);
      }
    }

    loadRunDetail();
  }, [uid, runId, selectedWebsite]);

  if (!authReady) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>Checking login…</div>;
  }

  return (
    <VyndowShell activeModule="geo">
      <main className="page">
        {/* Top bar same as /seo */}
        <div className="project-bar">
          <div className="project-bar-left">
            <label htmlFor="websiteSelect" className="project-bar-label" style={{ color: "#6D28D9" }}>
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

        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>GEO Run Detail</h1>
            <p style={{ marginTop: 0, opacity: 0.9 }}>
              Run ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{runId}</span>
            </p>
          </div>

          <button className="btn btn-primary" onClick={() => router.push("/geo/runs")}>
            ← Back to Runs
          </button>
        </header>

        <section className="inputs-section">
          <div className="output-card" style={{ width: "100%" }}>
            {loading ? (
              <div style={{ padding: 14 }}>Loading run…</div>
            ) : error ? (
              <div style={{ padding: 14, color: "#b91c1c" }}>{error}</div>
            ) : !run ? (
              <div style={{ padding: 14, opacity: 0.75 }}>Run not found.</div>
            ) : (
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12, opacity: 0.9 }}>
                  <div><b>Status:</b> {run.status || "—"}</div>
                  <div><b>Pages:</b> {run.pagesCount ?? "—"}</div>
                  <div><b>Month:</b> {run.month || "—"}</div>
                  <div>
                    <b>Created:</b>{" "}
                    {run.createdAt?.toDate ? run.createdAt.toDate().toLocaleString() : "—"}
                  </div>
                </div>

                <hr style={{ margin: "12px 0", border: 0, borderTop: "1px solid #eee" }} />

                <h3 style={{ marginTop: 0 }}>Pages in this Run</h3>

                {pages.length === 0 ? (
                  <div style={{ opacity: 0.75 }}>No pages found for this run.</div>
                ) : (
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                          <th style={{ padding: "10px 8px" }}>URL</th>
                          <th style={{ padding: "10px 8px", width: 140 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pages.map((p) => (
                          <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 8px", wordBreak: "break-word" }}>{p.url}</td>
                            <td style={{ padding: "10px 8px" }}>{p.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </VyndowShell>
  );
}
