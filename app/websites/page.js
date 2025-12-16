"use client";

// app/websites/page.js

import { useEffect, useState } from "react";
import VyndowShell from "../VyndowShell";
import AuthGate from "../components/AuthGate";
import { auth, db } from "../firebaseClient";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";



const cellStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left",
  verticalAlign: "top",
};

const headerCellStyle = {
  ...cellStyle,
  fontWeight: 600,
  background: "#f9fafb",
  whiteSpace: "nowrap",
};

// TODO [Phase 7]:
// - Protect this page behind authentication.
// - Load websites from backend instead of using sampleWebsites.
// - Allow creating, editing, and deleting websites from this screen.
// - Connect the "+ Add Website" button to a drawer / modal form that
//   posts to /api/websites and refreshes the list.
export default function WebsitesPage() {
  const [uid, setUid] = useState(null);

  const [websites, setWebsites] = useState([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [websitesError, setWebsitesError] = useState("");

  const [seoModule, setSeoModule] = useState(null);
  const [loadingSeoModule, setLoadingSeoModule] = useState(true);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
const [editingSiteId, setEditingSiteId] = useState(null);

const [pBrandDescription, setPBrandDescription] = useState("");
const [pTargetAudience, setPTargetAudience] = useState("");
const [pToneOfVoice, setPToneOfVoice] = useState(""); // comma-separated text
const [pReadingLevel, setPReadingLevel] = useState("");
const [pGeoTarget, setPGeoTarget] = useState("");
const [pIndustry, setPIndustry] = useState("");

const [savingProfile, setSavingProfile] = useState(false);
const [profileMsg, setProfileMsg] = useState("");

  // 1) Track auth state (uid)
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  // 2) Load SEO module plan/limits for this user
  useEffect(() => {
    if (!uid) return;

    async function loadSeoModule() {
      setLoadingSeoModule(true);
      try {
        const ref = doc(db, "users", uid, "modules", "seo");
        const snap = await getDoc(ref);
        setSeoModule(snap.exists() ? snap.data() : null);
      } catch (e) {
        console.error("Failed to load SEO module:", e);
        setSeoModule(null);
      } finally {
        setLoadingSeoModule(false);
      }
    }

    loadSeoModule();
  }, [uid]);

  // 3) Load websites list for this user
  useEffect(() => {
    if (!uid) return;

    async function loadWebsites() {
      setLoadingWebsites(true);
      setWebsitesError("");
      try {
        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setWebsites(rows);
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setWebsitesError(e?.message || "Failed to load websites.");
      } finally {
        setLoadingWebsites(false);
      }
    }

    loadWebsites();
  }, [uid]);

  // 4) Compute allowed websites for SEO (Free plan default)
  const websitesIncluded = seoModule?.websitesIncluded ?? 1;
  const extraWebsitesPurchased = seoModule?.extraWebsitesPurchased ?? 0;
  const allowedWebsites = websitesIncluded + extraWebsitesPurchased;
  const currentWebsiteCount = websites.length;
  const canAddWebsite =
    !loadingSeoModule && currentWebsiteCount < allowedWebsites;

  async function handleAddWebsite(e) {
    e.preventDefault();
    setMsg("");

    if (!uid) return;

    const cleanName = name.trim();
    const cleanDomain = domain.trim().toLowerCase();

    if (!cleanName || !cleanDomain) {
      setMsg("Please enter both Website Name and Domain.");
      return;
    }

    if (!canAddWebsite) {
      setMsg(
        `Website limit reached for your plan. Allowed: ${allowedWebsites}.`
      );
      return;
    }

    setSaving(true);
    try {
      const colRef = collection(db, "users", uid, "websites");
      const token = await auth.currentUser.getIdToken();

      const resp = await fetch("/api/websites/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: cleanName,
          domain: cleanDomain,
        }),
      });

   let data = {};
try {
  data = await resp.json();
} catch (e) {
  data = {};
}


      if (!resp.ok || !data?.ok) {
        const err = data?.error || "Add website failed.";
        if (err === "WEBSITE_LIMIT_REACHED") {
          setMsg(
            `Website limit reached for your plan. Allowed: ${allowedWebsites}.`
          );
        } else {
          setMsg(err);
        }
        return;
      }


      setName("");
      setDomain("");
      setMsg("Website added.");

      // Refresh list
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWebsites(rows);
    } catch (e) {
      console.error("Add website failed:", e);
      setMsg(e?.message || "Add website failed.");
    } finally {
      setSaving(false);
    }
  }
