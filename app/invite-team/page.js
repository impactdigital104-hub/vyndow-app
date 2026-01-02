"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../VyndowShell";
import { auth } from "../firebaseClient";

export default function InviteTeamPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);

  const [websiteId, setWebsiteId] = useState(null);
  const [pageError, setPageError] = useState("");

  // Team data
  const [loading, setLoading] = useState(false);
  const [seatLimit, setSeatLimit] = useState(0);
  const [seatsUsed, setSeatsUsed] = useState(0);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  // Actions
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");

  const seatsLeft = useMemo(() => {
    if (!seatLimit) return 0;
    return Math.max(0, seatLimit - seatsUsed);
  }, [seatLimit, seatsUsed]);

  // ─────────────────────────────────────────────
  // AUTH CHECK (same pattern as /seo)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
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
        setPageError(
          "No website selected. Please go to the SEO page and select a website first."
        );
        return;
      }
      setWebsiteId(id);
    } catch (e) {
      setPageError("Unable to read selected website.");
    }
  }, []);

  async function authedFetch(url, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not logged in.");
    const token = await user.getIdToken();
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function loadTeamData(currentWebsiteId) {
    if (!currentWebsiteId) return;

    try {
      setLoading(true);
      setPageError("");

      const res = await authedFetch(
        `/api/websites/team/list?websiteId=${currentWebsiteId}`,
        { method: "GET", headers: {} }
      );

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load team data.");

      setSeatLimit(json.seatLimit || 0);
      setSeatsUsed(json.seatsUsed || 0);
      setMembers(json.members || []);
      setInvites(json.invites || []);
    } catch (e) {
      setPageError(e.message || "Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authReady) return;
    if (!websiteId) return;
    loadTeamData(websiteId);
  }, [authReady, websiteId]);

  async function handleInviteSubmit(e) {
    e.preventDefault();
    setActionMsg("");
    setActionErr("");

    const email = (inviteEmail || "").trim().toLowerCase();
    const name = (inviteName || "").trim();

    if (!websiteId) return setActionErr("No website selected.");
    if (!email) return setActionErr("Please enter an email address.");

    try {
      setActionBusy(true);

      const res = await authedFetch("/api/websites/team/invite", {
        method: "POST",
        body: JSON.stringify({
          websiteId,
          email,
          name,
          role: inviteRole || "member",
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        if (json.error === "SEAT_LIMIT_REACHED") {
          throw new Error("Seat limit reached. Upgrade plan to add more users.");
        }
        if (json.error === "INVITE_ALREADY_EXISTS") {
          throw new Error("An invite to this email already exists.");
        }
        throw new Error(json.error || "Failed to create invite.");
      }

      setActionMsg("Invite created. (V1: no email is sent yet — it will show under Pending Invites.)");
      setInviteName("");
      setInviteEmail("");
      setInviteRole("member");

      await loadTeamData(websiteId);
    } catch (e2) {
      setActionErr(e2.message || "Failed to create invite.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveInvite(inviteId) {
    if (!websiteId) return;

    setActionMsg("");
    setActionErr("");

    try {
      setActionBusy(true);

      const res = await authedFetch("/api/websites/team/remove", {
        method: "POST",
        body: JSON.stringify({ websiteId, inviteId }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to remove invite.");

      setActionMsg("Invite removed.");
      await loadTeamData(websiteId);
    } catch (e) {
      setActionErr(e.message || "Failed to remove invite.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveMember(memberUid) {
    if (!websiteId) return;

    setActionMsg("");
    setActionErr("");

    try {
      setActionBusy(true);

      const res = await authedFetch("/api/websites/team/remove", {
        method: "POST",
        body: JSON.stringify({ websiteId, memberUid }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to remove member.");

      setActionMsg("Member removed.");
      await loadTeamData(websiteId);
    } catch (e) {
      setActionErr(e.message || "Failed to remove member.");
    } finally {
      setActionBusy(false);
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
    <VyndowShell activeModule="invite-team">
      <main className="page">
        <header style={{ marginBottom: 18 }}>
          <h1>Invite Team</h1>
          <p className="sub">Add team members who can access this website.</p>
        </header>

        {pageError && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              background: "#fff1f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              marginBottom: 16,
            }}
          >
            {pageError}
          </div>
        )}

        {!pageError && (
          <>
            {/* Summary */}
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#374151" }}>
                    <strong>Website</strong>
                  </div>
                  <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 12 }}>
                    {websiteId}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#374151" }}>
                    <strong>Seats</strong>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#111827" }}>
                    {seatsUsed} / {seatLimit}{" "}
                    <span style={{ color: "#6b7280" }}>
                      ({seatsLeft} left)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions feedback */}
            {(actionMsg || actionErr) && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: actionErr ? "#fff1f2" : "#ecfeff",
                  color: actionErr ? "#991b1b" : "#155e75",
                  marginBottom: 16,
                }}
              >
                {actionErr || actionMsg}
              </div>
            )}

            {/* Invite form */}
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                marginBottom: 16,
              }}
            >
              <h3 style={{ marginTop: 0, color: "#6D28D9" }}>Invite a team member</h3>
              <form onSubmit={handleInviteSubmit}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px" }}>
                    <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                      Name (optional)
                    </div>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. Reetu"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                  </div>

                  <div style={{ flex: "1 1 260px" }}>
                    <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                      Email
                    </div>
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="name@company.com"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                  </div>

                  <div style={{ flex: "0 0 160px" }}>
                    <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                      Role
                    </div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                      }}
                    >
                      <option value="member">Member</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
           <button
  type="submit"
  disabled={actionBusy || loading || seatLimit === 0 || seatsUsed >= seatLimit}
  style={{
    padding: "10px 16px",
    borderRadius: 999,
    border: "0",
    background:
      actionBusy || loading || seatsUsed >= seatLimit ? "#E5E7EB" : "#6D28D9",
    color:
      actionBusy || loading || seatsUsed >= seatLimit ? "#111827" : "#ffffff",
    fontWeight: 700,
    cursor:
      actionBusy || loading || seatsUsed >= seatLimit ? "not-allowed" : "pointer",
    boxShadow:
      actionBusy || loading || seatsUsed >= seatLimit
        ? "none"
        : "0 14px 30px rgba(109,40,217,0.18)",
    opacity: actionBusy || loading || seatsUsed >= seatLimit ? 0.9 : 1,
  }}
>
  {actionBusy ? "Working…" : "Create Invite"}
</button>


                  <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280" }}>
                    Note: this will send an email invite to the user. please inform them.
                  </span>
                </div>
              </form>
            </div>

            {/* Members + Invites */}
            <div
              style={{
                padding: 16,
                borderRadius: 14,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              {loading && <p>Loading team data…</p>}

              {!loading && (
                <>
                  <h3 style={{ marginTop: 0, color: "#6D28D9" }}>Members</h3>
                  {members.length === 0 && <p>No members found.</p>}

                  {members.map((m) => {
                    const isOwner = (m.role || "") === "owner";
                    const label = m.email || m.id;

                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          padding: "10px 0",
                          borderTop: "1px solid #f3f4f6",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14 }}>{label}</div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {m.role || "member"}
                          </div>
                        </div>

                        <button
                          disabled={actionBusy || isOwner}
                          onClick={() => handleRemoveMember(m.uid)}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: isOwner ? "#f3f4f6" : "#fff",
                            color: isOwner ? "#9ca3af" : "#111827",
                            cursor: isOwner ? "not-allowed" : "pointer",
                          }}
                          title={isOwner ? "Owner cannot be removed" : "Remove member"}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}

                  <h3 style={{ marginTop: 18, color: "#6D28D9" }}>Pending Invites</h3>
                  {invites.length === 0 && <p>No pending invites.</p>}

                  {invites.map((i) => (
                    <div
                      key={i.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 0",
                        borderTop: "1px solid #f3f4f6",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14 }}>{i.email}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {i.status || "pending"}
                        </div>
                      </div>

                      <button
                        disabled={actionBusy}
                        onClick={() => handleRemoveInvite(i.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
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
