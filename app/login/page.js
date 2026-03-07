"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";

import { auth, db } from "../firebaseClient";
import { ensureSuiteLifecycleBaseline } from "../suiteLifecycleClient";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextUrl = useMemo(() => {
    const n = searchParams?.get("next") || "";
    // allow only internal paths
    if (n.startsWith("/") && !n.startsWith("//")) return n;
    return "/growth";
  }, [searchParams]);

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function ensureUserDoc(user) {
    if (!user?.uid) return;
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email || "",
        name: user.displayName || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function ensureSeoModuleDoc(user) {
    if (!user?.uid) return;

    const seoRef = doc(db, "users", user.uid, "modules", "seo");
    const snap = await getDoc(seoRef);

    if (!snap.exists()) {
      await setDoc(seoRef, {
        plan: "free",
        websitesIncluded: 1,
        blogsPerWebsitePerMonth: 2,
        extraWebsitesPurchased: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  async function ensureSuiteEntitlementsDoc(user) {
    if (!user?.uid) return;
    await ensureSuiteLifecycleBaseline(user.uid);
  }
  async function ensureSuitePlanSyncedToLegacyModules(user) {
    if (!user?.uid) return;

    // 1) Read suite plan (default to free)
    const suiteRef = doc(db, "users", user.uid, "entitlements", "suite");
    const suiteSnap = await getDoc(suiteRef);
    const suitePlanRaw = suiteSnap.exists() ? suiteSnap.data()?.plan : "free";
    const suitePlan = String(suitePlanRaw || "free").toLowerCase().trim();

    // 2) Locked mapping (Suite → numeric limits)
    const MAP = {
      free:    { seoBlogs: 2,  geoPages: 2,  websitesIncluded: 1, seoPlan: "free",    geoPlan: "free",    seatsIncluded: 1 },
      starter: { seoBlogs: 6,  geoPages: 10, websitesIncluded: 1, seoPlan: "starter", geoPlan: "starter", seatsIncluded: 1 },
      growth:  { seoBlogs: 15, geoPages: 25, websitesIncluded: 1, seoPlan: "growth",  geoPlan: "growth",  seatsIncluded: 3 },
      pro:     { seoBlogs: 25, geoPages: 50, websitesIncluded: 2, seoPlan: "pro",     geoPlan: "pro",     seatsIncluded: 3 },
    };

    const limits = MAP[suitePlan] || MAP.free;

    // 3) Update root SEO module doc
    const seoRef = doc(db, "users", user.uid, "modules", "seo");
    await setDoc(
      seoRef,
      {
        plan: limits.seoPlan,
        blogsPerWebsitePerMonth: Number(limits.seoBlogs),
        websitesIncluded: Number(limits.websitesIncluded),
        seatsIncluded: Number(limits.seatsIncluded),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 4) Update root GEO module doc
    const geoRef = doc(db, "users", user.uid, "modules", "geo");
    const geoSnap = await getDoc(geoRef);

    if (!geoSnap.exists()) {
      await setDoc(
        geoRef,
        {
          moduleId: "geo",
          plan: limits.geoPlan,
          pagesPerMonth: Number(limits.geoPages),
          extraGeoCreditsThisMonth: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(
        geoRef,
        {
          moduleId: "geo",
          plan: limits.geoPlan,
          pagesPerMonth: Number(limits.geoPages),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 5) Propagate to all existing website-level SEO/GEO module docs
    const sitesRef = collection(db, "users", user.uid, "websites");
    const sitesSnap = await getDocs(sitesRef);

    for (const siteDoc of sitesSnap.docs) {
      const websiteId = siteDoc.id;

      const websiteSeoRef = doc(db, "users", user.uid, "websites", websiteId, "modules", "seo");
      await setDoc(
        websiteSeoRef,
        {
          moduleId: "seo",
          plan: limits.seoPlan,
          blogsPerWebsitePerMonth: Number(limits.seoBlogs),
          seatsIncluded: Number(limits.seatsIncluded),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const websiteGeoRef = doc(db, "users", user.uid, "websites", websiteId, "modules", "geo");
      await setDoc(
        websiteGeoRef,
        {
          moduleId: "geo",
          plan: limits.geoPlan,
          pagesPerMonth: Number(limits.geoPages),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  }
  useEffect(() => {
    // If already logged in, go to nextUrl (or /seo)
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace(nextUrl);
    });
    return () => unsub();
  }, [router, nextUrl]);

  async function handleGoogle() {
    setMsg("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await ensureUserDoc(cred.user);
      await ensureSeoModuleDoc(cred.user);
      await ensureSuiteEntitlementsDoc(cred.user);
            await ensureSuitePlanSyncedToLegacyModules(cred.user);
      router.replace(nextUrl);
    } catch (e) {
      setMsg(e?.message || "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailAuth(e) {
    e.preventDefault();
    setMsg("");

    if (!email.trim() || !password.trim()) {
      setMsg("Please enter email and password.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await ensureUserDoc(cred.user);
        await ensureSeoModuleDoc(cred.user);
        await ensureSuiteEntitlementsDoc(cred.user);
                await ensureSuitePlanSyncedToLegacyModules(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await ensureUserDoc(cred.user);
        await ensureSeoModuleDoc(cred.user);
        await ensureSuiteEntitlementsDoc(cred.user);
                await ensureSuitePlanSyncedToLegacyModules(cred.user);
      }
      router.replace(nextUrl);
    } catch (e) {
      setMsg(e?.message || "Email login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#fff7ed",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 10px 25px rgba(15, 23, 42, 0.08)",
        }}
      >
        <h1 style={{ margin: 0 }}>Sign in to Vyndow</h1>
        <p style={{ color: "#6b7280", marginTop: 6 }}>
          After sign-in, you will be directed to your dashboard
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          Continue with Google
        </button>

        <div style={{ margin: "16px 0", color: "#9ca3af" }}>
          — or use email —
        </div>

        <form onSubmit={handleEmailAuth}>
          <label style={{ display: "block", fontSize: 13, color: "#374151" }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", fontSize: 13, color: "#374151" }}>
            Password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              marginTop: 6,
              marginBottom: 12,
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
              color: "#ffffff",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 12, fontSize: 13, color: "#374151" }}>
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#2563eb",
                  cursor: "pointer",
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#2563eb",
                  cursor: "pointer",
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                Create an account
              </button>
            </>
          )}
        </div>
<p style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
  Having trouble accessing your account?{" "}
  <a href="mailto:feedback@vyndow.com" style={{ color: "#2563eb", fontWeight: 600 }}>
    Write to us at feedback@vyndow.com
  </a>
</p>


        {msg && (
          <div
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              whiteSpace: "pre-wrap",
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#fff7ed" }}>
          <div style={{ color: "#374151" }}>Loading…</div>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
