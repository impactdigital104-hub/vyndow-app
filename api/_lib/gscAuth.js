import { google } from "googleapis";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getGscOAuthClient() {
  return new google.auth.OAuth2(
    required("GOOGLE_GSC_CLIENT_ID"),
    required("GOOGLE_GSC_CLIENT_SECRET"),
    required("GOOGLE_GSC_REDIRECT_URI")
  );
}

export function buildAuthUrl(stateString) {
  const client = getGscOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "openid",
      "email",
      "profile",
    ],
    state: stateString,
  });
}

export function encodeState(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeState(stateString) {
  try {
    const json = Buffer.from(String(stateString || ""), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function normalizeDomainLike(value) {
  let s = String(value || "").trim().toLowerCase();
  if (!s) return "";

  if (s.startsWith("sc-domain:")) {
    s = s.slice("sc-domain:".length);
  }

  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/.*$/, "");
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.$/, "");

  return s;
}

export function getPropertyType(propertyValue) {
  const raw = String(propertyValue || "").trim().toLowerCase();
  return raw.startsWith("sc-domain:") ? "domain" : "url-prefix";
}

export function propertyMatchesWebsite(websiteDomain, propertyValue) {
  const website = normalizeDomainLike(websiteDomain);
  const property = normalizeDomainLike(propertyValue);
  if (!website || !property) return false;
  return website === property;
}

export async function listSearchConsoleSites(tokens) {
  const client = getGscOAuthClient();
  client.setCredentials(tokens || {});

  const searchconsole = google.searchconsole({ version: "v1", auth: client });
  const response = await searchconsole.sites.list();
  const entries = Array.isArray(response?.data?.siteEntry) ? response.data.siteEntry : [];

  return entries.map((entry) => ({
    siteUrl: entry?.siteUrl || "",
    permissionLevel: entry?.permissionLevel || "",
  }));
}
