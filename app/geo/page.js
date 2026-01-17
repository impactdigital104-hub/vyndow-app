"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../VyndowShell";
import { auth } from "../firebaseClient";

export default function GeoPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
      }
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  return (
    <VyndowShell activeModule="geo">
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Vyndow GEO
        </h1>

        <p style={{ marginBottom: 16 }}>
          GEO is being built in staging. This page confirms routing + navigation wiring.
        </p>

        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 16,
            background: "#fff",
            maxWidth: 760,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Coming Soon (Phase 1)
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>GEO appears in left navigation</li>
            <li>Route exists at /geo</li>
            <li>No audits or scoring yet</li>
          </ul>
        </div>
      </div>
    </VyndowShell>
  );
}
