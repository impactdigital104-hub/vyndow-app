"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

import VyndowShell from "../VyndowShell";
import { auth, db } from "../firebaseClient";

export default function GeoPage() {
  const router = useRouter();

  const [uid, setUid] = useState(null);
  const [websites, setWebsites] = useState([]);
  const [selectedWebsite, setSelectedWebsite] = useState("");
  const [ensureStatus, setEnsureStatus] = useState("idle"); // idle | running | ok | error
  const [selectedWebsiteName, setSelectedWebsiteName] = useState("");
const [ensureInfo, setEnsureInfo] = useState(null);
  const [ensureError, setEnsureError] = useState("");

  // Auth gate (same as SEO)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  // Load websites (same collection as SEO page uses)
  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      const colRef = collection(db, "users", uid, "websites");
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
setWebsites(rows);

function getWebsiteName(row) {
  // try common field names without guessing too much
  return (
    row?.websiteName ||
    row?.name ||
    row?.domain ||
    row?.website ||
    row?.url ||
    row?.id ||
    ""
  );
}


      // Prefer saved websiteId (set by SEO page), else first website
      let saved = "";
      try {
        saved = localStorage.getItem("vyndow_selectedWebsiteId") || "";
      } catch (e) {
        // ignore
      }

      const exists = saved && rows.some((r) => r.id === saved);
if (exists) {
  setSelectedWebsite(saved);
  const match = rows.find((r) => r.id === saved);
  setSelectedWebsiteName(getWebsiteName(match));
} else if (rows.length) {
  setSelectedWebsite(rows[0].id);
  setSelectedWebsiteName(getWebsiteName(rows[0]));
  try {
    localStorage.setItem("vyndow_selectedWebsiteId", rows[0].id);
  } catch (e) {
    // ignore
  }
}
    }

    loadWebsites().catch((e) => console.error("GEO loadWebsites error:", e));
  }, [uid]);

  // Ensure GEO module doc exists for selected website
  useEffect(() => {
    async function ensureGeoModule() {
      if (!uid) return;
      if (!selectedWebsite) return;

      setEnsureStatus("running");
      setEnsureError("");

      try {
        const token = await auth.currentUser.getIdToken();

        const resp = await fetch("/api/geo/ensure", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ websiteId: selectedWebsite }),
        });

        const data = await resp.json().catch(() => ({}));

if (!resp.ok || !data?.ok) {
  throw new Error(data?.error || "Failed to ensure GEO module");
}

setEnsureInfo({
  ownerUid: data.ownerUid,
  websiteId: data.websiteId,
});
setEnsureStatus("ok");

      } catch (e) {
        console.error(e);
        setEnsureStatus("error");
        setEnsureError(e?.message || "Unknown error");
      }
    }

    ensureGeoModule();
  }, [uid, selectedWebsite]);

  return (
    <VyndowShell activeModule="geo">
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Vyndow GEO
        </h1>

        <p style={{ marginBottom: 12 }}>
          GEO is being built in staging. This page confirms routing + module initialization.
        </p>

        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 16,
            background: "#fff",
            maxWidth: 760,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Phase 1 Status
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>GEO appears in left navigation</li>
            <li>Route exists at /geo</li>
            <li>Auto-creates modules/geo doc for selected website</li>
          </ul>
        </div>

        <div style={{ fontSize: 14, opacity: 0.9 }}>
          <div>
      <b>Selected website:</b>{" "}
{selectedWebsiteName ? `${selectedWebsiteName} (${selectedWebsite})` : selectedWebsite || "(none yet)"}
          </div>
          <div>
            <b>GEO module ensure:</b>{" "}
            {ensureStatus === "idle" && "Idle"}
            {ensureStatus === "running" && "Running..."}
            {ensureStatus === "ok" && "OK ✅"}
            {ensureStatus === "error" && `Error ❌ (${ensureError})`}
{ensureInfo?.ownerUid && (
  <div style={{ marginTop: 6 }}>
    <b>Ensured at:</b> users/{ensureInfo.ownerUid}/websites/{ensureInfo.websiteId}/modules/geo
  </div>
)}

          </div>
        </div>
      </div>
    </VyndowShell>
  );
}
