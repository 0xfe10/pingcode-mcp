import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const defaultScopes = ["pingcode.read", "pingcode.write"];
const oauthMetadataPath = "/.well-known/oauth-protected-resource/mcp";
const oauthMetadataRootPath = "/.well-known/oauth-protected-resource";
const authorizeStartPath = "/v1/idp/oauth/authorize/start";
const authorizeSubmitPath = "/v1/idp/oauth/authorize";
const createUserPath = "/v1/users";
const maxJsonBodyBytes = 1024 * 1024;
const consentCookieName = "pingcode_mcp_oauth_consent";
const consentSessionMaxAgeSeconds = 15 * 60;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export type McpAuthMode = "token" | "stytch" | "stytch,token" | "none";

export interface OAuthConfig {
  authMode: McpAuthMode;
  publicUrl?: string;
  resource?: string;
  resourceMetadataUrl?: string;
  authorizationServers: string[];
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
  scopesSupported: string[];
  requiredScopes: string[];
  allowStaticToken: boolean;
  stytchDomain?: string;
  stytchProjectId?: string;
  stytchSecret?: string;
  stytchUserId?: string;
  stytchUserIdPrefix: string;
  stytchUserEmail?: string;
  consentPassword?: string;
}

export interface VerifiedOAuthToken {
  subject: string;
  issuer: string;
  audience: string[];
  scopes: string[];
  expiresAt?: number;
  claims: JWTPayload;
}

export interface OAuthAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  userId: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  resource?: string;
  consentGranted?: boolean;
}

export interface StytchOAuthClient {
  authorizeStart: (request: OAuthAuthorizeRequest) => Promise<unknown>;
  authorizeSubmit: (request: OAuthAuthorizeRequest) => Promise<{ redirect_uri?: string }>;
}

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function splitList(value: string | undefined, defaultValue: string[] = []): string[] {
  const raw = readOptional(value);
  if (!raw) return defaultValue;
  return raw.split(/[,\s]+/).map(item => item.trim()).filter(Boolean);
}

function normalizeAuthMode(value: string | undefined): McpAuthMode {
  const mode = (value ?? "token").trim().toLowerCase();
  if (mode === "bearer") return "token";
  if (mode === "oauth") return "stytch";
  if (mode === "oauth,bearer" || mode === "bearer,oauth" || mode === "token,stytch") return "stytch,token";
  if (mode === "token" || mode === "stytch" || mode === "stytch,token" || mode === "none") return mode;
  throw new Error(`Invalid PINGCODE_MCP_AUTH_MODE: ${value}`);
}

function joinPublicUrl(publicUrl: string, path: string): string {
  return `${trimTrailingSlash(publicUrl)}${path}`;
}

export function parseOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const authMode = normalizeAuthMode(env.PINGCODE_MCP_AUTH_MODE);
  const publicUrl = readOptional(env.PINGCODE_MCP_PUBLIC_URL)
    ? trimTrailingSlash(readOptional(env.PINGCODE_MCP_PUBLIC_URL)!)
    : undefined;
  const stytchDomain = readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_DOMAIN)
    ? trimTrailingSlash(readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_DOMAIN)!)
    : undefined;
  const stytchProjectId = readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID);

  const resource =
    readOptional(env.PINGCODE_MCP_OAUTH_RESOURCE) ?? (publicUrl ? joinPublicUrl(publicUrl, "/mcp") : undefined);
  const resourceMetadataUrl =
    readOptional(env.PINGCODE_MCP_OAUTH_RESOURCE_METADATA_URL) ??
    (publicUrl ? joinPublicUrl(publicUrl, oauthMetadataPath) : undefined);
  const issuer = readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_ISSUER) ?? stytchDomain;

  return {
    authMode,
    publicUrl,
    resource,
    resourceMetadataUrl,
    authorizationServers: splitList(
      env.PINGCODE_MCP_OAUTH_AUTHORIZATION_SERVERS,
      stytchDomain ? [stytchDomain] : [],
    ),
    issuer,
    jwksUrl:
      readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_JWKS_URL) ??
      (issuer ? joinPublicUrl(issuer, "/.well-known/jwks.json") : undefined),
    audience: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE) ?? stytchProjectId ?? resource,
    scopesSupported: splitList(env.PINGCODE_MCP_OAUTH_SCOPES_SUPPORTED, defaultScopes),
    requiredScopes: splitList(env.PINGCODE_MCP_OAUTH_REQUIRED_SCOPES, defaultScopes),
    allowStaticToken: readBoolean(env.PINGCODE_MCP_OAUTH_ALLOW_STATIC_TOKEN, false),
    stytchDomain,
    stytchProjectId,
    stytchSecret: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_SECRET),
    stytchUserId: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_USER_ID),
    stytchUserIdPrefix: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_USER_ID_PREFIX) ?? "pingcode:",
    stytchUserEmail: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_USER_EMAIL),
    consentPassword: readOptional(env.PINGCODE_MCP_STYTCH_OAUTH_CONSENT_PASSWORD),
  };
}

