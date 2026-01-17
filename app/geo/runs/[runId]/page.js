"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../../VyndowShell";
import { auth } from "../../../firebaseClient";

export default function GeoRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const runId = params?.runId;
  const websiteIdFromQuery = searchParams.get("websiteId") || "";

  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setAuthReady(true);
    });
    return () => (typeof unsub === "function" ? unsub() : undefined);
  }, [router]);

  useEffect(() => {
    async function loadDetail() {
      if (!authReady) return;
      if (!runId) return;
      if (!websiteIdFromQuery) {
        setError("Missing websiteId in URL. Go back to runs list and open from there.");
        return;
      }

      try {
        setLoading(true);
        setError("");
        setRun(null);
        setPages([]);

        const token = await auth.currentUser.getIdToken();
        const resp = await fetch("/api/geo/runDetail", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ websiteId: websiteIdFromQuery, runId }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp
