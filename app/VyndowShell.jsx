// app/VyndowShell.jsx
"use client";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "./firebaseClient";

export default function VyndowShell({ activeModule, children }) {
  const year = new Date().getFullYear();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname() || "";
    const advisorEnabled = process.env.NEXT_PUBLIC_ORGANIC_ADVISOR_ENABLED === "true";
  const advisorAdminEmails = (process.env.NEXT_PUBLIC_ORGANIC_ADVISOR_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const currentUserEmail = auth.currentUser?.email?.toLowerCase?.() || "";
  const advisorVisible = advisorEnabled || (!!currentUserEmail && advisorAdminEmails.includes(currentUserEmail));

  const isSeoStrategyRoute = pathname.startsWith("/seo/strategy");
  const isBacklinksRoute =
    pathname === "/seo/backlinks" || pathname.startsWith("/seo/backlinks/");
  const isSeoRoute =
    pathname === "/seo" ||
    (pathname.startsWith("/seo/") && !isSeoStrategyRoute && !isBacklinksRoute);

  const isGeoRoute = pathname === "/geo" || pathname.startsWith("/geo/");
  const isOgiRoute =
    pathname === "/growth/intelligence" || pathname.startsWith("/growth/intelligence/");

  const isOrganicRoute =
    isSeoRoute || isSeoStrategyRoute || isGeoRoute || isBacklinksRoute || isOgiRoute;

  const advisorModule = useMemo(() => {
    if (isSeoStrategyRoute) {
      return { id: "strategy", label: "Strategy Engine" };
    }
    if (isSeoRoute) {
      return { id: "seo", label: "SEO Content Engine" };
    }
    if (isGeoRoute) {
      return { id: "geo", label: "GEO Visibility Engine" };
    }
    if (isBacklinksRoute) {
      return { id: "backlinks", label: "Backlink Authority" };
    }
    if (isOgiRoute) {
      return { id: "ogi", label: "Organic Growth Intelligence" };
    }
    return { id: "unknown", label: "Vyndow Organic" };
  }, [isSeoStrategyRoute, isSeoRoute, isGeoRoute, isBacklinksRoute, isOgiRoute]);

  const [organicOpen, setOrganicOpen] = useState(false);
  const organicExpanded = organicOpen || isOrganicRoute;

  function closeMobileSidebar() {
    setIsMobileOpen(false);
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      window.location.href = "/login";
    } catch (e) {
      console.error("Logout failed:", e);
      alert("Logout failed. Please try again.");
    }
  }

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${isMobileOpen ? "sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="sidebar-logo-circle">V</div>
          <div className="sidebar-brand-text">
            <div className="sidebar-title">Vyndow</div>
            <div className="sidebar-subtitle">CMO Suite (Beta)</div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Quick Actions</div>

          <a
            href="/websites"
            className={`sidebar-link sidebar-link-muted${
              activeModule === "websites" ? " is-active" : ""
            }`}
            onClick={closeMobileSidebar}
          >
            <span className="sidebar-link-main">Websites &amp; Clients</span>
            <span className="sidebar-pill sidebar-pill-soft">Global</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Create and manage all your websites, brands and clients in one place.
            </span>
          </a>

          <a
            href="/invite-team"
            className={`sidebar-link sidebar-link-muted${
              activeModule === "invite-team" ? " is-active" : ""
            }`}
            onClick={closeMobileSidebar}
          >
            <span className="sidebar-link-main">Invite Team</span>
            <span className="sidebar-pill sidebar-pill-soft">Owner only</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Add up to 2 more users to collaborate on Vyndow.
            </span>
          </a>

          <a href="/pricing" className="sidebar-link sidebar-link-muted">
            <span className="sidebar-link-main">Billing &amp; Plans</span>
            <span className="sidebar-pill sidebar-pill-soft">Owner only</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Manage subscriptions, per-website modules and usage limits.
            </span>
          </a>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Vyndow Suite</div>

          <button
            type="button"
            className="sidebar-link is-active"
            onClick={() => setOrganicOpen((v) => !v)}
            style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 14,
                display: "inline-flex",
                justifyContent: "center",
              }}
            >
              {organicExpanded ? "▾" : "▸"}
            </span>
            <span className="sidebar-link-main">Vyndow Organic - Live</span>
          </button>

          {organicExpanded && (
            <>
              <a
                href="/seo/strategy"
                className={`sidebar-link${isSeoStrategyRoute ? " is-active" : ""}`}
                onClick={closeMobileSidebar}
                style={{ paddingLeft: 26 }}
              >
                <span className="sidebar-link-main">Strategy</span>
                <span className="sidebar-pill sidebar-pill-live">Live</span>
                <span className="sidebar-info">i</span>
                <span className="sidebar-tip">
                  Build your SEO strategy: pages, keywords, mapping, and on-page blueprint.
                </span>
              </a>

              <a
                href="/seo"
                className={`sidebar-link${isSeoRoute ? " is-active" : ""}`}
                onClick={closeMobileSidebar}
                style={{ paddingLeft: 26 }}
              >
                <span className="sidebar-link-main">SEO</span>
                <span className="sidebar-pill sidebar-pill-live">Live</span>
                <span className="sidebar-info">i</span>
                <span className="sidebar-tip">
                  Plan and generate publishing ready SEO-optimized blogs.
                </span>
              </a>

              <a
                href="/geo"
                className={`sidebar-link${isGeoRoute ? " is-active" : ""}`}
                onClick={closeMobileSidebar}
                style={{ paddingLeft: 26 }}
              >
                <span className="sidebar-link-main">GEO</span>
                <span className="sidebar-pill sidebar-pill-live">Live</span>
                <span className="sidebar-info">i</span>
                <span className="sidebar-tip">
                  Audit and get your website optimized for AI Search.
                </span>
              </a>

              <a
                href="/seo/backlinks"
                className={`sidebar-link${isBacklinksRoute ? " is-active" : ""}`}
                onClick={closeMobileSidebar}
                style={{ paddingLeft: 26 }}
              >
                <span className="sidebar-link-main">Backlink Authority</span>
                <span className="sidebar-pill sidebar-pill-live">Live</span>
                <span className="sidebar-info">i</span>
                <span className="sidebar-tip">
                  Build backlink authority using a structured monthly action plan.
                </span>
              </a>

              <a
                href="/growth/intelligence"
                className={`sidebar-link${isOgiRoute ? " is-active" : ""}`}
                onClick={closeMobileSidebar}
                style={{ paddingLeft: 26 }}
              >
                <span className="sidebar-link-main">Organic Growth Intelligence</span>
                <span className="sidebar-pill sidebar-pill-live">Live</span>
                <span className="sidebar-info">i</span>
                <span className="sidebar-tip">
                  Generate intelligence report using GSC and Vyndow strategy context.
                </span>
              </a>
            </>
          )}

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow ABM</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Plan and implement account-based marketing for named accounts.
            </span>
          </div>

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow Ads</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Plan, optimize and analyze your performance marketing.
            </span>
          </div>

          <a
            href="/social"
            className="sidebar-link is-soon"
            onClick={closeMobileSidebar}
            title="Vyndow Social (internal)"
          >
            <span className="sidebar-link-main">Vyndow Social</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Strategize, plan, implement and analyze your social media presence.
            </span>
          </a>

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow Analytics</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Unified view and deep dive analytics of digital presence.
            </span>
          </div>

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow GTM</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Go-to-market launch blueprints for new products or campaigns.
            </span>
          </div>

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow CMO (Command Center)</span>
            <span className="sidebar-pill sidebar-pill-soon">Vision</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              High-level view of channels, spend and performance for the CMO.
            </span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Account</div>

          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-link"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              padding: 0,
              color: "inherit",
            }}
          >
            <span className="sidebar-link-main">Logout</span>
            <span className="sidebar-pill sidebar-pill-soft">Secure</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">Sign out of Vyndow on this device.</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-footer-title">Vyndow Terms</div>

          <div className="sidebar-footer-links">
            <a href="/terms" onClick={closeMobileSidebar}>Terms of Use</a>
            <a href="/privacy" onClick={closeMobileSidebar}>Privacy Policy</a>
            <a href="/refund" onClick={closeMobileSidebar}>Refund &amp; Cancellation Policy</a>
            <a href="/contact" onClick={closeMobileSidebar}>Contact Us</a>
            <a href="/about" onClick={closeMobileSidebar}>About Vyndow</a>
          </div>

          <div className="sidebar-footer-meta">
            © {year} Vyndow
          </div>
        </div>
      </aside>

      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      <div className="main-panel">
        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={() => setIsMobileOpen(true)}
        >
          ☰ Menu
        </button>

              {children}

        {advisorVisible && isOrganicRoute && (
          <div
            style={{
              position: "fixed",
              right: 20,
              bottom: 20,
              zIndex: 1200,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.4,
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(15,23,42,0.92)",
                color: "#fff",
                maxWidth: 220,
                boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
              }}
            >
              Vyndow Organic Advisor hidden preview<br />
              Active module: {advisorModule.label}
            </div>

            <button
              type="button"
              aria-label="Open Vyndow Organic Advisor"
              style={{
                width: 58,
                height: 58,
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 12,
                boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                background: "linear-gradient(135deg, #1e66ff 0%, #7c3aed 100%)",
                color: "#fff",
              }}
              onClick={() => {
                alert(`Vyndow Organic Advisor scaffold is active for ${advisorModule.label}. Full chat panel comes in the next stage.`);
              }}
            >
              VOA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