export function isStytchAuthMode(config: OAuthConfig): boolean {
  return config.authMode === "stytch" || config.authMode === "stytch,token";
}

export function assertStytchOAuthConfig(config: OAuthConfig, options: { requireConsentPassword?: boolean } = {}): void {
  if (!isStytchAuthMode(config)) return;
  required(config.publicUrl, "PINGCODE_MCP_PUBLIC_URL");
  required(config.resource, "PINGCODE_MCP_OAUTH_RESOURCE or PINGCODE_MCP_PUBLIC_URL");
  required(config.resourceMetadataUrl, "PINGCODE_MCP_OAUTH_RESOURCE_METADATA_URL or PINGCODE_MCP_PUBLIC_URL");
  required(config.stytchDomain, "PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  required(config.stytchProjectId, "PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID");
  required(config.stytchSecret, "PINGCODE_MCP_STYTCH_OAUTH_SECRET");
  required(config.stytchUserId, "PINGCODE_MCP_STYTCH_OAUTH_USER_ID");
  required(config.issuer, "PINGCODE_MCP_STYTCH_OAUTH_ISSUER or PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  required(config.jwksUrl, "PINGCODE_MCP_STYTCH_OAUTH_JWKS_URL or PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  required(config.audience, "PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE or PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID");
  if (!config.authorizationServers.length) {
    throw new Error("Missing PINGCODE_MCP_OAUTH_AUTHORIZATION_SERVERS or PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  }
  if (options.requireConsentPassword) {
    required(config.consentPassword, "PINGCODE_MCP_STYTCH_OAUTH_CONSENT_PASSWORD");
  }
}

export function buildProtectedResourceMetadata(config: OAuthConfig) {
  return {
    resource: required(config.resource, "PINGCODE_MCP_OAUTH_RESOURCE or PINGCODE_MCP_PUBLIC_URL"),
    authorization_servers: config.authorizationServers,
    scopes_supported: config.scopesSupported,
    bearer_methods_supported: ["header"],
    resource_name: "PingCode MCP",
  };
}

export function buildOAuthChallenge(config: OAuthConfig): string {
  return `Bearer resource_metadata="${required(
    config.resourceMetadataUrl,
    "PINGCODE_MCP_OAUTH_RESOURCE_METADATA_URL or PINGCODE_MCP_PUBLIC_URL",
  )}", error="invalid_token", error_description="A valid Stytch OAuth access token is required"`;
}

export async function verifyStytchAccessToken(token: string, config: OAuthConfig): Promise<VerifiedOAuthToken> {
  const issuer = required(config.issuer, "PINGCODE_MCP_STYTCH_OAUTH_ISSUER or PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  const audience = required(config.audience, "PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE or PINGCODE_MCP_PUBLIC_URL");
  const jwksUrl = required(config.jwksUrl, "PINGCODE_MCP_STYTCH_OAUTH_JWKS_URL or PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  const result = await jwtVerify(token, jwks, {
    issuer,
    audience,
    algorithms: ["RS256"],
  });
  const scopes = tokenScopes(result.payload);
  for (const scope of config.requiredScopes) {
    if (!scopes.includes(scope)) {
      throw new Error(`Missing required scope: ${scope}`);
    }
  }
  const jwtAudience = result.payload.aud;
  return {
    subject: required(result.payload.sub, "JWT sub"),
    issuer: required(result.payload.iss, "JWT iss"),
    audience: Array.isArray(jwtAudience) ? jwtAudience : jwtAudience ? [jwtAudience] : [],
    scopes,
    expiresAt: result.payload.exp,
    claims: result.payload,
  };
}

function tokenScopes(payload: JWTPayload): string[] {
  const values: unknown[] = [];
  values.push(payload.scope);
  values.push(payload.scp);
  values.push(payload.permissions);

  const scopes = new Set<string>();
  for (const value of values) {
    if (typeof value === "string") {
      for (const scope of value.split(/\s+/)) {
        if (scope) scopes.add(scope);
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const scope of value) {
        if (typeof scope === "string" && scope) scopes.add(scope);
      }
    }
  }
  return [...scopes];
}

export function createStytchOAuthClient(config: {
  domain?: string;
  projectId?: string;
  secret?: string;
  userEmail?: string;
}): StytchOAuthClient {
  const domain = required(config.domain, "PINGCODE_MCP_STYTCH_OAUTH_DOMAIN");
  const projectId = required(config.projectId, "PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID");
  const secret = required(config.secret, "PINGCODE_MCP_STYTCH_OAUTH_SECRET");
  validateStytchDomain(domain);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${domain}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${projectId}:${secret}`, "utf8").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? safeJson(text) : {};
    if (!response.ok) {
      throw new Error(stytchErrorMessage(data, response.status));
    }
    return data as T;
  }

  async function ensureUserIfMissing(error: unknown, userId: string): Promise<boolean> {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes("user") || !message.includes("not") || !message.includes("found")) {
      return false;
    }
    await post(createUserPath, {
      user_id: userId,
      email: config.userEmail ?? `${userId.replace(/[^a-zA-Z0-9._-]+/g, "-")}@mcp.pingcode.local`,
    });
    return true;
  }

  return {
    authorizeStart: async request => {
      const body = {
        client_id: request.clientId,
        redirect_uri: request.redirectUri,
        response_type: request.responseType,
        scopes: splitScopes(request.scope),
        user_id: request.userId,
      };
      try {
        return await post(authorizeStartPath, body);
      } catch (error) {
        if (await ensureUserIfMissing(error, request.userId)) {
          return post(authorizeStartPath, body);
        }
        throw error;
      }
    },
    authorizeSubmit: request =>
      post(authorizeSubmitPath, {
        client_id: request.clientId,
        redirect_uri: request.redirectUri,
        response_type: request.responseType,
        scopes: splitScopes(request.scope),
        user_id: request.userId,
        state: request.state,
        nonce: request.nonce,
        code_challenge: request.codeChallenge,
        code_challenge_method: request.codeChallengeMethod,
        resources: request.resource ? [request.resource] : undefined,
        consent_granted: request.consentGranted,
      }),
  };
}

function splitScopes(scope: string | undefined): string[] {
  return splitList(scope, []);
}

function validateStytchDomain(domain: string): void {
  const url = new URL(domain);
  if (url.protocol !== "https:") {
    throw new Error("PINGCODE_MCP_STYTCH_OAUTH_DOMAIN must use https");
  }
  const host = url.hostname;
  if (host === "api.stytch.com" || host === "test.stytch.com" || host.endsWith(".customers.stytch.com")) {
    return;
  }
  throw new Error("PINGCODE_MCP_STYTCH_OAUTH_DOMAIN must be a Stytch API or customer domain");
}

export function getConfiguredStytchUserId(config: OAuthConfig): string {
  const userId = required(config.stytchUserId, "PINGCODE_MCP_STYTCH_OAUTH_USER_ID");
  return userId.startsWith(config.stytchUserIdPrefix) ? userId : `${config.stytchUserIdPrefix}${userId}`;
}

export function renderOAuthAuthorizePage(config: OAuthConfig): string {
  const hasPassword = Boolean(config.consentPassword);
  const title = "PingCode MCP";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} Authorization</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #15171a; }
    main { width: min(520px, calc(100vw - 32px)); background: #fff; border: 1px solid #d9dde3; border-radius: 8px; padding: 24px; box-shadow: 0 12px 34px rgba(15, 23, 42, .08); }
    h1 { margin: 0 0 8px; font-size: 22px; line-height: 1.25; }
    p { color: #59616c; font-size: 14px; line-height: 1.5; }
    label { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; border: 1px solid #c7ccd4; border-radius: 6px; padding: 10px 12px; font-size: 15px; }
    button { border: 0; border-radius: 999px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; }
    button.primary { background: #0f766e; color: #fff; }
    button.secondary { background: #edf0f3; color: #1f2937; }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .scope { border: 1px solid #d9dde3; border-radius: 8px; padding: 10px 12px; margin-top: 8px; font-size: 14px; }
    .error { display: none; margin-top: 14px; border: 1px solid #f0b4b4; background: #fff2f2; color: #9f1d1d; border-radius: 8px; padding: 10px 12px; font-size: 14px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <h1>Authorize ${title}</h1>
    <p id="summary">Loading authorization request...</p>
    <form id="password-form" class="${hasPassword ? "" : "hidden"}">
      <label for="consent-password">Consent password</label>
      <input id="consent-password" name="consent-password" type="password" autocomplete="current-password">
      <div class="actions"><button class="primary" type="submit">Continue</button></div>
    </form>
    <section id="consent-panel" class="hidden">
      <div id="scope-list"></div>
      <div class="actions">
        <button id="deny" class="secondary" type="button">Deny</button>
        <button id="allow" class="primary" type="button">Allow</button>
      </div>
    </section>
    <div id="error" class="error"></div>
  </main>
  <script>
    const params = new URLSearchParams(window.location.search);
    const request = {
      client_id: params.get('client_id') || '',
      redirect_uri: params.get('redirect_uri') || '',
      response_type: params.get('response_type') || 'code',
      scope: params.get('scope') || '',
      state: params.get('state') || '',
      nonce: params.get('nonce') || '',
      code_challenge: params.get('code_challenge') || '',
      code_challenge_method: params.get('code_challenge_method') || ''
    };
    const hasPassword = ${JSON.stringify(hasPassword)};
    let consentPassword = '';
    const summary = document.getElementById('summary');
    const errorBox = document.getElementById('error');
    const passwordForm = document.getElementById('password-form');
    const consentPanel = document.getElementById('consent-panel');
    const scopeList = document.getElementById('scope-list');

    function showError(message) {
      errorBox.textContent = message;
      errorBox.style.display = 'block';
    }
    function clearError() {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
    async function post(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Request failed: ' + response.status);
      }
      return data;
    }
    async function loadStart() {
      clearError();
      if (!request.client_id || !request.redirect_uri) {
        showError('Missing OAuth request details. Please return to ChatGPT and try again.');
        return;
      }
      const data = await post('/api/oauth/stytch/authorize/start', { ...request, consent_password: consentPassword });
      const clientName = data.client?.client_name || data.client?.client_id || request.client_id;
      summary.textContent = clientName + ' wants access to PingCode MCP.';
      const scopes = data.scope_results?.length
        ? data.scope_results
        : (request.scope ? request.scope.split(/\\s+/).filter(Boolean).map(scope => ({ scope })) : []);
      scopeList.innerHTML = scopes.length
        ? scopes.map(item => '<div class="scope"><strong>' + escapeHtml(item.scope) + '</strong>' + (item.description ? '<br><span>' + escapeHtml(item.description) + '</span>' : '') + '</div>').join('')
        : '<p>No scopes requested.</p>';
      passwordForm.classList.add('hidden');
      consentPanel.classList.remove('hidden');
    }
    async function submit(consentGranted) {
      clearError();
      const data = await post('/api/oauth/stytch/authorize/submit', {
        ...request,
        consent_password: consentPassword,
        consent_granted: consentGranted
      });
      if (!data.redirect_uri) {
        showError('Authorization did not return a redirect URL.');
        return;
      }
      window.location.assign(data.redirect_uri);
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }
    passwordForm.addEventListener('submit', event => {
      event.preventDefault();
      consentPassword = document.getElementById('consent-password').value;
      loadStart().catch(error => showError(error.message));
    });
    document.getElementById('allow').addEventListener('click', () => submit(true).catch(error => showError(error.message)));
    document.getElementById('deny').addEventListener('click', () => submit(false).catch(error => showError(error.message)));
    if (!hasPassword) {
      loadStart().catch(error => showError(error.message));
    }
  </script>
</body>
</html>`;
}

export async function handleStytchAuthorizeApi(
  req: IncomingMessage,
  res: ServerResponse,
  config: OAuthConfig,
): Promise<boolean> {
  if (req.method !== "POST") return false;
  if (req.url?.startsWith("/api/oauth/stytch/authorize/start")) {
    const body = await readJsonBody(req);
    if (!isConsentAuthorized(req, config, body)) {
      writeJson(res, 401, { error: "Invalid consent password" });
      return true;
    }
    setConsentCookie(res, config);
    const client = stytchClientFromConfig(config);
    const response = await client.authorizeStart({
      clientId: requiredString(body.client_id, "client_id"),
      redirectUri: requiredString(body.redirect_uri, "redirect_uri"),
      responseType: optionalString(body.response_type) ?? "code",
      scope: optionalString(body.scope) ?? "",
      userId: getConfiguredStytchUserId(config),
    });
    writeJson(res, 200, response);
    return true;
  }
  if (req.url?.startsWith("/api/oauth/stytch/authorize/submit")) {
    const body = await readJsonBody(req);
    if (!isConsentAuthorized(req, config, body)) {
      writeJson(res, 401, { error: "Invalid consent password" });
      return true;
    }
    setConsentCookie(res, config);
    const client = stytchClientFromConfig(config);
    const response = await client.authorizeSubmit({
      clientId: requiredString(body.client_id, "client_id"),
      redirectUri: requiredString(body.redirect_uri, "redirect_uri"),
      responseType: optionalString(body.response_type) ?? "code",
      scope: optionalString(body.scope) ?? "",
      state: optionalString(body.state),
      nonce: optionalString(body.nonce),
      codeChallenge: optionalString(body.code_challenge),
      codeChallengeMethod: optionalString(body.code_challenge_method),
      resource: config.resource,
      userId: getConfiguredStytchUserId(config),
      consentGranted: Boolean(body.consent_granted),
    });
    writeJson(res, 200, response);
    return true;
  }
  return false;
}

function stytchClientFromConfig(config: OAuthConfig): StytchOAuthClient {
  return createStytchOAuthClient({
    domain: config.stytchDomain,
    projectId: config.stytchProjectId,
    secret: config.stytchSecret,
    userEmail: config.stytchUserEmail,
  });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxJsonBodyBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object");
  }
  return parsed as Record<string, unknown>;
}

function isConsentAuthorized(
  req: IncomingMessage,
  config: OAuthConfig,
  body: Record<string, unknown>,
): boolean {
  if (!config.consentPassword) return true;
  if (verifyConsentCookie(req, config)) return true;
  return optionalString(body.consent_password) === config.consentPassword;
}

function setConsentCookie(res: ServerResponse, config: OAuthConfig): void {
  if (!config.consentPassword) return;
  const expiresAt = Math.floor(Date.now() / 1000) + consentSessionMaxAgeSeconds;
  const payload = `${expiresAt}`;
  const signature = signConsentPayload(payload, config);
  const secure = config.publicUrl?.startsWith("https://") ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${consentCookieName}=${encodeURIComponent(`${payload}.${signature}`)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${consentSessionMaxAgeSeconds}${secure}`,
  );
}

function verifyConsentCookie(req: IncomingMessage, config: OAuthConfig): boolean {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader || !config.consentPassword) return false;
  const value = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${consentCookieName}=`))
    ?.slice(consentCookieName.length + 1);
  if (!value) return false;
  const [expiresAtText, signature] = decodeURIComponent(value).split(".");
  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = signConsentPayload(expiresAtText, config);
  return safeEqual(signature, expected);
}

function signConsentPayload(payload: string, config: OAuthConfig): string {
  return createHmac("sha256", required(config.consentPassword, "PINGCODE_MCP_STYTCH_OAUTH_CONSENT_PASSWORD"))
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function stytchErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error_message", "message", "error"]) {
      if (typeof record[key] === "string") return record[key];
    }
  }
  return `Stytch request failed: ${status}`;
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Missing OAuth parameter: ${label}`);
  return value;
}

export const oauthRoutes = {
  metadataPath: oauthMetadataPath,
  metadataRootPath: oauthMetadataRootPath,
  authorizePath: "/oauth/authorize",
};
