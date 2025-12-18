"use client";

import { useState } from "react";
import VyndowShell from "../../VyndowShell";
import AuthGate from "../../components/AuthGate";
import { auth } from "../../firebaseClient";

export default function AdminPlansPage() {
  const [targetUid, setTargetUid] = useState("SGr1gmy6uSUINLHzMknclyEduIV2");
  const [extraWebsitesPurchased, setExtraWebsitesPurchased] = useState(0);
  const [extraBlogCreditsThisMonth, setExtraBlogCreditsThisMonth] = useState(0);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function callSetPlan(plan) {
    try {
      setBusy(true);
      setOut("Running...");

      const u = auth.currentUser;
      if (!u) {
        setOut("Not logged in.");
        return;
      }

      const token = await u.getIdToken();

      const resp = await fetch("/api/admin/setPlan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUid,
          plan,
          extraWebsitesPurchased: Number(extraWebsitesPurchased) || 0,
          extraBlogCreditsThisMonth: Number(extraBlogCreditsThisMonth) || 0,
        }),
      });

      const json = await resp.json();
      setOut(JSON.stringify(json, null, 2));
    } catch (e) {
      setOut("Error: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  const meEmail = auth.currentUser?.email || "(loading / not signed in yet)";
  const meUid = auth.currentUser?.uid || "(loading / not signed in yet)";

  return (
    <AuthGate>
      <VyndowShell activeModule="Admin">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
          <h1 style={{ margin: "8px 0 4px" }}>Admin — Plans (Phase X.2)</h1>
          <p style={{ marginTop: 0, opacity: 0.8 }}>
            Temporary internal tool. This calls <code>/api/admin/setPlan</code> (server-verified).
          </p>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>You (current session)</div>
            <div style={{ fontFamily: "monospace", fontSize: 13 }}>
              Email: {meEmail}
              <br />
              UID: {meUid}
            </div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Target user to update</div>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Target UID</div>
              <input
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Extra websites purchased</div>
                <input
                  type="number"
                  value={extraWebsitesPurchased}
                  onChange={(e) => setExtraWebsitesPurchased(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>

              <label>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Extra blog credits this month</div>
                <input
                  type="number"
                  value={extraBlogCreditsThisMonth}
                  onChange={(e) => setExtraBlogCreditsThisMonth(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                disabled={busy}
                onClick={() => callSetPlan("free")}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc" }}
              >
                Set FREE (2 blogs)
              </button>

              <button
                disabled={busy}
                onClick={() => callSetPlan("small_business")}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc" }}
              >
                Set SMALL BUSINESS (6 blogs)
              </button>

              <button
                disabled={busy}
                onClick={() => callSetPlan("enterprise")}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc" }}
              >
                Set ENTERPRISE (15 blogs, 3 users)
              </button>
            </div>
          </div>

          <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Response</div>
            <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 10, minHeight: 120 }}>
              {out || "—"}
            </pre>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
