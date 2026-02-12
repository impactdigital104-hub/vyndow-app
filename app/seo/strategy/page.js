"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../VyndowShell";
import { auth } from "../../firebaseClient";

export default function SeoStrategyPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  // Feature flag (default should be false in Vercel until you enable it)
  const STRATEGY_ENABLED =
    process.env.NEXT_PUBLIC_SEO_STRATEGY_ENABLED === "true";

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

  // If not enabled, keep this hidden from all real users (even if they guess the URL)
  if (!STRATEGY_ENABLED) {
    return (
      <VyndowShell>
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            SEO Strategy (Private Beta)
          </h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            This feature is currently disabled.
          </p>
          <button
            onClick={() => router.replace("/seo")}
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Back to Vyndow SEO
          </button>
        </div>
      </VyndowShell>
    );
  }

  // Auth gate: show nothing until auth is ready (prevents flashes)
  if (!authReady) {
    return (
      <VyndowShell>
        <div style={{ padding: 24 }}>Loading…</div>
      </VyndowShell>
    );
  }

  return (
    <VyndowShell>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>
          Vyndow SEO — Strategy Wizard (WIP)
        </h1>
        <p style={{ marginTop: 8, color: "#555" }}>
          Hidden route scaffold. No live users can see this unless the feature
          flag is enabled.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700 }}>Next Build Phases</div>
          <ul style={{ marginTop: 10, color: "#444", lineHeight: 1.6 }}>
            <li>Step 1: Business Profile (save + resume)</li>
            <li>Step 2: URL Discovery + Selection</li>
            <li>Step 3: Pure On-page Audit</li>
          </ul>
        </div>

        <button
          onClick={() => router.push("/seo/control")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: "pointer",
          }}
        >
          Go to Strategy Control Center (WIP)
        </button>
      </div>
    </VyndowShell>
  );
}
