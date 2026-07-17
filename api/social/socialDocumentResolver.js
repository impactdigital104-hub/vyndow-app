// api/social/socialDocumentResolver.js
// Social-only server resolver for backward-compatible website/module ownership.

function resolverError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function satisfiesRequiredData(requiredData, socialData, context) {
  if (typeof requiredData !== "function") return true;
  return Boolean(await requiredData(socialData, context));
}

export async function resolveSocialDocument({ db, uid, websiteId, requiredData }) {
  if (!db) throw new TypeError("Missing Firestore instance.");
  if (!uid) throw new TypeError("Missing authenticated user UID.");
  if (!websiteId) throw new TypeError("Missing websiteId.");

  const userWebsiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
  const userWebsiteSnap = await userWebsiteRef.get();
  if (!userWebsiteSnap.exists) {
    throw resolverError("WEBSITE_NOT_FOUND", "Website not found for this user.");
  }

  const websiteData = userWebsiteSnap.data() || {};
  const rawOwnerUid = typeof websiteData.ownerUid === "string" ? websiteData.ownerUid.trim() : "";
  const ownerUid = rawOwnerUid || uid;

  if (ownerUid !== uid) {
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      throw resolverError("NO_ACCESS", "You do not have access to this website.");
    }
  }

  const candidates = [{
    resolvedUid: uid,
    source: "authenticated-user",
    socialRef: db.doc(`users/${uid}/websites/${websiteId}/modules/social`),
  }];

  if (ownerUid !== uid) {
    candidates.push({
      resolvedUid: ownerUid,
      source: "owner-fallback",
      socialRef: db.doc(`users/${ownerUid}/websites/${websiteId}/modules/social`),
    });
  }

  let foundAnySocialDocument = false;
  for (const candidate of candidates) {
    const socialSnap = await candidate.socialRef.get();
    if (!socialSnap.exists) continue;

    foundAnySocialDocument = true;
    const socialData = socialSnap.data() || {};
    const valid = await satisfiesRequiredData(requiredData, socialData, {
      ownerUid,
      resolvedUid: candidate.resolvedUid,
      socialRef: candidate.socialRef,
      source: candidate.source,
    });

    if (valid) {
      return {
        ownerUid,
        resolvedUid: candidate.resolvedUid,
        socialRef: candidate.socialRef,
        socialData,
        source: candidate.source,
      };
    }
  }

  if (!foundAnySocialDocument) {
    throw resolverError("SOCIAL_NOT_FOUND", "Social module not found.");
  }
  throw resolverError("REQUIRED_SOCIAL_DATA_MISSING", "The Social module does not contain the data required for this action.");
}
