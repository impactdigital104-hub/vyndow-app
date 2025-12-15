"use client";

// app/websites/page.js

import { useEffect, useState } from "react";
import VyndowShell from "../VyndowShell";
import AuthGate from "../components/AuthGate";
import { auth, db } from "../firebaseClient";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";


const cellStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  verticalAlign: "top",
};

const headerCellStyle = {
  ...cellStyle,
  fontWeight: 600,
  background: "#f9fafb",
  whiteSpace: "nowrap",
};

// TODO [Phase 7]:
// - Protect this page behind authentication.
// - Load websites from backend instead of using sampleWebsites.
// - Allow creating, editing, and deleting websites from this screen.
// - Connect the "+ Add Website" button to a drawer / modal form that
//   posts to /api/websites and refreshes the list.
export default function WebsitesPage() {
  const [uid, setUid] = useState(null);

  const [websites, setWebsites] = useState([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [websitesError, setWebsitesError] = useState("");

  const [seoModule, setSeoModule] = useState(null);
  const [loadingSeoModule, setLoadingSeoModule] = useState(true);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 1) Track auth state (uid)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  // 2) Load SEO module plan/limits for this user
  useEffect(() => {
    if (!uid) return;

    async function loadSeoModule() {
      setLoadingSeoModule(true);
      try {
        const ref = doc(db, "users", uid, "modules", "seo");
        const snap = await getDoc(ref);
        setSeoModule(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.error("Failed to load SEO module:", e);
        setSeoModule(null);
      } finally {
        setLoadingSeoModule(false);
      }
    }

    loadSeoModule();
  }, [uid]);

  // 3) Load websites list for this user
  useEffect(() => {
    if (!uid) return;

    async function loadWebsites() {
      setLoadingWebsites(true);
      setWebsitesError("");
      try {
        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setWebsites(rows);
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setWebsitesError(e?.message || "Failed to load websites.");
      } finally {
        setLoadingWebsites(false);
      }
    }

    loadWebsites();
  }, [uid]);

  // 4) Compute allowed websites for SEO (Free plan default)
  const websitesIncluded = seoModule?.websitesIncluded ?? 1;
  const extraWebsitesPurchased = seoModule?.extraWebsitesPurchased ?? 0;
  const allowedWebsites = websitesIncluded + extraWebsitesPurchased;
  const currentWebsiteCount = websites.length;
  const canAddWebsite =
    !loadingSeoModule && currentWebsiteCount < allowedWebsites;

  async function handleAddWebsite(e) {
    e.preventDefault();
    setMsg("");

    if (!uid) return;

    const cleanName = name.trim();
    const cleanDomain = domain.trim().toLowerCase();

    if (!cleanName || !cleanDomain) {
      setMsg("Please enter both Website Name and Domain.");
      return;
    }

    if (!canAddWebsite) {
      setMsg(
        `Website limit reached for your plan. Allowed: ${allowedWebsites}.`
      );
      return;
    }

    setSaving(true);
    try {
      const colRef = collection(db, "users", uid, "websites");
      await addDoc(colRef, {
        name: cleanName,
        domain: cleanDomain,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        profile: {
          // Website-level defaults (can be edited later in a Profile screen)
          brandDescription: "",
          targetAudience: "",
          toneOfVoice: [],
          readingLevel: "",
          geoTarget: "",
          industry: "",
        },
      });

      setName("");
      setDomain("");
      setMsg("Website added.");

      // Refresh list
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWebsites(rows);
    } catch (e) {
      console.error("Add website failed:", e);
      setMsg(e?.message || "Add website failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <VyndowShell activeModule="websites">
        <main className="page">
          <header style={{ marginBottom: "20px" }}>
            <span className="badge">Phase 8 — Website Manager (Firestore)</span>
            <h1>Websites &amp; Clients</h1>
            <p className="sub">
              Add and manage websites. Your plan controls how many websites you
              can create.
            </p>
          </header>

          <section style={{ marginBottom: 18 }}>
            <h2>SEO Plan Limits (for this account)</h2>

            {loadingSeoModule ? (
              <p style={{ color: "#6b7280" }}>Loading plan…</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <div>
                  <b>Plan:</b> {seoModule?.plan || "free"}
                </div>
                <div>
                  <b>Websites allowed:</b> {allowedWebsites}{" "}
                  <span style={{ color: "#6b7280" }}>
                    ({websitesIncluded} included + {extraWebsitesPurchased} add-on)
                  </span>
                </div>
                <div>
                  <b>Current websites:</b> {currentWebsiteCount}
                </div>
              </div>
            )}
          </section>

          <section style={{ marginBottom: 18 }}>
            <h2>Add Website</h2>

            {!canAddWebsite && !loadingSeoModule ? (
              <p style={{ color: "#b91c1c" }}>
                Website limit reached. You can’t add more websites on this plan.
              </p>
            ) : null}

            <form
              onSubmit={handleAddWebsite}
              style={{
                display: "grid",
                gap: 10,
                maxWidth: 520,
                padding: 14,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Website Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anatta"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Domain</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. anatta.in"
                />
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="submit"
                  disabled={saving || loadingSeoModule || !canAddWebsite}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Adding…" : "+ Add Website"}
                </button>

                {msg ? (
                  <span style={{ color: msg === "Website added." ? "#065f46" : "#b91c1c" }}>
                    {msg}
                  </span>
                ) : null}
              </div>
            </form>
          </section>

          <section>
            <h2>Current Websites</h2>

            {websitesError ? (
              <p style={{ color: "#b91c1c" }}>{websitesError}</p>
            ) : null}

            {loadingWebsites ? (
              <p style={{ color: "#6b7280" }}>Loading websites…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Website / Brand</th>
                      <th style={headerCellStyle}>Domain</th>
                      <th style={headerCellStyle}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((site) => (
                      <tr key={site.id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 600 }}>{site.name}</div>
                        </td>
                        <td style={cellStyle}>
                          <code>{site.domain}</code>
                        </td>
                        <td style={cellStyle}>
                          {site.createdAt?.toDate
                            ? site.createdAt.toDate().toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {!websites.length ? (
                      <tr>
                        <td style={cellStyle} colSpan={3}>
                          No websites yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </VyndowShell>
    </AuthGate>
  );
}
