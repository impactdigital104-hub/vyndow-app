"use client";

// app/websites/page.js

import { useEffect, useMemo, useState } from "react";
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

export default function WebsitesPage() {
  const [uid, setUid] = useState(null);

  const [websites, setWebsites] = useState([]);
  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [websitesError, setWebsitesError] = useState("");

  const [seoModule, setSeoModule] = useState(null);
  const [loadingSeoModule, setLoadingSeoModule] = useState(false);
  const [userSeoEntitlements, setUserSeoEntitlements] = useState(null);
  const [userGeoEntitlements, setUserGeoEntitlements] = useState(null);
  const [loadingUserEntitlements, setLoadingUserEntitlements] = useState(true);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingSiteId, setEditingSiteId] = useState(null);

  const [pBrandDescription, setPBrandDescription] = useState("");
  const [pTargetAudience, setPTargetAudience] = useState("");
  const [pToneOfVoice, setPToneOfVoice] = useState("");
  const [pReadingLevel, setPReadingLevel] = useState("");
  const [pGeoTarget, setPGeoTarget] = useState("");
  const [pIndustry, setPIndustry] = useState("");

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  const [gscBySite, setGscBySite] = useState({});
  const [loadingGscState, setLoadingGscState] = useState(false);
  const [gscBlockMsg, setGscBlockMsg] = useState("");
  const [gscBlockMsgColor, setGscBlockMsgColor] = useState("#065f46");
  const [startingGscForSiteId, setStartingGscForSiteId] = useState("");
  const [disconnectingGscForSiteId, setDisconnectingGscForSiteId] = useState("");
  const [loadingGscProperties, setLoadingGscProperties] = useState(false);
  const [gscProperties, setGscProperties] = useState([]);
  const [selectedGscProperty, setSelectedGscProperty] = useState("");
  const [connectingPropertyForSiteId, setConnectingPropertyForSiteId] = useState("");
  const [autoOpenedFromGoogle, setAutoOpenedFromGoogle] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    async function loadSeoModulesForWebsites() {
      setLoadingSeoModule(true);
      try {
        if (!websites || websites.length === 0) {
          setSeoModule({});
          return;
        }

        const map = {};
        for (const w of websites) {
          const ref = doc(db, "users", uid, "websites", w.id, "modules", "seo");
          const snap = await getDoc(ref);
          map[w.id] = snap.exists() ? snap.data() : null;
        }

        setSeoModule(map);
      } catch (e) {
        console.error("Failed to load SEO modules:", e);
        setSeoModule({});
      } finally {
        setLoadingSeoModule(false);
      }
    }

    loadSeoModulesForWebsites();
  }, [uid, websites]);

  useEffect(() => {
    if (!uid) return;

    async function loadUserEntitlements() {
      setLoadingUserEntitlements(true);
      try {
        const seoRef = doc(db, "users", uid, "modules", "seo");
        const seoSnap = await getDoc(seoRef);
        setUserSeoEntitlements(seoSnap.exists() ? seoSnap.data() : null);

        const geoRef = doc(db, "users", uid, "modules", "geo");
        const geoSnap = await getDoc(geoRef);
        setUserGeoEntitlements(geoSnap.exists() ? geoSnap.data() : null);
      } catch (e) {
        console.error("Failed to load user SEO entitlements:", e);
        setUserSeoEntitlements(null);
      } finally {
        setLoadingUserEntitlements(false);
      }
    }

    loadUserEntitlements();
  }, [uid]);

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

  useEffect(() => {
    if (!uid) return;

    async function loadGscState() {
      setLoadingGscState(true);
      try {
        if (!websites || websites.length === 0) {
          setGscBySite({});
          return;
        }

        const map = {};
        for (const site of websites) {
          const gscRef = doc(db, "users", uid, "websites", site.id, "integrations", "gsc");
          const gscSnap = await getDoc(gscRef);
          map[site.id] = gscSnap.exists() ? gscSnap.data() : { connected: false };
        }
        setGscBySite(map);
      } catch (e) {
        console.error("Failed to load GSC state:", e);
        setGscBySite({});
      } finally {
        setLoadingGscState(false);
      }
    }

    loadGscState();
  }, [uid, websites]);

  const plan = userSeoEntitlements?.plan ?? "free";
  const websitesIncluded = userSeoEntitlements?.websitesIncluded ?? 1;
  const extraWebsitesPurchased = userSeoEntitlements?.extraWebsitesPurchased ?? 0;
  const allowedWebsites = websitesIncluded + extraWebsitesPurchased;
  const currentWebsiteCount = websites.length;
  const canAddWebsite = !loadingUserEntitlements && currentWebsiteCount < allowedWebsites;

  const editingSite = useMemo(
    () => websites.find((w) => w.id === editingSiteId) || null,
    [websites, editingSiteId]
  );

  useEffect(() => {
    if (loadingWebsites || !websites.length || autoOpenedFromGoogle) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const gscWebsiteId = params.get("gscWebsiteId") || "";
    const gscAuth = params.get("gscAuth") || "";
    const gscMessage = params.get("gscMessage") || "";

    if (!gscWebsiteId) return;

    const site = websites.find((w) => w.id === gscWebsiteId);
    if (site) {
      startEditProfile(site);
    }

    if (gscAuth === "success") {
      setGscBlockMsg("Google account connected. Now choose the matching Search Console property below.");
      setGscBlockMsgColor("#065f46");
      void loadGscPropertiesForSite(gscWebsiteId, true);
    } else if (gscAuth === "error") {
      setGscBlockMsg(gscMessage || "Google connection could not be completed.");
      setGscBlockMsgColor("#b91c1c");
    }

    window.history.replaceState({}, "", "/websites");
    setAutoOpenedFromGoogle(true);
  }, [loadingWebsites, websites, autoOpenedFromGoogle]);

  function startEditProfile(site) {
    setProfileMsg("");
    setGscBlockMsg("");
    setEditingSiteId(site.id);

    const p = site.profile || {};
    setPBrandDescription(p.brandDescription || "");
    setPTargetAudience(p.targetAudience || "");
    setPToneOfVoice(Array.isArray(p.toneOfVoice) ? p.toneOfVoice.join(", ") : "");
    setPReadingLevel(p.readingLevel || "");
    setPGeoTarget(p.geoTarget || "");
    setPIndustry(p.industry || "");
    setGscProperties([]);
    setSelectedGscProperty("");
  }

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
        "You have reached your website limit. Purchase an additional website for $10 to add more clients."
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
            "You have reached your website limit. Purchase an additional website for $10 to add more clients."
          );
        } else {
          setMsg(err);
        }
        return;
      }

      setName("");
      setDomain("");
      setMsg("Website added.");

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

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg("");

    if (!uid || !editingSiteId) return;

    setSavingProfile(true);
    try {
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

  async function handleStartGscConnect(siteId) {
    if (!siteId) return;

    setGscBlockMsg("");
    setStartingGscForSiteId(siteId);
    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch("/api/gsc/startAuth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ websiteId: siteId }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.ok || !data?.authUrl) {
        setGscBlockMsg(data?.error || "Could not start Google Search Console connection.");
        setGscBlockMsgColor("#b91c1c");
        return;
      }

      window.location.href = data.authUrl;
    } catch (e) {
      console.error("Start GSC connect failed:", e);
      setGscBlockMsg(e?.message || "Could not start Google Search Console connection.");
      setGscBlockMsgColor("#b91c1c");
    } finally {
      setStartingGscForSiteId("");
    }
  }

  async function loadGscPropertiesForSite(siteId, silentSuccess = false) {
    if (!siteId) return;

    setLoadingGscProperties(true);
    if (!silentSuccess) {
      setGscBlockMsg("");
    }

    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch(`/api/gsc/listProperties?websiteId=${encodeURIComponent(siteId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        setGscProperties([]);
        setSelectedGscProperty("");
        setGscBlockMsg(data?.error || "Could not load Google Search Console properties.");
        setGscBlockMsgColor("#b91c1c");
        return;
      }

      setGscProperties(Array.isArray(data?.properties) ? data.properties : []);

      const firstMatching = (Array.isArray(data?.properties) ? data.properties : []).find(
        (row) => row?.matchesWebsite
      );
      setSelectedGscProperty(firstMatching?.propertyValue || "");

      if (!silentSuccess) {
        setGscBlockMsg("Search Console properties loaded. Choose the matching property for this website.");
        setGscBlockMsgColor("#065f46");
      }
    } catch (e) {
      console.error("Load GSC properties failed:", e);
      setGscProperties([]);
      setSelectedGscProperty("");
      setGscBlockMsg(e?.message || "Could not load Google Search Console properties.");
      setGscBlockMsgColor("#b91c1c");
    } finally {
      setLoadingGscProperties(false);
    }
  }

  async function handleConnectSelectedProperty(siteId) {
    if (!siteId) return;
    if (!selectedGscProperty) {
      setGscBlockMsg("Please choose a Google Search Console property first.");
      setGscBlockMsgColor("#b91c1c");
      return;
    }

    setConnectingPropertyForSiteId(siteId);
    setGscBlockMsg("");

    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch("/api/gsc/connectProperty", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          websiteId: siteId,
          propertyValue: selectedGscProperty,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        setGscBlockMsg(
          data?.error ||
            "The selected Google Search Console property could not be connected."
        );
        setGscBlockMsgColor("#b91c1c");
        return;
      }

      const saved = {
        connected: true,
        propertyValue: selectedGscProperty,
      };

      setGscBySite((prev) => ({
        ...prev,
        [siteId]: {
          ...(prev[siteId] || {}),
          ...saved,
        },
      }));

      setGscBlockMsg(`Google Search Console connected to: ${selectedGscProperty}`);
      setGscBlockMsgColor("#065f46");
    } catch (e) {
      console.error("Connect selected GSC property failed:", e);
      setGscBlockMsg(e?.message || "Could not connect the selected Search Console property.");
      setGscBlockMsgColor("#b91c1c");
    } finally {
      setConnectingPropertyForSiteId("");
    }
  }

  async function handleDisconnectGsc(siteId) {
    if (!siteId) return;

    setDisconnectingGscForSiteId(siteId);
    setGscBlockMsg("");

    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch("/api/gsc/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ websiteId: siteId }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        setGscBlockMsg(data?.error || "Could not disconnect Google Search Console.");
        setGscBlockMsgColor("#b91c1c");
        return;
      }

      setGscBySite((prev) => ({
        ...prev,
        [siteId]: {
          connected: false,
          propertyValue: "",
          propertyType: "",
          matchedDomain: "",
        },
      }));
      setGscProperties([]);
      setSelectedGscProperty("");
      setGscBlockMsg("Google Search Console connection removed for this website.");
      setGscBlockMsgColor("#065f46");
    } catch (e) {
      console.error("Disconnect GSC failed:", e);
      setGscBlockMsg(e?.message || "Could not disconnect Google Search Console.");
      setGscBlockMsgColor("#b91c1c");
    } finally {
      setDisconnectingGscForSiteId("");
    }
  }

  return (
    <AuthGate>
      <VyndowShell activeModule="websites">
        <main className="page">
          <header style={{ marginBottom: "20px" }}>
            <span className="badge">This is where you can control your brand voice</span>
            <h1>Websites &amp; Clients</h1>
            <p className="sub">
              Start the process by adding websites and managing them. Your plan controls how many websites you
              can create. You can buy more websites if you need to.
            </p>
          </header>

          <section style={{ marginBottom: 18 }}>
            <h2 style={{ color: "#6D28D9" }}>Website Plan Limits (for this account)</h2>

            {loadingUserEntitlements ? (
              <p style={{ color: "#6b7280" }}>Loading plan…</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                <div>
                  <b>Plan:</b> {plan}
                </div>
                <div>
                  <b>Websites allowed:</b> {allowedWebsites}{" "}
                  <span style={{ color: "#6b7280" }}>
                    ({websitesIncluded} included + {extraWebsitesPurchased} additional website purchase)
                  </span>
                </div>
                <div>
                  <b>Current websites:</b> {currentWebsiteCount}
                </div>
              </div>
            )}
          </section>

          <section style={{ marginBottom: 18 }}>
            <h2 style={{ color: "#6D28D9" }}>Add Website</h2>

            {!canAddWebsite && !loadingUserEntitlements ? (
              <p style={{ color: "#b91c1c" }}>
                You have reached your website limit.
                <br />
                Purchase an additional website for $10 to add more clients.
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
                  disabled={saving || loadingUserEntitlements || !canAddWebsite}
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
            <h2 style={{ color: "#6D28D9" }}>Current Websites</h2>

            {websitesError ? <p style={{ color: "#b91c1c" }}>{websitesError}</p> : null}

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
                      <th style={headerCellStyle}>Google Search Console</th>
                      <th style={headerCellStyle}>Created</th>
                      <th style={headerCellStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((site) => {
                      const gscState = gscBySite[site.id] || { connected: false };

                      return (
                        <tr key={site.id}>
                          <td style={cellStyle}>
                            <div style={{ fontWeight: 600 }}>{site.name}</div>
                          </td>
                          <td style={cellStyle}>
                            <code>{site.domain}</code>
                          </td>
                          <td style={cellStyle}>
                            {loadingGscState ? (
                              <span style={{ color: "#6b7280" }}>Loading…</span>
                            ) : gscState?.connected ? (
                              <div style={{ display: "grid", gap: 4 }}>
                                <span style={{ color: "#065f46", fontWeight: 700 }}>Connected</span>
                                <span style={{ color: "#374151" }}>{gscState?.propertyValue || "—"}</span>
                              </div>
                            ) : (
                              <span style={{ color: "#6b7280" }}>Not connected</span>
                            )}
                          </td>
                          <td style={cellStyle}>
                            {site.createdAt?.toDate ? site.createdAt.toDate().toLocaleString() : "—"}
                          </td>
                          <td style={cellStyle}>
                            <button
                              type="button"
                              onClick={() => startEditProfile(site)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 999,
                                border: "0",
                                background: "#6D28D9",
                                color: "#fff",
                                cursor: "pointer",
                                fontWeight: 700,
                                boxShadow: "0 14px 30px rgba(109,40,217,0.18)",
                              }}
                            >
                              Edit Profile
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!websites.length ? (
                      <tr>
                        <td style={cellStyle} colSpan={5}>
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
              <h2 style={{ color: "#6D28D9" }}>Edit Website Profile</h2>
              <p style={{ color: "#6b7280" }}>
                These are your saved defaults for this website. You can still override Brand Description / Tone /
                Reading Level per blog inside the SEO page.
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
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: 16,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    background: "#faf5ff",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#4C1D95", marginBottom: 6 }}>
                      Google Search Console
                    </div>
                    <div style={{ color: "#5b6472", fontSize: "0.95rem" }}>
                      Organic Growth Intelligence can only analyze the same website that has been added in Vyndow.
                      Please connect the matching Google Search Console property.
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <div>
                      <b>Website in Vyndow:</b> {editingSite?.domain || "—"}
                    </div>
                    <div>
                      <b>Connection status:</b>{" "}
                      {gscBySite[editingSiteId]?.connected ? (
                        <span style={{ color: "#065f46", fontWeight: 700 }}>Connected</span>
                      ) : (
                        <span style={{ color: "#6b7280" }}>Not connected</span>
                      )}
                    </div>
                    {gscBySite[editingSiteId]?.connected ? (
                      <div>
                        <b>Connected property:</b> {gscBySite[editingSiteId]?.propertyValue || "—"}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => handleStartGscConnect(editingSiteId)}
                      disabled={startingGscForSiteId === editingSiteId}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "999px",
                        border: "0",
                        background: "#2563EB",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: startingGscForSiteId === editingSiteId ? "not-allowed" : "pointer",
                      }}
                    >
                      {startingGscForSiteId === editingSiteId
                        ? "Opening Google…"
                        : "Connect Google Search Console"}
                    </button>

                    <button
                      type="button"
                      onClick={() => loadGscPropertiesForSite(editingSiteId)}
                      disabled={loadingGscProperties}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "999px",
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        fontWeight: 600,
                        cursor: loadingGscProperties ? "not-allowed" : "pointer",
                      }}
                    >
                      {loadingGscProperties ? "Loading properties…" : "Reload Property List"}
                    </button>

                    {gscBySite[editingSiteId]?.connected ? (
                      <button
                        type="button"
                        onClick={() => handleDisconnectGsc(editingSiteId)}
                        disabled={disconnectingGscForSiteId === editingSiteId}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "999px",
                          border: "1px solid #fecaca",
                          background: "#fff1f2",
                          color: "#b91c1c",
                          fontWeight: 700,
                          cursor:
                            disconnectingGscForSiteId === editingSiteId ? "not-allowed" : "pointer",
                        }}
                      >
                        {disconnectingGscForSiteId === editingSiteId ? "Disconnecting…" : "Disconnect"}
                      </button>
                    ) : null}
                  </div>

                  {gscProperties.length ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: 14,
                        borderRadius: 12,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>Choose the property for this website</div>
                      <select
                        value={selectedGscProperty}
                        onChange={(e) => setSelectedGscProperty(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #d1d5db",
                        }}
                      >
                        <option value="">Select a Google Search Console property</option>
                        {gscProperties.map((row) => (
                          <option key={row.propertyValue} value={row.propertyValue}>
                            {row.propertyValue}
                            {row.matchesWebsite ? " — matches this website" : " — does not match"}
                          </option>
                        ))}
                      </select>

                      <div style={{ display: "grid", gap: 6 }}>
                        {gscProperties.map((row) => (
                          <div
                            key={`${row.propertyValue}-note`}
                            style={{
                              fontSize: "0.92rem",
                              color: row.matchesWebsite ? "#065f46" : "#b91c1c",
                            }}
                          >
                            {row.propertyValue} — {row.matchesWebsite ? "Matches this website" : "Does not match this website"}
                          </div>
                        ))}
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => handleConnectSelectedProperty(editingSiteId)}
                          disabled={connectingPropertyForSiteId === editingSiteId}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "999px",
                            border: "0",
                            background: "#059669",
                            color: "#fff",
                            fontWeight: 700,
                            cursor:
                              connectingPropertyForSiteId === editingSiteId ? "not-allowed" : "pointer",
                          }}
                        >
                          {connectingPropertyForSiteId === editingSiteId
                            ? "Saving connection…"
                            : "Use This Property"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {gscBlockMsg ? (
                    <div style={{ color: gscBlockMsgColor, fontWeight: 600 }}>{gscBlockMsg}</div>
                  ) : null}
                </div>

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
                      <option value="Grade 8–9 (Standard blog readability)">
                        Grade 8–9 (Standard blog readability)
                      </option>
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
                      padding: "10px 16px",
                      borderRadius: "999px",
                      border: "0",
                      background: savingProfile ? "#E5E7EB" : "#6D28D9",
                      color: savingProfile ? "#111827" : "#fff",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      cursor: savingProfile ? "not-allowed" : "pointer",
                      boxShadow: savingProfile ? "none" : "0 14px 30px rgba(109,40,217,0.18)",
                      opacity: savingProfile ? 0.9 : 1,
                    }}
                  >
                    {savingProfile ? "Saving…" : "Save Profile"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingSiteId(null);
                      setProfileMsg("");
                      setGscBlockMsg("");
                      setGscProperties([]);
                      setSelectedGscProperty("");
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
