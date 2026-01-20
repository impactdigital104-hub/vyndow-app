"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";
import { GeoCard, GeoPill } from "../../components/GeoUI";


export default function GeoRunsListPage() {
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Websites
  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  // GEO module summary (from ensure)
  const [geoModule, setGeoModule] = useState(null);
  const [geoModuleLoading, setGeoModuleLoading] = useState(false);
  const [geoModuleError, setGeoModuleError] = useState("");

  // Runs list
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [runs, setRuns] = useState([]);

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

        let saved = "";
        try {
          saved = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch {}

        const exists = saved && rows.some((r) => r.id === saved);
        if (exists) setSelectedWebsite(saved);
        else if (rows.length) {
          setSelectedWebsite(rows[0].id);
          try { localStorage.setItem("vyndow_selectedWebsiteId", rows[0].id); } catch {}
        } else setSelectedWebsite("");
      } catch (e) {
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
    try { localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsite); } catch {}
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

  // Load runs list
  useEffect(() => {
    async function loadRuns() {
      if (!uid || !selectedWebsite) return;

      try {
        setRunsLoading(true);
        setRunsError("");
        setRuns([]);

        const token = await auth.currentUser.getIdToken();
        const resp = await fetch("/api/geo/runs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ websiteId: selectedWebsite, limit: 25 }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) throw new Error(data?.error || "Failed to load runs");

        setRuns(Array.isArray(data.runs) ? data.runs : []);
      } catch (e) {
        setRuns([]);
        setRunsError(e?.message || "Unknown error loading runs.");
      } finally {
        setRunsLoading(false);
      }
    }

    loadRuns();
  }, [uid, selectedWebsite]);

  const rows = useMemo(() => runs, [runs]);
    function formatRunDate(value) {
    if (!value) return "—";

    // Firestore Timestamp (client)
    if (typeof value?.toDate === "function") {
      try { return value.toDate().toLocaleString(); } catch {}
    }

    // Firestore Timestamp-like object { seconds, nanoseconds }
    if (typeof value?.seconds === "number") {
      try { return new Date(value.seconds * 1000).toLocaleString(); } catch {}
    }

    // Milliseconds number
    if (typeof value === "number") {
      try { return new Date(value).toLocaleString(); } catch {}
    }

    // ISO string
    if (typeof value === "string") {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) {
        try { return new Date(t).toLocaleString(); } catch {}
      }
      return value;
    }

    return "—";
  }


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

        <div className="geo-header">
          <div>
            <h1 className="geo-title">GEO Runs</h1>
            <p className="geo-subtitle">
              Your recent audit runs for the selected website. Open a run to view scores, issues, and AI answer readiness.
            </p>
          </div>

          <div className="geo-actions">
            <button className="btn btn-primary" onClick={() => router.push("/geo")}>
              + New Run
            </button>
          </div>
        </div>


        <div className="geo-section">
          <GeoCard title="Recent runs">
            {runsLoading ? (
              <div style={{ padding: 14 }}>Loading runs…</div>
            ) : runsError ? (
              <div style={{ padding: 14, color: "#b91c1c" }}>{runsError}</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 14 }}>
                <div className="geo-muted" style={{ fontSize: 14 }}>
                  No audit runs yet for this website.
                </div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={() => router.push("/geo")}>
                    + Create your first run
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table className="geo-table">
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Date</th>
                      <th>Run ID</th>
                      <th style={{ width: 90 }}>Pages</th>
                      <th style={{ width: 140 }}>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => router.push(`/geo/runs/${r.id}?websiteId=${selectedWebsite}`)}
                        title="Open run details"
                      >
                       <td style={{ whiteSpace: "nowrap" }}>
  {formatRunDate(r.createdAt || r.created || r.created_on || r.createdAtMs)}
</td>


                        <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          {r.id}
                        </td>

                        <td>{r.pagesCount}</td>

                        <td>
                          <GeoPill
                            variant={
                              r.status === "analyzed"
                                ? "analyzed"
                                : r.status === "error"
                                ? "error"
                                : "processing"
                            }
                          >
                           {r.status === "queued"
  ? "Queued — Click to Process"
  : r.status === "processing" || r.status === "analyzed"
  ? "View Results"
  : (r.status || "processing")}
                          </GeoPill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GeoCard>
        </div>
      </main>
    </VyndowShell>
  );
}
