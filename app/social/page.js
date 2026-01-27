"use client";

import { useEffect, useState } from "react";
import VyndowShell from "../VyndowShell";
import AuthGate from "../components/AuthGate";
import { auth, db } from "../firebaseClient";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";

export default function SocialHomePage() {
  const [uid, setUid] = useState(null);

  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsite, setSelectedWebsite] = useState("");

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [brandProfile, setBrandProfile] = useState(null);

  // Auth → uid
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  // Load websites
  useEffect(() => {
    if (!uid) return;

    async function loadWebsites() {
      try {
        setWebsitesLoading(true);
        setWebsitesError("");

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setWebsites(rows);

        // restore selection
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
        console.error("Social loadWebsites error:", e);
        setWebsites([]);
        setWebsitesError(e?.message || "Failed to load websites.");
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid]);

  // Persist selection
  useEffect(() => {
    if (!selectedWebsite) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsite);
    } catch {}
  }, [selectedWebsite]);

  // Load Social Brand Profile doc for selected website
  useEffect(() => {
    if (!uid) return;
    if (!selectedWebsite) return;

    async function loadProfile() {
      try {
        setProfileLoading(true);
        setProfileError("");
        setBrandProfile(null);

        const ref = doc(db, "users", uid, "websites", selectedWebsite, "modules", "social");
        const snap = await getDoc(ref);
        setBrandProfile(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.error("Social loadProfile error:", e);
        setProfileError(e?.message || "Failed to load Brand Profile.");
        setBrandProfile(null);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [uid, selectedWebsite]);

  const phase1Completed = !!brandProfile?.phase1Completed;

  const workshopUrl = selectedWebsite
    ? `/social/workshop?websiteId=${encodeURIComponent(selectedWebsite)}`
    : "/social/workshop";

  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 980 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Vyndow Social — Phase 1</h1>
          <p style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
            Brand Intelligence Builder (agency-style workshop). We’ll save a Brand Profile as you go,
            so you can resume anytime.
          </p>

          <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Website context</div>

            {websitesLoading ? (
              <div style={{ color: "#374151" }}>Loading your websites…</div>
            ) : websitesError ? (
              <div style={{ color: "#b91c1c" }}>{websitesError}</div>
            ) : websites.length === 0 ? (
              <div style={{ color: "#374151" }}>
                No websites found. Please create one first in{" "}
                <a href="/websites">Websites &amp; Clients</a>.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ color: "#374151" }}>Selected website:</label>
                <select
                  value={selectedWebsite}
                  onChange={(e) => setSelectedWebsite(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    minWidth: 280,
                  }}
                >
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || w.domain || w.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Phase 1 status</div>

            {profileLoading ? (
              <div style={{ color: "#374151" }}>Checking your saved Brand Profile…</div>
            ) : profileError ? (
              <div style={{ color: "#b91c1c" }}>{profileError}</div>
            ) : !selectedWebsite ? (
              <div style={{ color: "#374151" }}>
                Select a website to start the workshop.
              </div>
            ) : phase1Completed ? (
              <>
                <div style={{ color: "#065f46", marginBottom: 10 }}>
                  ✅ Phase 1 Complete for this website.
                </div>
                <a
                  href={workshopUrl}
                  style={{
                    display: "inline-block",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    textDecoration: "none",
                  }}
                >
                  View Brand Profile
                </a>
              </>
            ) : brandProfile ? (
              <>
                <div style={{ color: "#374151", marginBottom: 10 }}>
                  Draft found. You can resume where you left off.
                </div>
                <a
                  href={workshopUrl}
                  style={{
                    display: "inline-block",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    textDecoration: "none",
                  }}
                >
                  Resume Draft
                </a>
              </>
            ) : (
              <>
                <div style={{ color: "#374151", marginBottom: 10 }}>
                  No draft yet. Start the workshop.
                </div>
                <a
                  href={workshopUrl}
                  style={{
                    display: "inline-block",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    textDecoration: "none",
                  }}
                >
                  Start Workshop
                </a>
              </>
            )}
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
