import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";

import { exportJWK, SignJWT } from "jose";

import {
  buildOAuthChallenge,
  buildProtectedResourceMetadata,
  createStytchOAuthClient,
  parseOAuthConfig,
  renderOAuthAuthorizePage,
  verifyStytchAccessToken,
} from "../src/oauth.js";

import { installFetchStub } from "./helpers.js";

test("parseOAuthConfig builds Stytch OAuth settings from env", () => {
  const config = parseOAuthConfig({
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com/",
    PINGCODE_MCP_AUTH_MODE: "stytch,token",
    PINGCODE_MCP_OAUTH_SCOPES_SUPPORTED: "pingcode.read pingcode.write",
    PINGCODE_MCP_OAUTH_REQUIRED_SCOPES: "pingcode.read",
    PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com/",
    PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE: "pingcode-mcp",
    PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID: "project-test",
    PINGCODE_MCP_STYTCH_OAUTH_SECRET: "secret-test",
    PINGCODE_MCP_STYTCH_OAUTH_USER_ID: "user-test",
    PINGCODE_MCP_STYTCH_OAUTH_CONSENT_PASSWORD: "consent-test",
  });

  assert.equal(config.authMode, "stytch,token");
  assert.equal(config.resource, "https://mcp.example.com/mcp");
  assert.equal(config.resourceMetadataUrl, "https://mcp.example.com/.well-known/oauth-protected-resource/mcp");
  assert.equal(config.issuer, "https://project.customers.stytch.com");
  assert.equal(config.jwksUrl, "https://project.customers.stytch.com/.well-known/jwks.json");
  assert.deepEqual(config.scopesSupported, ["pingcode.read", "pingcode.write"]);
  assert.deepEqual(config.requiredScopes, ["pingcode.read"]);
});

test("buildProtectedResourceMetadata emits MCP resource metadata", () => {
  const config = parseOAuthConfig({
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
    PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com",
  });

  assert.deepEqual(buildProtectedResourceMetadata(config), {
    resource: "https://mcp.example.com/mcp",
    authorization_servers: ["https://project.customers.stytch.com"],
    scopes_supported: ["pingcode.read", "pingcode.write"],
    bearer_methods_supported: ["header"],
    resource_name: "PingCode MCP",
  });
});

test("parseOAuthConfig defaults Stytch audience to project id and requires read/write scopes", () => {
  const config = parseOAuthConfig({
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
    PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com",
    PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID: "project-live-test",
  });

  assert.equal(config.audience, "project-live-test");
  assert.deepEqual(config.requiredScopes, ["pingcode.read", "pingcode.write"]);
});

test("verifyStytchAccessToken validates issuer audience and required scopes", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...jwk, kid: "kid-test", alg: "RS256", use: "sig" }] };
  const token = await new SignJWT({ scope: "pingcode.read pingcode.write" })
    .setProtectedHeader({ alg: "RS256", kid: "kid-test" })
    .setIssuer("https://project.customers.stytch.com")
    .setAudience("pingcode-mcp")
    .setSubject("user-test")
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(privateKey);

  const fetchStub = installFetchStub(req => {
    if (req.url === "https://project.customers.stytch.com/.well-known/jwks.json") {
      return { json: jwks };
    }
    return undefined;
  });
  try {
    const info = await verifyStytchAccessToken(
      token,
      parseOAuthConfig({
        PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
        PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com",
        PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE: "pingcode-mcp",
        PINGCODE_MCP_OAUTH_REQUIRED_SCOPES: "pingcode.read",
      }),
    );
    assert.equal(info.subject, "user-test");
    assert.deepEqual(info.scopes, ["pingcode.read", "pingcode.write"]);
  } finally {
    fetchStub.restore();
  }
});

