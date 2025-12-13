// app/VyndowShell.jsx
"use client";

import { useState } from "react";

export default function VyndowShell({ activeModule, children }) {
  const year = new Date().getFullYear();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  function closeMobileSidebar() {
    setIsMobileOpen(false);
  }

  return (
    <div className="app-shell">
      {/* LEFT: Global sidebar */}
      <aside
        className={`sidebar ${isMobileOpen ? "sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        {/* Brand block */}
        <div className="sidebar-brand">
          <div className="sidebar-logo-circle">V</div>
          <div className="sidebar-brand-text">
            <div className="sidebar-title">Vyndow</div>
            <div className="sidebar-subtitle">CMO Suite (Beta)</div>
          </div>
        </div>

        {/* Quick Actions */}
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
    Create and manage all your websites, brands and clients in one
    place.
  </span>
</a>


          <div className="sidebar-link sidebar-link-muted">
            <span className="sidebar-link-main">Invite Team</span>
            <span className="sidebar-pill sidebar-pill-soft">Owner only</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Add up to 2 more users to collaborate on Vyndow.
            </span>
          </div>

          <div className="sidebar-link sidebar-link-muted">
            <span className="sidebar-link-main">Billing &amp; Plans</span>
            <span className="sidebar-pill sidebar-pill-soft">Owner only</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Manage subscriptions, per-website modules and usage limits.
            </span>
          </div>
        </div>

        {/* Vyndow Suite */}
        <div className="sidebar-section">
          <div className="sidebar-section-label">Vyndow Suite</div>

          {/* Vyndow SEO – Live */}
          <a
            href="/seo"
            className={`sidebar-link${
              activeModule === "seo" ? " is-active" : ""
            }`}
            onClick={closeMobileSidebar}
          >
            <span className="sidebar-link-main">Vyndow SEO</span>
            <span className="sidebar-pill sidebar-pill-live">Live</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Plan and generate publishing ready SEO-optimized blogs.
            </span>
          </a>

          {/* Other modules – Coming Soon */}
          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow GEO</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Audit and get your website optimized for AI Search.
            </span>
          </div>

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

          <div className="sidebar-link is-soon">
            <span className="sidebar-link-main">Vyndow Social</span>
            <span className="sidebar-pill sidebar-pill-soon">Soon</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              Strategize, plan, implement and analyze your social media
              presence.
            </span>
          </div>

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
            <span className="sidebar-link-main">
              Vyndow CMO (Command Center)
            </span>
            <span className="sidebar-pill sidebar-pill-soon">Vision</span>
            <span className="sidebar-info">i</span>
            <span className="sidebar-tip">
              High-level view of channels, spend and performance for the CMO.
            </span>
          </div>
        </div>

               {/* Sidebar footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-title">Vyndow Terms</div>

          <div className="sidebar-footer-links">
            <a href="#">Terms of Use</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Refund &amp; Cancellation Policy</a>
            <a href="#">Contact Us</a>
            <a href="#">About Vyndow</a>
          </div>

          <div className="sidebar-footer-meta">
            © {year} Vyndow
          </div>
        </div>
      </aside>

      {/* BACKDROP on mobile when sidebar is open */}
      {isMobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* RIGHT: main content + mobile hamburger button */}
      <div className="main-panel">
        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={() => setIsMobileOpen(true)}
        >
          ☰ Menu
        </button>

        {children}
      </div>
    </div>
  );
}
