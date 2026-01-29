"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthGate from "../../components/AuthGate";
import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function iso(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
    x.getDate()
  ).padStart(2, "0")}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function pick(arr) {
  if (!arr || arr.length === 0) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}
function weekdayLabel(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

const INTENTS = ["Educate", "Explain", "Provoke", "Proof", "Insight"];
const FORMATS = {
  linkedin: ["Text", "Carousel", "Document", "Poll", "Image", "Video"],
  instagram: ["Reel", "Image", "Video", "Carousel", "Static", "Story"],
};


// IMPORTANT: Suspense wrapper (required for useSearchParams in Next App Router)
export default function SocialCalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading calendar…</div>}>
      <SocialCalendarInner />
    </Suspense>
  );
}

function SocialCalendarInner() {
  const router = useRouter();
  const params = useSearchParams();

  const websiteId = useMemo(() => params?.get("websiteId") || "", [params]);

  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [platformFocus, setPlatformFocus] = useState("");
  const [themes, setThemes] = useState({ linkedin: [], instagram: [] });

  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [calendars, setCalendars] = useState({ linkedin: [], instagram: [] });

  const saveTimer = useRef(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUid(u?.uid || null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    async function load() {
      try {
        setLoading(true);

        if (!websiteId) {
          setLoading(false);
          return;
        }

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          router.replace(`/social/workshop?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        const data = snap.data();

        if (!data?.phase1Completed) {
          router.replace(`/social/workshop?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        if (!data?.phase2?.meta?.phase2Completed) {
          router.replace(`/social/themes?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        const focus = data.platformFocus || "";
        const themeSet = {
          linkedin: data?.phase2?.themes?.linkedin || [],
          instagram: data?.phase2?.themes?.instagram || [],
        };

        setPlatformFocus(focus);
        setThemes(themeSet);

        if (data?.phase3?.calendars) {
          setWindowStart(data.phase3.windowStart || "");
          setWindowEnd(data.phase3.windowEnd || "");
          setCalendars(data.phase3.calendars || { linkedin: [], instagram: [] });
        } else {
          generateInitial(focus, themeSet);
        }

        setLoading(false);
      } catch (e) {
        console.error("Calendar load error:", e);
        setLoading(false);
      }
    }

    load();
  }, [uid, websiteId, router]);

 function generateInitial(focus, themeSet) {
  const start = iso(new Date());
  const end = iso(addDays(start, 13));

  // 7 posts across 14 days => 3–4 posts/week
  // Shift pattern each regeneration so dates visibly change
  const offset = Math.random() < 0.5 ? 0 : 1;
  const baseDays = offset === 0 ? [0, 2, 4, 6, 8, 10, 12] : [1, 3, 5, 7, 9, 11, 13];

  const build = (platform) => {
    const list = themeSet?.[platform] || [];
    const formats = FORMATS[platform] || [];

    return baseDays.map((d) => {
      const chosen = list.length ? pick(list) : null;

      const dateStr = iso(addDays(start, d));
      return {
        id: `${platform}-${d}`,
        date: dateStr,
        day: weekdayLabel(dateStr),
        intent: pick(INTENTS) || "Educate",
        format: pick(formats) || "Text",
        themeId: chosen?.themeId || "",
        themeTitle: chosen?.title || "",
      };
    });
  };

  const next = {
    linkedin: focus === "instagram" ? [] : build("linkedin"),
    instagram: focus === "linkedin" ? [] : build("instagram"),
  };

  setWindowStart(start);
  setWindowEnd(end);
  setCalendars(next);
  persist(start, end, next);
}


  function withinWindow(dateStr, startStr, endStr) {
    if (!dateStr || !startStr || !endStr) return false;
    const d = new Date(`${dateStr}T00:00:00`).getTime();
    const s = new Date(`${startStr}T00:00:00`).getTime();
    const e = new Date(`${endStr}T00:00:00`).getTime();
    return d >= s && d <= e;
  }

  function persist(start, end, next) {
    clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setSaving(true);
        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        await setDoc(
          ref,
          {
            phase3: {
              currentStep: 0,
              windowStart: start,
              windowEnd: end,
              calendars: next,
              phase3Completed: false,
              meta: { updatedAt: serverTimestamp() },
            },
          },
          { merge: true }
        );
      } finally {
        setSaving(false);
      }
    }, 400);
  }

  if (!websiteId) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24, maxWidth: 980 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Missing websiteId</div>
            <div style={{ marginTop: 8 }}>
              Please start from <a href="/social">/social</a> and open calendar from there.
            </div>
          </div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (loading) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>Loading calendar…</div>
        </VyndowShell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 1100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0 }}>14-Day Content Calendar</h1>
              <p style={{ marginTop: 8, color: "#374151" }}>
                Planning only · 2-week strategy sprint · Window: {windowStart} to {windowEnd}
              </p>
            </div>

            <div style={{ alignSelf: "center" }}>
              <a href={`/social/themes?websiteId=${encodeURIComponent(websiteId)}`} style={{ textDecoration: "none" }}>
                ← Back to Themes
              </a>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              disabled={saving}
              onClick={() => generateInitial(platformFocus, themes)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: saving ? "#f3f4f6" : "white",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {saving ? "Saving…" : "Regenerate calendar"}
            </button>

            <button
              disabled
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f9fafb",
                cursor: "not-allowed",
                fontWeight: 700,
              }}
            >
              Continue to Phase 4
            </button>
          </div>

          {Object.entries(calendars).map(([platform, items]) =>
            items.length ? (
              <div key={platform} style={{ marginTop: 24 }}>
<h3 style={{ textTransform: "capitalize" }}>{platform}</h3>

<div
  style={{
    display: "grid",
    gridTemplateColumns: "190px 160px 160px 1fr",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 12,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 10,
  }}
>
  <div>Posting date</div>
  <div>Post intent</div>
  <div>Post format</div>
  <div>Assigned theme</div>
</div>

{items.map((p) => (
  <div
    key={p.id}
    style={{
      display: "grid",
      gridTemplateColumns: "190px 160px 160px 1fr",
      gap: 12,
      border: "1px solid #e5e7eb",
      padding: 12,
      marginBottom: 8,
      borderRadius: 12,
      background: "white",
    }}
  >
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="date"
          value={p.date}
          min={windowStart}
          max={windowEnd}
          onChange={(e) => {
            const nextDate = e.target.value;
            if (!withinWindow(nextDate, windowStart, windowEnd)) return;

            const next = {
              ...calendars,
              [platform]: items.map((x) =>
                x.id === p.id ? { ...x, date: nextDate, day: weekdayLabel(nextDate) } : x
              ),
            };
            setCalendars(next);
            persist(windowStart, windowEnd, next);
          }}
          style={{ width: "100%" }}
        />
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
        {p.day || weekdayLabel(p.date)}
      </div>
    </div>

    <select
      value={p.intent}
      onChange={(e) => {
        const next = {
          ...calendars,
          [platform]: items.map((x) => (x.id === p.id ? { ...x, intent: e.target.value } : x)),
        };
        setCalendars(next);
        persist(windowStart, windowEnd, next);
      }}
      style={{ width: "100%" }}
    >
      {INTENTS.map((i) => (
        <option key={i}>{i}</option>
      ))}
    </select>

    <select
      value={p.format}
      onChange={(e) => {
        const next = {
          ...calendars,
          [platform]: items.map((x) => (x.id === p.id ? { ...x, format: e.target.value } : x)),
        };
        setCalendars(next);
        persist(windowStart, windowEnd, next);
      }}
      style={{ width: "100%" }}
    >
      {FORMATS[platform].map((f) => (
        <option key={f}>{f}</option>
      ))}
    </select>

    <select
      value={p.themeId}
      onChange={(e) => {
        const t = themes[platform].find((x) => x.themeId === e.target.value);
        if (!t) return;

        const next = {
          ...calendars,
          [platform]: items.map((x) =>
            x.id === p.id ? { ...x, themeId: t.themeId, themeTitle: t.title } : x
          ),
        };
        setCalendars(next);
        persist(windowStart, windowEnd, next);
      }}
      style={{ width: "100%" }}
    >
      {themes[platform].map((t) => (
        <option key={t.themeId} value={t.themeId}>
          {t.title}
        </option>
      ))}
    </select>
  </div>
))}

              </div>
            ) : null
          )}
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
