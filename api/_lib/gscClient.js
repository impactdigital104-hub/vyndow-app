import admin from "../firebaseAdmin";
import { google } from "googleapis";
import { getGscOAuthClient } from "./gscAuth";

function tokenDocPath(uid) {
  return `users/${uid}/integrations/google_search_console`;
}

function websiteGscDocPath(uid, websiteId) {
  return `users/${uid}/websites/${websiteId}/integrations/gsc`;
}

function isProbablyExpired(expiryDate) {
  const expiry = Number(expiryDate || 0);
  if (!expiry) return true;
  return expiry <= Date.now() + 60 * 1000;
}

async function saveUpdatedTokens(uid, tokens = {}) {
  const payload = {};

  if (tokens.refresh_token) payload.refreshToken = tokens.refresh_token;
  if (tokens.access_token) payload.accessToken = tokens.access_token;
  if (tokens.expiry_date) payload.expiryDate = tokens.expiry_date;
  if (tokens.scope) payload.scope = tokens.scope;
  if (tokens.token_type) payload.tokenType = tokens.token_type;

  if (!Object.keys(payload).length) return;

  payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await admin.firestore().doc(tokenDocPath(uid)).set(payload, { merge: true });
}

export async function getConnectedGscContext(uid, websiteId) {
  const db = admin.firestore();

  const [tokenSnap, websiteGscSnap] = await Promise.all([
    db.doc(tokenDocPath(uid)).get(),
    db.doc(websiteGscDocPath(uid, websiteId)).get(),
  ]);

  if (!websiteGscSnap.exists) {
    throw new Error("Google Search Console property is not connected for this website.");
  }

  const websiteGscData = websiteGscSnap.data() || {};

  if (websiteGscData.connected !== true || !websiteGscData.propertyValue) {
    throw new Error("Google Search Console property is not connected for this website.");
  }

  if (!tokenSnap.exists) {
    throw new Error("Google Search Console account tokens are missing.");
  }

  const tokenData = tokenSnap.data() || {};
  const tokens = {
    refresh_token: tokenData.refreshToken || undefined,
    access_token: tokenData.accessToken || undefined,
    expiry_date: tokenData.expiryDate || undefined,
  };

  if (!tokens.refresh_token) {
    throw new Error("Google Search Console refresh token is missing.");
  }

  return {
    property: websiteGscData.propertyValue,
    tokens,
  };
}

export async function getFreshGscOAuthClient(uid, tokens = {}) {
  const client = getGscOAuthClient();
  client.setCredentials(tokens);

  if (isProbablyExpired(tokens.expiry_date) || !tokens.access_token) {
    const refreshResult = await client.refreshAccessToken();
    const refreshed = refreshResult?.credentials || {};

    client.setCredentials({
      ...tokens,
      ...refreshed,
      refresh_token: refreshed.refresh_token || tokens.refresh_token,
    });

    await saveUpdatedTokens(uid, client.credentials);
  }

  return client;
}

async function runSearchAnalyticsQuery(searchconsole, property, requestBody) {
  const response = await searchconsole.searchanalytics.query({
    siteUrl: property,
    requestBody,
  });

  return Array.isArray(response?.data?.rows) ? response.data.rows : [];
}

export async function fetchAllSearchAnalyticsRows({
  uid,
  property,
  tokens,
  startDate,
  endDate,
  dimensions,
}) {
  let client = await getFreshGscOAuthClient(uid, tokens);
  let searchconsole = google.searchconsole({ version: "v1", auth: client });

  const rowLimit = 25000;
  let startRow = 0;
  let allRows = [];
  let retriedAfterRefresh = false;

  while (true) {
    const requestBody = {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      startRow,
      dataState: "final",
    };

    let rows = [];

    try {
      rows = await runSearchAnalyticsQuery(searchconsole, property, requestBody);
    } catch (error) {
      const status = Number(error?.code || error?.response?.status || 0);

      if (!retriedAfterRefresh && status === 401) {
        retriedAfterRefresh = true;

        const retryClient = getGscOAuthClient();
        retryClient.setCredentials(tokens);

        const refreshResult = await retryClient.refreshAccessToken();
        const refreshed = refreshResult?.credentials || {};

        retryClient.setCredentials({
          ...tokens,
          ...refreshed,
          refresh_token: refreshed.refresh_token || tokens.refresh_token,
        });

        await saveUpdatedTokens(uid, retryClient.credentials);

        client = retryClient;
        searchconsole = google.searchconsole({ version: "v1", auth: client });

        rows = await runSearchAnalyticsQuery(searchconsole, property, requestBody);
      } else {
        throw error;
      }
    }

    allRows = allRows.concat(rows);

    if (rows.length < rowLimit) break;
    startRow += rowLimit;
  }

  return allRows;
}
