"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";


import { auth, db } from "../firebaseClient";


export default function LoginPage() {
  const router = useRouter();
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


  useEffect(() => {
    // If already logged in, go to /seo
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.replace("/seo");
    });
    return () => unsub();
  }, [router]);

  async function handleGoogle() {
    setMsg("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
            const cred = await signInWithPopup(auth, provider);
   await ensureUserDoc(cred.user);
await ensureSeoModuleDoc(cred.user);
router.replace("/seo");


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

} else {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureUserDoc(cred.user);
  await ensureSeoModuleDoc(cred.user);

}
router.replace("/seo");

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
          Internal testing login (Phase 7A)
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
