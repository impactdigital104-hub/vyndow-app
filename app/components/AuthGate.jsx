"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { auth } from "../firebaseClient";

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
    return "/seo";
  }, [pathname, searchParams]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setChecking(false);

      // If not logged in, redirect to /login with next=<current path + query>
      if (!u && pathname !== "/login") {
        router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
      }
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
