"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseClient";

export default function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Existing token logic (yours)
  const inviteToken = (searchParams.get("token") || "").trim();

  // New: store wrong-email info for UX
  const [status, setStatus] = useState("Starting…");
  const [details, setDetails] = useState("");
  const [wrongEmailInfo, setWrongEmailInfo] = useState(null);

  // New: compute "next" url once (used after sign out)
  const nextAfterLogin = useMemo(() => {
    const t = inviteToken || "";
    return t ? `/accept-invite?token=${encodeURIComponent(t)}` : "/accept-invite";
  }, [inviteToken]);

  useEffect(() => {
    async function run() {
      // reset per-run
      setWrongEmailInfo(null);

      if (!inviteToken) {
        setStatus("Invalid invite link.");
        setDetails("Missing token.");
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(nextAfterLogin)}`);
        return;
      }

      setStatus("Accepting invite…");
      setDetails("");

      try {
        const idToken = await user.getIdToken();
        const resp = await fetch("/api/websites/team/accept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token: inviteToken }),
        });

        let data = {};
        try {
          data = await resp.json();
        } catch {}

        // Handle failure (including WRONG_EMAIL)
        if (!resp.ok || !data?.ok) {
          // NEW: if backend says WRONG_EMAIL, show switch UX
          if (data?.code === "WRONG_EMAIL") {
            setWrongEmailInfo({
              invitedEmail: data.invitedEmail || "",
              currentEmail: data.currentEmail || (auth.currentUser?.email || ""),
            });
          }

          const err =
            (data && (data.error || data.details || data.message)) ||
            `HTTP_${resp.status}`;

          setStatus("Could not accept invite.");
          setDetails(err);
          return;
        }

        setStatus("Invite accepted! Redirecting to SEO…");
        setTimeout(() => router.replace("/seo"), 700);
      } catch (e) {
        setStatus("Could not accept invite.");
        setDetails(e?.message || "Unknown error.");
      }
    }

    run();
  }, [inviteToken, nextAfterLogin, router]);

  return (
    <div>
      <p className="sub" style={{ maxWidth: 760 }}>
        {status}
      </p>

      {details ? (
        <p style={{ color: "#b91c1c", marginTop: 10, maxWidth: 760 }}>
          <b>Details:</b> {details}
        </p>
      ) : null}

      {/* NEW: Wrong-email UX box */}
      {wrongEmailInfo ? (
        <section
          style={{
            padding: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            maxWidth: 760,
            marginTop: 14,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            This invite is for a different email
          </div>

          <div style={{ color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
            <div>
              You are signed in as:{" "}
              <b>{wrongEmailInfo.currentEmail || "(unknown)"}</b>
            </div>
            <div>
              This invite was sent to:{" "}
              <b>{wrongEmailInfo.invitedEmail || "(unknown)"}</b>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              try {
                await signOut(auth);
              } catch {}
              // Force user to login again, preserving the invite token
              window.location.href = `/login?next=${encodeURIComponent(nextAfterLogin)}`;
            }}
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Sign out & continue
          </button>
        </section>
      ) : (
        <section
          style={{
            padding: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#fff",
            maxWidth: 760,
            marginTop: 14,
          }}
        >
          <div style={{ color: "#6b7280" }}>
            If this page doesn’t move forward, ensure you are logged in and try
            the link again.
          </div>
        </section>
      )}
    </div>
  );
}
