"use client";

export function GeoCard({ title, right, children, style }) {
  return (
    <div className="geo-card" style={style}>
      {(title || right) ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div className="geo-card-title">{title}</div>
          {right ? <div>{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function GeoPill({ variant = "processing", children }) {
  const cls =
    variant === "analyzed"
      ? "geo-pill geo-pill-analyzed"
      : variant === "error"
      ? "geo-pill geo-pill-error"
      : "geo-pill geo-pill-processing";

  return <span className={cls}>{children}</span>;
}

export function GeoKpis({ items = [] }) {
  return (
    <div className="geo-kpis">
      {items.map((it) => (
        <div className="geo-kpi" key={it.label}>
          <div className="geo-kpi-label">{it.label}</div>
          <div className="geo-kpi-value">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
