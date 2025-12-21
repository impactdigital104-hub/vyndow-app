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

  // Debug helper (temporary — we will remove in cleanup pass)
  const [lastApiJson, setLastApiJson] = useState("");

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
    } catch (e) {
      setError("Unable to read selected website.");
    }
  }, []);

  // ─────────────────────────────────────────────
  // LOAD TEAM DATA FOR WEBSITE (only after authReady + websiteId)
  // ─────────────────────────────────────────────
  async function loadTeamData(currentWebsiteId) {
    if (!currentWebsiteId) return;

    try {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        setLastApiJson("auth.currentUser is null (waiting for Firebase auth)...");
        return;
      }

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

      // capture what the server returned (so we can debug deterministically)
      try {
        setLastApiJson(JSON.stringify(json, null, 2));
      } catch (e) {
        setLastApiJson(String(json));
      }

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

  useEffect(() => {
    if (!authReady) return;
    if (!websiteId) return;
    loadTeamData(websiteId);
  }, [authReady, websiteId]);

  if (!authReady) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking login…
      </div>
    );
  }

  return (
    <VyndowShell activeModule="invite-team">
      <main className="page">
        <header style={{ marginBottom: "20px" }}>
          <h1>Invite Team</h1>
          <p className="sub">Manage users who can access this website.</p>
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
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "14px", color: "#374151" }}>
                    <strong>Website ID</strong>
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

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14px", color: "#374151" }}>
                    <strong>Seats used</strong>
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#111827" }}>
                    {seatsUsed} / {seatLimit}
                  </div>
                </div>
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
                  <h3 style={{ marginTop: 0 }}>Members</h3>
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

                  {/* Temporary debug (remove later) */}
                  <h3 style={{ marginTop: "16px" }}>Debug: API Response</h3>
                  <pre
                    style={{
                      marginTop: "8px",
                      padding: "12px",
                      borderRadius: "12px",
                      border: "1px solid #e5e7eb",
                      background: "#fafafa",
                      overflowX: "auto",
                      fontSize: "12px",
                    }}
                  >
                    {lastApiJson || "(no response captured yet)"}
                  </pre>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </VyndowShell>
  );
}
