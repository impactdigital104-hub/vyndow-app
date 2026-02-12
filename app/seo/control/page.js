"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../VyndowShell";
import { auth } from "../../firebaseClient";

export default function SeoStrategyControlCenterPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

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

  if (!STRATEGY_ENABLED) {
    return (
      <VyndowShell>
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            SEO Strategy Control Center (Private Beta)
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
          SEO Strategy Control Center (WIP)
        </h1>
        <p style={{ marginTop: 8, color: "#555" }}>
          This will become the execution hub after the roadmap is locked.
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
          <div style={{ fontWeight: 700 }}>Planned Sections (Locked Spec)</div>
          <ul style={{ marginTop: 10, color: "#444", lineHeight: 1.6 }}>
            <li>Business Snapshot</li>
            <li>Audit Snapshot</li>
            <li>Topical Architecture Snapshot</li>
            <li>Task Progress Summary</li>
            <li>90-Day Roadmap View</li>
            <li>Execute Next Task Shortcut</li>
          </ul>
        </div>

        <button
          onClick={() => router.push("/seo/strategy")}
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: "pointer",
          }}
        >
          Back to Strategy Wizard (WIP)
        </button>
      </div>
    </VyndowShell>
  );
}
