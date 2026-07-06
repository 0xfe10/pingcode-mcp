import assert from "node:assert/strict";
import { test } from "node:test";

import { getHttpListenConfig } from "../src/http.js";
import { createPingCodeServer, pingCodeServerInfo } from "../src/server.js";

import { makeConfig } from "./helpers.js";

test("createPingCodeServer returns PingCode MCP server metadata", () => {
  const server = createPingCodeServer(makeConfig());
  assert.ok(server);
  assert.deepEqual(pingCodeServerInfo, {
    name: "pingcode-mcp",
    version: "0.1.0",
  });
});

test("createPingCodeServer attaches ChatGPT metadata to tools", () => {
  const server = createPingCodeServer(makeConfig());
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      _meta?: Record<string, unknown>;
      outputSchema?: unknown;
      annotations?: Record<string, unknown>;
    }>;
  })
    ._registeredTools;
  const readTool = tools.pingcode_get_current_team;
  const writeTool = tools.pingcode_create_work_item;
  assert.deepEqual(readTool._meta?.securitySchemes, [
    { type: "oauth2", scopes: ["pingcode.read"] },
  ]);
  assert.deepEqual(writeTool._meta?.securitySchemes, [
    { type: "oauth2", scopes: ["pingcode.read", "pingcode.write"] },
  ]);
  assert.ok(readTool.outputSchema);
  assert.ok(writeTool.outputSchema);
  assert.equal(readTool.annotations?.readOnlyHint, true);
  assert.equal(writeTool.annotations?.readOnlyHint, false);
});

test("getHttpListenConfig defaults to loopback on port 3000", () => {
  const config = getHttpListenConfig({});
  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 3000,
    token: undefined,
  });
});

test("getHttpListenConfig requires token for non-loopback host", () => {
  assert.throws(
    () => getHttpListenConfig({ PINGCODE_MCP_HOST: "0.0.0.0" }),
    /PINGCODE_MCP_HTTP_TOKEN is required/,
  );
});

test("getHttpListenConfig requires explicit unauthenticated opt-in for remote none mode", () => {
  assert.throws(
    () => getHttpListenConfig({ PINGCODE_MCP_HOST: "0.0.0.0", PINGCODE_MCP_AUTH_MODE: "none" }),
    /PINGCODE_MCP_HTTP_TOKEN is required/,
  );
});

test("getHttpListenConfig allows non-loopback host with Stytch auth", () => {
  const config = getHttpListenConfig({
    PINGCODE_MCP_HOST: "0.0.0.0",
    PINGCODE_MCP_AUTH_MODE: "stytch",
    PINGCODE_MCP_PUBLIC_URL: "https://mcp.example.com",
    PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com",
    PINGCODE_MCP_STYTCH_OAUTH_PROJECT_ID: "project-test",
    PINGCODE_MCP_STYTCH_OAUTH_SECRET: "secret-test",
    PINGCODE_MCP_STYTCH_OAUTH_USER_ID: "user-test",
    PINGCODE_MCP_STYTCH_OAUTH_CONSENT_PASSWORD: "consent-test",
  });
  assert.deepEqual(config, {
    host: "0.0.0.0",
    port: 3000,
    token: undefined,
  });
});

test("getHttpListenConfig rejects incomplete remote Stytch auth", () => {
  assert.throws(
    () => getHttpListenConfig({
      PINGCODE_MCP_HOST: "0.0.0.0",
      PINGCODE_MCP_AUTH_MODE: "stytch",
      PINGCODE_MCP_STYTCH_OAUTH_DOMAIN: "https://project.customers.stytch.com",
    }),
    /PINGCODE_MCP_PUBLIC_URL/,
  );
});

test("getHttpListenConfig allows non-loopback host with token", () => {
  const config = getHttpListenConfig({
    PINGCODE_MCP_HOST: "0.0.0.0",
    PINGCODE_MCP_HTTP_TOKEN: "test-token",
  });
  assert.deepEqual(config, {
    host: "0.0.0.0",
    port: 3000,
    token: "test-token",
  });
});
