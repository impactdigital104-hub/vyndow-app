"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { auth } from "../firebaseClient";

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setChecking(false);

// If not logged in, redirect to /login with next=<current path + query>
if (!u && pathname !== "/login") {
  const qs = searchParams?.toString();
  const next = qs ? `${pathname}?${qs}` : pathname;
  router.replace(`/login?next=${encodeURIComponent(next)}`);
}
    });

    return () => unsub();
  }, [router, pathname]);

  // While checking auth state, show a minimal loading state
  if (checking) {
    return (
      <div style={{ padding: 24, color: "#374151" }}>
        Checking login…
      </div>
    );
  }

  // If not logged in, AuthGate will redirect. Render nothing.
  if (!user) return null;

  return children;
}
