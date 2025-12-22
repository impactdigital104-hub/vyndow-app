"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "../firebaseClient";

export default function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = (searchParams.get("token") || "").trim();

  const [status, setStatus] = useState("Starting…");
  const [details, setDetails] = useState("");

  useEffect(() => {
    async function run() {
      if (!inviteToken) {
        setStatus("Invalid invite link.");
        setDetails("Missing token.");
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        const next = `/accept-invite?token=${encodeURIComponent(inviteToken)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
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

        if (!resp.ok || !data?.ok) {
          const err = data?.error || "Failed to accept invite.";
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
  }, [inviteToken, router]);

  return (
    <div>
      <p className="sub" style={{ maxWidth: 760 }}>{status}</p>

      {details ? (
        <p style={{ color: "#b91c1c", marginTop: 10 }}>
          <b>Details:</b> {details}
        </p>
      ) : null}

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
          If this page doesn’t move forward, ensure you are logged in and try the link again.
        </div>
      </section>
    </div>
  );
}
