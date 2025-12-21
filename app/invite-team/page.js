"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../VyndowShell";
import { auth } from "../firebaseClient";

export default function InviteTeamPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState(null);

  const [websiteId, setWebsiteId] = useState(null);
  const [error, setError] = useState("");

  // Team data
  const [loading, setLoading] = useState(false);
  const [seatLimit, setSeatLimit] = useState(0);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);


  // ─────────────────────────────────────────────
  // AUTH CHECK (same pattern as /seo)
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // LOAD CURRENT WEBSITE ID (from SEO selection)
  // ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const id = localStorage.getItem("vyndow_selectedWebsiteId");
      if (!id) {
        setError(
          "No website selected. Please go to the SEO page and select a website first."
        );
        return;
      }
         setWebsiteId(id);
      loadTeamData(id);

    } catch (e) {
      setError("Unable to read selected website.");
    }
  }, []);

    // ─────────────────────────────────────────────
  // LOAD TEAM DATA FOR WEBSITE
  // ─────────────────────────────────────────────
  async function loadTeamData(currentWebsiteId) {
    if (!currentWebsiteId) return;

    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();

      const res = await fetch(
        `/api/websites/team/list?websiteId=${currentWebsiteId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to load team data");
      }

      setSeatLimit(json.seatLimit || 0);
      setSeatsUsed(json.seatsUsed || 0);
      setMembers(json.members || []);
      setInvites(json.invites || []);
    } catch (e) {
      setError(e.message || "Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }

  if (!authReady) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking login…
      </div>
    );
  }

  return (
    <VyndowShell activeModule="websites">
      <main className="page">
        <header style={{ marginBottom: "20px" }}>
          <h1>Invite Team</h1>
          <p className="sub">
            Manage users who can access this website.
          </p>
        </header>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "12px",
              background: "#fff1f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        {!error && (
          <>
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                marginBottom: "20px",
              }}
            >
              <div style={{ fontSize: "14px", color: "#374151" }}>
                <strong>Selected Website ID:</strong>
              </div>
              <div
                style={{
                  marginTop: "6px",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  color: "#111827",
                }}
              >
                {websiteId}
              </div>
            </div>

            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              {loading && <p>Loading team data…</p>}

              {!loading && (
                <>
                  <p>
                    <strong>Seats used:</strong> {seatsUsed} / {seatLimit}
                  </p>

                  <h3 style={{ marginTop: "16px" }}>Members</h3>
                  {members.length === 0 && <p>No members found.</p>}
                  {members.map((m) => (
                    <p key={m.id} style={{ marginBottom: "6px" }}>
                      {m.email || m.id}{" "}
                      <span style={{ color: "#6b7280" }}>
                        ({m.role || "member"})
                      </span>
                    </p>
                  ))}

                  <h3 style={{ marginTop: "16px" }}>Pending Invites</h3>
                  {invites.length === 0 && <p>No pending invites.</p>}
                  {invites.map((i) => (
                    <p key={i.id} style={{ marginBottom: "6px" }}>
                      {i.email}{" "}
                      <span style={{ color: "#6b7280" }}>
                        ({i.status})
                      </span>
                    </p>
                  ))}
                </>
              )}
            </div>

          </>
        )}
      </main>
    </VyndowShell>
  );
}
