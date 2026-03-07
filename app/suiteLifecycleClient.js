import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebaseClient";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PAID_PLANS = ["starter", "growth", "pro"];

const PLAN_MAP = {
  free: {
    seoBlogs: 2,
    geoPages: 2,
    websitesIncluded: 1,
    seoPlan: "free",
    geoPlan: "free",
    seatsIncluded: 1,
  },
  starter: {
    seoBlogs: 6,
    geoPages: 10,
    websitesIncluded: 1,
    seoPlan: "starter",
    geoPlan: "starter",
    seatsIncluded: 1,
  },
  growth: {
    seoBlogs: 15,
    geoPages: 25,
    websitesIncluded: 1,
    seoPlan: "growth",
    geoPlan: "growth",
    seatsIncluded: 3,
  },
  pro: {
    seoBlogs: 25,
    geoPages: 50,
    websitesIncluded: 2,
    seoPlan: "pro",
    geoPlan: "pro",
    seatsIncluded: 3,
  },
};

function normalizeSuitePlan(planRaw) {
  const p = String(planRaw || "free").toLowerCase().trim();
  if (p === "pro") return "pro";
  if (p === "growth") return "growth";
  if (p === "starter") return "starter";
  return "free";
}

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

async function syncSuitePlanToAllRuntimeDocs(uid, suitePlanRaw) {
  const suitePlan = normalizeSuitePlan(suitePlanRaw);
  const limits = PLAN_MAP[suitePlan] || PLAN_MAP.free;

  const seoRef = doc(db, "users", uid, "modules", "seo");
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

  const geoRef = doc(db, "users", uid, "modules", "geo");
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

  const sitesRef = collection(db, "users", uid, "websites");
  const sitesSnap = await getDocs(sitesRef);

  for (const siteDoc of sitesSnap.docs) {
    const websiteId = siteDoc.id;

    const websiteSeoRef = doc(db, "users", uid, "websites", websiteId, "modules", "seo");
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

    const websiteGeoRef = doc(db, "users", uid, "websites", websiteId, "modules", "geo");
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

export async function ensureSuiteLifecycleBaseline(uid) {
  if (!uid) return;

  const suiteRef = doc(db, "users", uid, "entitlements", "suite");
  const snap = await getDoc(suiteRef);
  const now = new Date();

  if (!snap.exists()) {
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

  const data = snap.data() || {};
  const plan = normalizeSuitePlan(data.plan);

  const cycleStart = toDateOrNull(data.cycleStart);
  const cycleEnd = toDateOrNull(data.cycleEnd);
  const graceUntil = toDateOrNull(data.graceUntil);

  const patch = {};

  if (!cycleStart) {
    patch.cycleStart = Timestamp.fromDate(now);
  }

  if (!cycleEnd) {
    patch.cycleEnd = Timestamp.fromDate(new Date(now.getTime() + THIRTY_DAYS_MS));
  }

  if (PAID_PLANS.includes(plan)) {
    if (!graceUntil) {
      const graceBase = cycleEnd || new Date(now.getTime() + THIRTY_DAYS_MS);
      patch.graceUntil = Timestamp.fromDate(new Date(graceBase.getTime() + SEVEN_DAYS_MS));
    }
  } else if (data.graceUntil !== null) {
    patch.graceUntil = null;
  }

  if (Object.keys(patch).length > 0) {
    await setDoc(
      suiteRef,
      {
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export async function runSuiteLifecycleCheck(uid) {
  if (!uid) return { ok: false, action: "no_uid" };

  await ensureSuiteLifecycleBaseline(uid);

  const suiteRef = doc(db, "users", uid, "entitlements", "suite");
  const snap = await getDoc(suiteRef);
  const now = new Date();

  if (!snap.exists()) {
    await setDoc(
      suiteRef,
      {
        plan: "free",
        ...buildFreeCycle(now),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await syncSuitePlanToAllRuntimeDocs(uid, "free");
    return { ok: true, action: "initialized_free" };
  }

  const data = snap.data() || {};
  const plan = normalizeSuitePlan(data.plan);
  const cycleEnd = toDateOrNull(data.cycleEnd);
  const graceUntil = toDateOrNull(data.graceUntil);

  if (plan === "free") {
    if (cycleEnd && now > cycleEnd) {
      await setDoc(
        suiteRef,
        {
          plan: "free",
          ...buildFreeCycle(now),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await syncSuitePlanToAllRuntimeDocs(uid, "free");
      return { ok: true, action: "rolled_free_cycle" };
    }
    return { ok: true, action: "free_no_change" };
  }

  if (!cycleEnd) {
    return { ok: true, action: "paid_waiting_for_baseline" };
  }

  if (now <= cycleEnd) {
    await syncSuitePlanToAllRuntimeDocs(uid, plan);
    return { ok: true, action: "paid_active" };
  }

  if (graceUntil && now <= graceUntil) {
    await syncSuitePlanToAllRuntimeDocs(uid, plan);
    return { ok: true, action: "paid_in_grace" };
  }

  await setDoc(
    suiteRef,
    {
      plan: "free",
      ...buildFreeCycle(now),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await syncSuitePlanToAllRuntimeDocs(uid, "free");
  return { ok: true, action: "downgraded_to_free" };
}
