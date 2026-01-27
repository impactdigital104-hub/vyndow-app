"use client";

import VyndowShell from "../../VyndowShell";
import AuthGate from "../../components/AuthGate";

export default function SocialWorkshopStub() {
  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 980 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Vyndow Social — Phase 1 Workshop</h1>
          <p style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
            Workshop is being built step-by-step. Next, we will add Step 0 → Step 6 screens and autosave draft to Firestore.
          </p>

          <div style={{ marginTop: 14 }}>
            <a href="/social" style={{ textDecoration: "none" }}>
              ← Back to Vyndow Social
            </a>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