function startEditProfile(site) {
  setProfileMsg("");
  setEditingSiteId(site.id);

  const p = site.profile || {};
  setPBrandDescription(p.brandDescription || "");
  setPTargetAudience(p.targetAudience || "");
  setPToneOfVoice(Array.isArray(p.toneOfVoice) ? p.toneOfVoice.join(", ") : "");
  setPReadingLevel(p.readingLevel || "");
  setPGeoTarget(p.geoTarget || "");
  setPIndustry(p.industry || "");
}

async function handleSaveProfile(e) {
  e.preventDefault();
  setProfileMsg("");

  if (!uid || !editingSiteId) return;

  setSavingProfile(true);
  try {
    const ref = doc(db, "users", uid, "websites", editingSiteId);

    const toneArray = pToneOfVoice
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const token = await auth.currentUser.getIdToken();

    const resp = await fetch("/api/websites/updateProfile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteId: editingSiteId,
        profile: {
          brandDescription: pBrandDescription.trim(),
          targetAudience: pTargetAudience.trim(),
          toneOfVoice: toneArray,
          readingLevel: pReadingLevel.trim(),
          geoTarget: pGeoTarget.trim(),
          industry: pIndustry.trim(),
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok || !data?.ok) {
   setProfileMsg(data?.error || "Failed to save profile.");
      return;
    }


    setWebsites((prev) =>
      prev.map((w) =>
        w.id === editingSiteId
          ? {
              ...w,
              profile: {
                ...(w.profile || {}),
                brandDescription: pBrandDescription.trim(),
                targetAudience: pTargetAudience.trim(),
                toneOfVoice: toneArray,
                readingLevel: pReadingLevel.trim(),
                geoTarget: pGeoTarget.trim(),
                industry: pIndustry.trim(),
              },
            }
          : w
      )
    );

    setProfileMsg("Profile saved.");
  } catch (e) {
    console.error("Save profile failed:", e);
    setProfileMsg(e?.message || "Save profile failed.");
  } finally {
    setSavingProfile(false);
  }
}

  return (
    <AuthGate>
      <VyndowShell activeModule="websites">
        <main className="page">
          <header style={{ marginBottom: "20px" }}>
            <span className="badge">Phase 8 — Website Manager (Firestore)</span>
            <h1>Websites &amp; Clients</h1>
            <p className="sub">
              Add and manage websites. Your plan controls how many websites you
              can create.
            </p>
          </header>

          <section style={{ marginBottom: 18 }}>
            <h2>SEO Plan Limits (for this account)</h2>

            {loadingSeoModule ? (
              <p style={{ color: "#6b7280" }}>Loading plan…</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <div>
                  <b>Plan:</b> {seoModule?.plan || "free"}
                </div>
                <div>
                  <b>Websites allowed:</b> {allowedWebsites}{" "}
                  <span style={{ color: "#6b7280" }}>
                    ({websitesIncluded} included + {extraWebsitesPurchased} add-on)
                  </span>
                </div>
                <div>
                  <b>Current websites:</b> {currentWebsiteCount}
                </div>
              </div>
            )}
          </section>

          <section style={{ marginBottom: 18 }}>
            <h2>Add Website</h2>

            {!canAddWebsite && !loadingSeoModule ? (
              <p style={{ color: "#b91c1c" }}>
                Website limit reached. You can’t add more websites on this plan.
              </p>
            ) : null}

            <form
              onSubmit={handleAddWebsite}
              style={{
                display: "grid",
                gap: 10,
                maxWidth: 520,
                padding: 14,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Website Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anatta"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Domain</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. anatta.in"
                />
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="submit"
                  disabled={saving || loadingSeoModule || !canAddWebsite}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "999px",
                    border: "1px solid #e5e7eb",
                    background: "#f9fafb",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {saving ? "Adding…" : "+ Add Website"}
                </button>

                {msg ? (
                  <span style={{ color: msg === "Website added." ? "#065f46" : "#b91c1c" }}>
                    {msg}
                  </span>
                ) : null}
              </div>
            </form>
          </section>

          <section>
            <h2>Current Websites</h2>

            {websitesError ? (
              <p style={{ color: "#b91c1c" }}>{websitesError}</p>
            ) : null}

            {loadingWebsites ? (
              <p style={{ color: "#6b7280" }}>Loading websites…</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.9rem",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>Website / Brand</th>
                      <th style={headerCellStyle}>Domain</th>
                      <th style={headerCellStyle}>Created</th>
                  <th style={headerCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((site) => (
                      <tr key={site.id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 600 }}>{site.name}</div>
                        </td>
                        <td style={cellStyle}>
                          <code>{site.domain}</code>
                        </td>
                        <td style={cellStyle}>
                          {site.createdAt?.toDate
                            ? site.createdAt.toDate().toLocaleString()
                            : "—"}
                        </td>
                       <td style={cellStyle}>
  <button
    type="button"
    onClick={() => startEditProfile(site)}
    style={{
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    Edit Profile
  </button>
</td>
           
                      </tr>
                    ))}
                    {!websites.length ? (
                      <tr>
                        <td style={cellStyle} colSpan={4}>
                          No websites yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>
              {editingSiteId ? (
  <section style={{ marginTop: 18 }}>
    <h2>Edit Website Profile</h2>
    <p style={{ color: "#6b7280" }}>
      These are your saved defaults for this website. You can still override
      Brand Description / Tone / Reading Level per blog inside the SEO page.
    </p>

    <form
      onSubmit={handleSaveProfile}
style={{
  display: "grid",
  gap: 10,
  maxWidth: 760,
  padding: 22,
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
}}

    >
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Brand Description</span>
        <textarea
style={{ width: "100%", minHeight: 120 }}
          value={pBrandDescription}
          onChange={(e) => setPBrandDescription(e.target.value)}
          rows={6}
          placeholder="Describe the brand in 2–5 lines."
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Target Audience</span>
        <input
          value={pTargetAudience}
          onChange={(e) => setPTargetAudience(e.target.value)}
          placeholder="e.g. CFOs at mid-to-large enterprises"
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Tone of Voice (comma separated)</span>
     <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
  {[
    "Warm & Empathetic",
    "Expert & Authoritative",
    "Educational & Insightful",
    "Conversational & Easy-to-read",
  ].map((label) => {
    const selected = (pToneOfVoice || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const isChecked = selected.includes(label);

    return (
      <label key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => {
            const next = e.target.checked
              ? [...selected, label]
              : selected.filter((x) => x !== label);

            setPToneOfVoice(next.join(", "));
          }}
        />
        {label}
      </label>
    );
  })}
</div>

      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Reading Level</span>
<select
  value={pReadingLevel || "Grade 8–9 (Standard blog readability)"}
  onChange={(e) => setPReadingLevel(e.target.value)}
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
  }}
>
  <option value="Grade 6–7 (Very easy)">Grade 6–7 (Very easy)</option>
  <option value="Grade 8–9 (Standard blog readability)">Grade 8–9 (Standard blog readability)</option>
  <option value="Grade 10–12 (Advanced)">Grade 10–12 (Advanced)</option>
  <option value="Expert / Professional audience">Expert / Professional audience</option>
</select>

        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Geo Target (locked in SEO)</span>
          <input
            value={pGeoTarget}
            onChange={(e) => setPGeoTarget(e.target.value)}
            placeholder="e.g. India"
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Industry (locked in SEO)</span>
   <select
  value={pIndustry}
  onChange={(e) => setPIndustry(e.target.value)}
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
  }}
>
 <option value="">Select an industry</option>
<option value="general">General (not set)</option>
<option value="health_recovery">Rehab, Mental Health & Recovery</option>
<option value="healthcare_clinic">Healthcare / Medical Clinic</option>
<option value="finance">Finance / Investing / Banking</option>
<option value="legal">Legal / Law Firms</option>
<option value="education">Education / EdTech / Coaching</option>
<option value="ecommerce_fmcg">Ecommerce, FMCG & Retail</option>
<option value="travel_hospitality">Travel, Tourism & Hospitality</option>
<option value="saas_tech">Technology / B2B SaaS / Software</option>
<option value="entertainment_media">Entertainment, Media & Creators</option>
<option value="real_estate_home">Real Estate & Home Services</option>
<option value="spirituality_wellness">Spirituality, Wellness & Faith</option>
<option value="other">Other</option>

</select>


      </label>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="submit"
          disabled={savingProfile}
          style={{
            padding: "10px 14px",
            borderRadius: "999px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: savingProfile ? "not-allowed" : "pointer",
          }}
        >
          {savingProfile ? "Saving…" : "Save Profile"}
        </button>

        <button
          type="button"
          onClick={() => {
            setEditingSiteId(null);
            setProfileMsg("");
          }}
          style={{
            padding: "10px 14px",
            borderRadius: "999px",
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close
        </button>

        {profileMsg ? (
          <span style={{ color: profileMsg === "Profile saved." ? "#065f46" : "#b91c1c" }}>
            {profileMsg}
          </span>
        ) : null}
      </div>
    </form>
  </section>
) : null}

        </main>
      </VyndowShell>
    </AuthGate>
  );
}
