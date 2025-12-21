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
                border: "1px dashed #e5e7eb",
                background: "#fafafa",
              }}
            >
              <p style={{ margin: 0 }}>
                Team management UI will appear here next.
              </p>
              <p style={{ marginTop: "8px", fontSize: "14px", color: "#6b7280" }}>
                (Invites, members, and seat limits will be wired in the next step.)
              </p>
            </div>
          </>
        )}
      </main>
    </VyndowShell>
  );
}
