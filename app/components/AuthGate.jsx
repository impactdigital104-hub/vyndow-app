"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { auth, db } from "../firebaseClient";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PAID_PLANS = ["starter", "growth", "pro"];

function toDateOrNull(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function buildFreeCycle(now = new Date()) {
  const cycleEndDate = new Date(now.getTime() + THIRTY_DAYS_MS);
  return {
    cycleStart: Timestamp.fromDate(now),
    cycleEnd: Timestamp.fromDate(cycleEndDate),
    graceUntil: null,
  };
}

function buildPaidCycle(now = new Date()) {
  const cycleEndDate = new Date(now.getTime() + THIRTY_DAYS_MS);
  const graceUntilDate = new Date(cycleEndDate.getTime() + SEVEN_DAYS_MS);

  return {
    cycleStart: Timestamp.fromDate(now),
    cycleEnd: Timestamp.fromDate(cycleEndDate),
    graceUntil: Timestamp.fromDate(graceUntilDate),
  };
}

async function syncLegacyModulesToFree(uid) {
  const seoRef = doc(db, "users", uid, "modules", "seo");
  const geoRef = doc(db, "users", uid, "modules", "geo");

  await setDoc(
    seoRef,
    {
      blogsPerWebsitePerMonth: 2,
      websitesIncluded: 1,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    geoRef,
    {
      moduleId: "geo",
      pagesPerMonth: 2,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureSuiteLifecycleForUser(user) {
  if (!user?.uid) return;

  const suiteRef = doc(db, "users", user.uid, "entitlements", "suite");
  const suiteSnap = await getDoc(suiteRef);

  const now = new Date();

  if (!suiteSnap.exists()) {
    await setDoc(
      suiteRef,
      {
        plan: "free",
        ...buildFreeCycle(now),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const data = suiteSnap.data() || {};
  const plan = String(data.plan || "free").toLowerCase().trim();

  const cycleStart = toDateOrNull(data.cycleStart);
  const cycleEnd = toDateOrNull(data.cycleEnd);
  const graceUntil = toDateOrNull(data.graceUntil);
  const isPaidPlan = PAID_PLANS.includes(plan);

  // If lifecycle fields are missing, initialize safely based on current plan.
  if (!cycleStart || !cycleEnd || (isPaidPlan && !graceUntil)) {
    await setDoc(
      suiteRef,
      {
        ...(isPaidPlan ? buildPaidCycle(now) : buildFreeCycle(now)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  // Free user: if cycle expired, roll free cycle forward.
  if (!isPaidPlan) {
    if (now > cycleEnd) {
      await setDoc(
        suiteRef,
        {
          ...buildFreeCycle(now),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    return;
  }

  // Paid user still inside active cycle.
  if (now <= cycleEnd) return;

  // Paid user inside grace period.
  if (graceUntil && now <= graceUntil) return;

  // Paid user is past grace -> downgrade to free and start a new free cycle.
  await setDoc(
    suiteRef,
    {
      plan: "free",
      ...buildFreeCycle(now),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await syncLegacyModulesToFree(user.uid);
}

function AuthGateInner({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  const nextUrl = useMemo(() => {
    const qs = searchParams?.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    // allow only internal paths
    if (next.startsWith("/") && !next.startsWith("//")) return next;
    return "/growth";
  }, [pathname, searchParams]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setChecking(false);

        if (pathname !== "/login") {
          router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
        }
        return;
      }

      try {
        await ensureSuiteLifecycleForUser(u);
      } catch (e) {
        console.error("AuthGate lifecycle check failed:", e);
      }

      setUser(u);
      setChecking(false);
    });

    return () => unsub();
  }, [router, pathname, nextUrl]);

  if (checking) {
    return (
      <div style={{ padding: 24, color: "#374151" }}>
        Checking login…
      </div>
    );
  }

  if (!user) return null;

  return children;
}

export default function AuthGate({ children }) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24, color: "#374151" }}>
          Checking login…
        </div>
      }
    >
      <AuthGateInner>{children}</AuthGateInner>
    </Suspense>
  );
}
