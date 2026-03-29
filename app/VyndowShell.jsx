// app/VyndowShell.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "./firebaseClient";

const ADVISOR_FALLBACK_MESSAGE = "I’m having trouble responding right now. Please try again.";

export default function VyndowShell({ activeModule, children }) {
  const year = new Date().getFullYear();
   const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);
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

  const advisorSuggestions = useMemo(() => {
    const suggestionMap = {
      strategy: [
        "What does my keyword architecture mean?",
        "Which pages should I build first?",
        "What is topical authority?",
      ],
      seo: [
        "Why was this blog topic selected?",
        "How do I publish this content?",
        "What is article schema?",
      ],
      geo: [
        "What is GEO?",
        "How is GEO different from SEO?",
        "How does AI search decide what to show?",
      ],
      backlinks: [
        "What is my BAM score?",
        "How do I get this backlink?",
        "Why are backlinks important?",
      ],
      ogi: [
        "What is my biggest SEO gap?",
        "How do I read this performance report?",
        "What should I do next?",
      ],
    };

    return suggestionMap[advisorModule?.id] || [];
  }, [advisorModule]);

  const [advisorMessages, setAdvisorMessages] = useState([]);
  const [advisorInput, setAdvisorInput] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const conversationScrollRef = useRef(null);
  const [organicOpen, setOrganicOpen] = useState(false);
  const organicExpanded = organicOpen || isOrganicRoute;

  useEffect(() => {
    if (conversationScrollRef.current) {
      conversationScrollRef.current.scrollTop = conversationScrollRef.current.scrollHeight;
    }
  }, [advisorMessages, advisorLoading]);

  function closeMobileSidebar() {
    setIsMobileOpen(false);
  }

  function openAdvisorPanel() {
    setIsAdvisorOpen(true);
  }

  async function sendAdvisorMessage(rawMessage) {
    const content = String(rawMessage || "").trim();
    if (!content || advisorLoading) return;

    const nextUserMessage = { role: "user", content };
    setAdvisorMessages((prev) => [...prev, nextUserMessage]);
    setAdvisorInput("");
    setAdvisorLoading(true);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Missing user token.");

      const response = await fetch("/api/advisor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: content,
          moduleId: advisorModule.id,
          moduleLabel: advisorModule.label,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Advisor request failed.");
      }

      const reply = String(data?.reply || "").trim() || ADVISOR_FALLBACK_MESSAGE;
      setAdvisorMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (error) {
      console.error("advisor send failed", error);
      setAdvisorMessages((prev) => [
        ...prev,
        { role: "assistant", content: ADVISOR_FALLBACK_MESSAGE },
      ]);
    } finally {
      setAdvisorLoading(false);
    }
  }

  async function handleAdvisorChipClick(chip) {
    await sendAdvisorMessage(chip);
  }

  async function handleAdvisorSubmit() {
    await sendAdvisorMessage(advisorInput);
  }

  async function handleAdvisorInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleAdvisorSubmit();
    }
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
          <>
            {!isAdvisorOpen && (
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
                  Vyndow Organic Advisor preview<br />
                  Active module: {advisorModule.label}
                </div>

                <button
                  type="button"
                  aria-label="Open Vyndow Organic Advisor"
                  onClick={openAdvisorPanel}
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
                >
                  VOA
                </button>
              </div>
            )}

            {isAdvisorOpen && (
              <div
                style={{
                  position: "fixed",
                  right: 20,
                  bottom: 20,
                  width: "min(380px, calc(100vw - 24px))",
                  maxHeight: "70vh",
                  background: "#fff",
                  border: "1px solid rgba(15,23,42,0.08)",
                  borderRadius: 18,
                  boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
                  zIndex: 1250,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(15,23,42,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#111827",
                        lineHeight: 1.2,
                      }}
                    >
                      Vyndow Organic Advisor
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#6b7280",
                      }}
                    >
                      {advisorModule.label}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAdvisorOpen(false)}
                    aria-label="Close advisor"
                    style={{
                      border: "1px solid rgba(15,23,42,0.08)",
                      background: "#fff",
                      color: "#374151",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  ref={conversationScrollRef}
                  style={{
                    padding: 16,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  {advisorMessages.length === 0 ? (
                    <>
                      <div
                        style={{
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: "#374151",
                        }}
                      >
                        Welcome to the Vyndow Organic Advisor. I can help explain this module,
                        guide you on what things mean, and point you to the next useful step.
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {advisorSuggestions.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleAdvisorChipClick(chip)}
                            disabled={advisorLoading}
                            style={{
                              border: "1px solid rgba(30,102,255,0.16)",
                              background: "rgba(30,102,255,0.06)",
                              color: "#1e40af",
                              borderRadius: 999,
                              padding: "8px 12px",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: advisorLoading ? "not-allowed" : "pointer",
                              opacity: advisorLoading ? 0.7 : 1,
                            }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div
                    style={{
                      minHeight: 180,
                      border: "1px solid rgba(15,23,42,0.08)",
                      borderRadius: 14,
                      background: "#f8fafc",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {advisorMessages.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          color: "#6b7280",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        Start with a suggested question or type your own organic growth question below.
                      </div>
                    ) : (
                      advisorMessages.map((message, index) => {
                        const isUser = message.role === "user";

                        return (
                          <div
                            key={`${message.role}-${index}`}
                            style={{
                              display: "flex",
                              justifyContent: isUser ? "flex-end" : "flex-start",
                            }}
                          >
                            <div
                              style={{
                                maxWidth: "88%",
                                borderRadius: 14,
                                padding: "10px 12px",
                                fontSize: 13,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                background: isUser ? "#1e66ff" : "#ffffff",
                                color: isUser ? "#ffffff" : "#111827",
                                border: isUser ? "none" : "1px solid rgba(15,23,42,0.08)",
                                boxShadow: isUser ? "none" : "0 4px 14px rgba(15,23,42,0.05)",
                              }}
                            >
                              {message.content}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {advisorLoading && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "88%",
                            borderRadius: 14,
                            padding: "10px 12px",
                            fontSize: 13,
                            lineHeight: 1.6,
                            background: "#ffffff",
                            color: "#6b7280",
                            border: "1px solid rgba(15,23,42,0.08)",
                            boxShadow: "0 4px 14px rgba(15,23,42,0.05)",
                          }}
                        >
                          Thinking…
                        </div>
                      </div>
                    )}
                  </div>
                </div>


</div>

<div
  style={{
                    padding: 16,
                    borderTop: "1px solid rgba(15,23,42,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Ask about this module..."
                      value={advisorInput}
                      onChange={(event) => setAdvisorInput(event.target.value)}
                      onKeyDown={handleAdvisorInputKeyDown}
                      disabled={advisorLoading}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 12,
                        border: "1px solid rgba(15,23,42,0.12)",
                        padding: "0 12px",
                        fontSize: 14,
                        color: "#111827",
                        background: advisorLoading ? "#f3f4f6" : "#ffffff",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAdvisorSubmit}
                      disabled={advisorLoading || !advisorInput.trim()}
                      style={{
                        height: 42,
                        border: "none",
                        borderRadius: 12,
                        background: advisorLoading || !advisorInput.trim() ? "#dbeafe" : "#1e66ff",
                        color: advisorLoading || !advisorInput.trim() ? "#1e3a8a" : "#ffffff",
                        padding: "0 14px",
                        fontWeight: 800,
                        cursor: advisorLoading || !advisorInput.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      Send
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    AI-generated advice. Always verify important decisions.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
