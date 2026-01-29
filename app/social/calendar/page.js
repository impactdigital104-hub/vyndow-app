"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthGate from "@/components/AuthGate";
import VyndowShell from "@/components/VyndowShell";

import { auth, db } from "@/lib/firebase";
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

const INTENTS = ["Educate", "Explain", "Provoke", "Proof", "Insight"];
const FORMATS = {
  linkedin: ["Text", "Carousel", "Document", "Poll"],
  instagram: ["Reel", "Carousel", "Static", "Story"],
};

export default function SocialCalendarPage() {
  const router = useRouter();
  const params = useSearchParams();
  const websiteId = params.get("websiteId");

  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [platformFocus, setPlatformFocus] = useState("");
  const [themes, setThemes] = useState({ linkedin: [], instagram: [] });

  const [windowStart, setWindowStart] = useState("");
  const [calendars, setCalendars] = useState({ linkedin: [], instagram: [] });

  const saveTimer = useRef(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUid(u?.uid || null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid || !websiteId) return;

    async function load() {
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
      const snap = await getDoc(ref);
      const data = snap.data();

      if (!data?.phase1Completed) {
        router.replace(`/social/workshop?websiteId=${websiteId}`);
        return;
      }

      if (!data?.phase2?.meta?.phase2Completed) {
        router.replace(`/social/themes?websiteId=${websiteId}`);
        return;
      }

      setPlatformFocus(data.platformFocus || "");
      setThemes({
        linkedin: data.phase2.themes?.linkedin || [],
        instagram: data.phase2.themes?.instagram || [],
      });

      if (data.phase3?.calendars) {
        setWindowStart(data.phase3.windowStart);
        setCalendars(data.phase3.calendars);
      } else {
        generateInitial(data.platformFocus, data.phase2.themes);
      }

      setLoading(false);
    }

    load();
  }, [uid, websiteId]);

  function generateInitial(focus, themeSet) {
    const start = iso(new Date());
    const baseDays = [0, 2, 4, 6, 8, 10, 12];

    const build = (platform) =>
      baseDays.map((d, i) => ({
        id: `${platform}-${d}`,
        date: iso(addDays(start, d)),
        intent: INTENTS[i % INTENTS.length],
        format: FORMATS[platform][i % FORMATS[platform].length],
        themeId: themeSet[platform][i % themeSet[platform].length]?.themeId || "",
        themeTitle: themeSet[platform][i % themeSet[platform].length]?.title || "",
      }));

    const next = {
      linkedin: focus === "instagram" ? [] : build("linkedin"),
      instagram: focus === "linkedin" ? [] : build("instagram"),
    };

    setWindowStart(start);
    setCalendars(next);
    persist(start, next);
  }

  function persist(start, next) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
      await setDoc(
        ref,
        {
          phase3: {
            windowStart: start,
            calendars: next,
            meta: { updatedAt: serverTimestamp(), phase3Completed: false },
          },
        },
        { merge: true }
      );
      setSaving(false);
    }, 400);
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
          <h1>14-Day Content Calendar</h1>
          <p>Planning only · 2-week strategy sprint</p>

          <button
            disabled={saving}
            onClick={() => generateInitial(platformFocus, themes)}
            style={{ padding: "10px 14px", borderRadius: 8 }}
          >
            Regenerate calendar
          </button>

          {Object.entries(calendars).map(([platform, items]) =>
            items.length ? (
              <div key={platform} style={{ marginTop: 24 }}>
                <h3>{platform}</h3>
                {items.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 160px 160px 1fr",
                      gap: 12,
                      border: "1px solid #e5e7eb",
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="date"
                      value={p.date}
                      onChange={(e) => {
                        const next = {
                          ...calendars,
                          [platform]: items.map((x) =>
                            x.id === p.id ? { ...x, date: e.target.value } : x
                          ),
                        };
                        setCalendars(next);
                        persist(windowStart, next);
                      }}
                    />

                    <select
                      value={p.intent}
                      onChange={(e) => {
                        const next = {
                          ...calendars,
                          [platform]: items.map((x) =>
                            x.id === p.id ? { ...x, intent: e.target.value } : x
                          ),
                        };
                        setCalendars(next);
                        persist(windowStart, next);
                      }}
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
                          [platform]: items.map((x) =>
                            x.id === p.id ? { ...x, format: e.target.value } : x
                          ),
                        };
                        setCalendars(next);
                        persist(windowStart, next);
                      }}
                    >
                      {FORMATS[platform].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>

                    <select
                      value={p.themeId}
                      onChange={(e) => {
                        const t = themes[platform].find((x) => x.themeId === e.target.value);
                        const next = {
                          ...calendars,
                          [platform]: items.map((x) =>
                            x.id === p.id
                              ? { ...x, themeId: t.themeId, themeTitle: t.title }
                              : x
                          ),
                        };
                        setCalendars(next);
                        persist(windowStart, next);
                      }}
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
