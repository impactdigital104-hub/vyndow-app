// app/websites/page.js

import VyndowShell from "../VyndowShell";
import { sampleWebsites } from "../websitesData";

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
  return (
    <VyndowShell activeModule="websites">
      <main className="page">
        <header style={{ marginBottom: "20px" }}>
          <span className="badge">Phase 5 — Sample Data Only</span>
          <h1>Websites &amp; Clients</h1>
          <p className="sub">
            This is a read-only mock view of your websites/clients. In a later
            phase, this will connect to real brand profiles, plans and usage.
          </p>
        </header>

        <section>
          <h2>Current Websites (Mock Data)</h2>
          <p
            style={{
              marginBottom: "12px",
              fontSize: "0.9rem",
              color: "#4b5563",
            }}
          >
            For now, these entries are hard-coded in <code>websitesData.js</code>.
            We&apos;ll replace them with real data and forms in a later step.
          </p>

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
                  <th style={headerCellStyle}>Plan</th>
                  <th style={headerCellStyle}>Modules</th>
                  <th style={headerCellStyle}>Monthly Usage</th>
                  <th style={headerCellStyle}>Owner</th>
                  <th style={headerCellStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sampleWebsites.map((site) => (
                  <tr key={site.id}>
                    <td style={cellStyle}>
                      <div style={{ fontWeight: 600 }}>{site.name}</div>
                      {site.notes && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: "#6b7280",
                            marginTop: "2px",
                          }}
                        >
                          {site.notes}
                        </div>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <code>{site.domain}</code>
                    </td>
                    <td style={cellStyle}>{site.plan}</td>
                    <td style={cellStyle}>
                      {site.modules && site.modules.length > 0 ? (
                        <ul
                          style={{
                            listStyle: "disc",
                            margin: 0,
                            paddingLeft: "16px",
                          }}
                        >
                          {site.modules.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>None yet</span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      {site.usageLabel || (
                        <span style={{ color: "#9ca3af" }}>Not tracked</span>
                      )}
                    </td>
                    <td style={cellStyle}>{site.owner}</td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          background:
                            site.status === "Active"
                              ? "#d1fae5"
                              : site.status === "Trial"
                              ? "#fef3c7"
                              : "#e5e7eb",
                          color:
                            site.status === "Active"
                              ? "#065f46"
                              : site.status === "Trial"
                              ? "#92400e"
                              : "#374151",
                        }}
                      >
                        {site.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </VyndowShell>
  );
}
