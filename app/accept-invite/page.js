"use client";

import { Suspense } from "react";
import VyndowShell from "../VyndowShell";
import AuthGate from "../components/AuthGate";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <AuthGate>
      <VyndowShell activeModule="seo">
        <main className="page">
          <header style={{ marginBottom: 16 }}>
            <span className="badge">Invite Acceptance</span>
            <h1>Accept Invite</h1>
          </header>

          <Suspense fallback={<p className="sub">Loading invite…</p>}>
            <AcceptInviteClient />
          </Suspense>
        </main>
      </VyndowShell>
    </AuthGate>
  );
}