test("verifyStytchAccessToken rejects missing required scopes", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  const token = await new SignJWT({ scope: "pingcode.read" })
    .setProtectedHeader({ alg: "RS256", kid: "kid-test" })
    .setIssuer("https://project-2.customers.stytch.com")
    .setAudience("pingcode-mcp")
    .setSubject("user-test")
    .setExpirationTime("10m")
    .setIssuedAt()
    .sign(privateKey);

  const fetchStub = installFetchStub(req => {
    if (req.url === "https://project-2.customers.stytch.com/.well-known/jwks.json") {
      return { json: { keys: [{ ...jwk, kid: "kid-test", alg: "RS256", use: "sig" }] } };
    }
    return undefined;
  });
  try {
    await assert.rejects(
      () =>
        verifyStytchAccessToken(
          token,
          parseOAuthConfig({
            PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
            PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project-2.customers.stytch.com",
            PINGCODE_MCP_STYTCH_OAUTH_AUDIENCE: "pingcode-mcp",
            PINGCODE_MCP_OAUTH_REQUIRED_SCOPES: "pingcode.write",
          }),
        ),
      /Missing required scope: pingcode.write/,
    );
  } finally {
    fetchStub.restore();
  }
});

test("Stytch authorize client submits user, PKCE, resource and consent", async () => {
  const fetchStub = installFetchStub(req => {
    if (req.url === "https://test.stytch.com/v1/idp/oauth/authorize/start") {
      assert.equal(req.authorization, "Basic cHJvamVjdC10ZXN0OnNlY3JldC10ZXN0");
      assert.deepEqual(req.body, {
        client_id: "client-test",
        redirect_uri: "https://chatgpt.com/connector/oauth/callback",
        response_type: "code",
        scopes: ["pingcode.read"],
        user_id: "pingcode:user-test",
      });
      return {
        json: {
          client: { client_id: "client-test", client_name: "ChatGPT" },
          consent_required: true,
          scope_results: [],
        },
      };
    }
    if (req.url === "https://test.stytch.com/v1/idp/oauth/authorize") {
      assert.deepEqual(req.body, {
        client_id: "client-test",
        redirect_uri: "https://chatgpt.com/connector/oauth/callback",
        response_type: "code",
        scopes: ["pingcode.read"],
        user_id: "pingcode:user-test",
        state: "state-test",
        nonce: "nonce-test",
        code_challenge: "challenge-test",
        resources: ["https://mcp.example.com/mcp"],
        consent_granted: true,
      });
      return { json: { redirect_uri: "https://chatgpt.com/connector/oauth/callback?code=ok" } };
    }
    return undefined;
  });

  try {
    const client = createStytchOAuthClient({
      domain: "https://test.stytch.com",
      projectId: "project-test",
      secret: "secret-test",
    });
    const start = await client.authorizeStart({
      clientId: "client-test",
      redirectUri: "https://chatgpt.com/connector/oauth/callback",
      responseType: "code",
      scope: "pingcode.read",
      userId: "pingcode:user-test",
    });
    assert.equal(start.client.client_name, "ChatGPT");

    const submit = await client.authorizeSubmit({
      clientId: "client-test",
      redirectUri: "https://chatgpt.com/connector/oauth/callback",
      responseType: "code",
      scope: "pingcode.read",
      state: "state-test",
      nonce: "nonce-test",
      codeChallenge: "challenge-test",
      codeChallengeMethod: "S256",
      resource: "https://mcp.example.com/mcp",
      userId: "pingcode:user-test",
      consentGranted: true,
    });
    assert.equal(submit.redirect_uri, "https://chatgpt.com/connector/oauth/callback?code=ok");
  } finally {
    fetchStub.restore();
  }
});

test("renderOAuthAuthorizePage includes authorize endpoints without leaking secrets", () => {
  const html = renderOAuthAuthorizePage(parseOAuthConfig({
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
    PINGCODE_MCP_STYTCH_OAUTH_SECRET: "secret-test",
  }));
  assert.match(html, /PingCode MCP/);
  assert.match(html, /\/api\/oauth\/stytch\/authorize\/start/);
  assert.doesNotMatch(html, /secret-test/);
});

test("buildOAuthChallenge points ChatGPT to protected resource metadata", () => {
  const challenge = buildOAuthChallenge(parseOAuthConfig({
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
  }));
  assert.equal(
    challenge,
    'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="A valid Stytch OAuth access token is required"',
  );
});
