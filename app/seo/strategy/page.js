"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";

// =========================
// Step 1 — Business Profile (save + resume)
// Firestore:
// users/{uid}/websites/{websiteId}/modules/seo/strategy/businessProfile
// =========================

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  color: "#111827",
};

const helpStyle = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 6,
  lineHeight: 1.4,
};

export default function SeoStrategyPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState(null);

  // Website context (reuse conventions from /seo)
  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");

  // Step 1 data
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [revenueGoal, setRevenueGoal] = useState("");
  const [averageOrderValue, setAverageOrderValue] = useState("");
  const [primaryOffer, setPrimaryOffer] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [competitorsRaw, setCompetitorsRaw] = useState("");

  // Feature flag (default should be false in Vercel until you enable it)
  const STRATEGY_ENABLED =
    process.env.NEXT_PUBLIC_SEO_STRATEGY_ENABLED === "true";

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

  // Load websites (same pattern as /seo)
  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      try {
        setWebsitesLoading(true);
        setWebsitesError("");

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setWebsites(rows);

        // Restore previously selected website (if any)
        let restored = "";
        try {
          restored = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {
          // ignore
        }

        // Pick selected website: restored (if exists) else first
        const restoredExists = restored && rows.some((x) => x.id === restored);
        const pick = restoredExists ? restored : rows[0]?.id || "";
        setSelectedWebsiteId((prev) => prev || pick);
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setWebsitesError(
          e?.message || "Unknown Firestore error while loading websites."
        );
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid]);

  // Persist selected website for other pages
  useEffect(() => {
    if (!selectedWebsiteId) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsiteId);
    } catch (e) {
      // ignore
    }
  }, [selectedWebsiteId]);

  function getEffectiveContext(websiteId) {
    const id = websiteId || selectedWebsiteId;
    const w = websites.find((x) => x.id === id);

    const effectiveUid = w && w.ownerUid ? w.ownerUid : uid;
    const effectiveWebsiteId = w && w.ownerWebsiteId ? w.ownerWebsiteId : id;

    return { effectiveUid, effectiveWebsiteId };
  }

  function businessProfileDocRef() {
    if (!uid || !selectedWebsiteId) return null;
    const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(
      selectedWebsiteId
    );
    if (!effectiveUid || !effectiveWebsiteId) return null;

    return doc(
      db,
      "users",
      effectiveUid,
      "websites",
      effectiveWebsiteId,
      "modules",
      "seo",
      "strategy",
      "businessProfile"
    );
  }

  // Load existing Step 1 profile (resume)
  useEffect(() => {
    async function loadProfile() {
      const ref = businessProfileDocRef();
      if (!ref) return;

      try {
        setLoadingProfile(true);
        setSaveState("idle");
        setSaveError("");

        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setProfileExists(false);
          setLastSavedAt(null);
          return;
        }

        const d = snap.data() || {};
        setProfileExists(true);
        setBusinessName(d.businessName || "");
        setIndustry(d.industry || "");
        setGeography(d.geography || "");
        setRevenueGoal(d.revenueGoal || "");
        setAverageOrderValue(
          d.averageOrderValue != null ? String(d.averageOrderValue) : ""
        );
        setPrimaryOffer(d.primaryOffer || "");
        setTargetCustomer(d.targetCustomer || "");
        setCompetitorsRaw(
          Array.isArray(d.competitors) ? d.competitors.join("\n") : ""
        );

        const ua = d.updatedAt?.toDate ? d.updatedAt.toDate() : null;
        setLastSavedAt(ua);
      } catch (e) {
        console.error("Failed to load business profile:", e);
        // Non-blocking: user can still fill and save
        setProfileExists(false);
      } finally {
        setLoadingProfile(false);
      }
    }

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selectedWebsiteId, websites]);

  async function handleSaveDraft() {
    const ref = businessProfileDocRef();
    if (!ref) return;

    setSaveState("saving");
    setSaveError("");

    const competitors = (competitorsRaw || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const competitorsCapped = competitors.slice(0, 20);

    const aovRaw = String(averageOrderValue || "").trim();
    const aovNum = aovRaw === "" ? null : Number(aovRaw);
    const aovFinal = aovNum == null || Number.isNaN(aovNum) ? null : aovNum;

    // Preserve createdAt if doc already exists
    let createdAt = null;
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const d = existing.data() || {};
        createdAt = d.createdAt || null;
      }
    } catch (e) {
      // ignore (we'll still write)
    }

    try {
      await setDoc(
        ref,
        {
          businessName: String(businessName || "").trim(),
          industry: String(industry || "").trim(),
          geography: String(geography || "").trim(),
          revenueGoal: String(revenueGoal || "").trim(),
          averageOrderValue: aovFinal,
          primaryOffer: String(primaryOffer || "").trim(),
          targetCustomer: String(targetCustomer || "").trim(),
          competitors: competitorsCapped,
          status: "draft",
          createdAt: createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfileExists(true);
      setSaveState("saved");
      setLastSavedAt(new Date());
      // Clear the "Saved" state after a short delay
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.error("Failed to save draft:", e);
      setSaveState("error");
      setSaveError(e?.message || "Failed to save draft.");
    }
  }

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
      <div style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
            Build SEO Strategy
          </h1>
          <div
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              color: "#374151",
              background: "#fafafa",
            }}
          >
            Private Beta
          </div>
        </div>

        <p style={{ marginTop: 8, color: "#6b7280" }}>
          Step 1 of 9 — Business &amp; Revenue Alignment (no keywords)
        </p>

        {/* Website selector */}
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>
            Website Context
          </div>

          {websitesLoading ? (
            <div style={{ color: "#374151" }}>Loading websites…</div>
          ) : websitesError ? (
            <div style={{ color: "#b91c1c" }}>{websitesError}</div>
          ) : !websites.length ? (
            <div style={{ color: "#374151", lineHeight: 1.5 }}>
              No websites found. Please create a website first.
              <div>
                <button
                  onClick={() => router.push("/websites")}
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Go to Websites
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Selected website</label>
                <select
                  value={selectedWebsiteId}
                  onChange={(e) => setSelectedWebsiteId(e.target.value)}
                  style={{
                    ...inputStyle,
                    height: 42,
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.websiteUrl || w.domain || w.id}
                    </option>
                  ))}
                </select>
                <div style={helpStyle}>
                  Strategy data is saved per website under its SEO module.
                </div>
              </div>

              <button
                onClick={() => router.push("/seo")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  background: "white",
                  height: 42,
                  marginTop: 22,
                }}
              >
                Back to Vyndow SEO
              </button>
            </div>
          )}
        </div>

        {/* Resume banner */}
        {selectedWebsiteId && profileExists ? (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              border: "1px solid #dbeafe",
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1e3a8a",
            }}
          >
            <div style={{ fontWeight: 800 }}>Resume Strategy Setup</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              A saved draft was found for this website.
              {lastSavedAt ? (
                <span> Last saved: {lastSavedAt.toLocaleString()}.</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Step 1 form */}
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
            Step 1 — Business Profile
          </div>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            We will use this to build a revenue-aligned SEO strategy. Do not add
            keywords here.
          </div>

          {loadingProfile ? (
            <div style={{ marginTop: 12, color: "#374151" }}>
              Loading saved draft…
            </div>
          ) : null}

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Business name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g., Acme Dental Care"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g., Healthcare"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Target geography</label>
              <input
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="e.g., USA (California)"
                style={inputStyle}
              />
              <div style={helpStyle}>
                Where do you want to rank and convert customers?
              </div>
            </div>

            <div>
              <label style={labelStyle}>Primary revenue goal</label>
              <select
                value={revenueGoal}
                onChange={(e) => setRevenueGoal(e.target.value)}
                style={{ ...inputStyle, height: 42, background: "white" }}
              >
                <option value="">Select one</option>
                <option value="generate_leads">Generate leads</option>
                <option value="increase_sales">Increase sales</option>
                <option value="book_appointments">Book appointments</option>
                <option value="increase_trials">Increase trials / demos</option>
                <option value="increase_store_visits">Increase store visits</option>
                <option value="brand_authority">Build brand authority</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Average order value (optional)</label>
              <input
                value={averageOrderValue}
                onChange={(e) => setAverageOrderValue(e.target.value)}
                placeholder="e.g., 250"
                inputMode="decimal"
                style={inputStyle}
              />
              <div style={helpStyle}>
                If you are lead-gen, you can enter your average deal value.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Primary offer / services</label>
            <textarea
              value={primaryOffer}
              onChange={(e) => setPrimaryOffer(e.target.value)}
              placeholder="What do you sell? What is your #1 offer?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Target customer</label>
            <textarea
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
              placeholder="Who do you want to attract? (persona, segment, pain points)"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>
              Competitor URLs (optional, one per line)
            </label>
            <textarea
              value={competitorsRaw}
              onChange={(e) => setCompetitorsRaw(e.target.value)}
              placeholder="https://competitor1.com\nhttps://competitor2.com"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={helpStyle}>
              Max 20 URLs. We will use these later for positioning and content
              direction.
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={handleSaveDraft}
                disabled={!selectedWebsiteId || saveState === "saving"}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  cursor:
                    !selectedWebsiteId || saveState === "saving"
                      ? "not-allowed"
                      : "pointer",
                  background: "#111827",
                  color: "white",
                  opacity:
                    !selectedWebsiteId || saveState === "saving" ? 0.6 : 1,
                }}
              >
                {saveState === "saving" ? "Saving…" : "Save Draft"}
              </button>

              {saveState === "saved" ? (
                <div style={{ color: "#065f46", fontWeight: 800 }}>Saved</div>
              ) : null}

              {saveState === "error" ? (
                <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                  Save failed
                </div>
              ) : null}
            </div>

            <button
              disabled
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                color: "#6b7280",
                cursor: "not-allowed",
              }}
              title="Step 2 will be enabled after we finish Phase C"
            >
              Continue to Step 2 (next phase)
            </button>
          </div>

          {saveError ? (
            <div style={{ marginTop: 12, color: "#b91c1c" }}>{saveError}</div>
          ) : null}
        </div>

        {/* WIP link (not used in this phase) */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => router.push("/seo/control")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              background: "white",
            }}
          >
            Go to Strategy Control Center (WIP)
          </button>
        </div>
      </div>
    </VyndowShell>
  );
}
