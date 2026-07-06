import assert from "node:assert/strict";
import { test } from "node:test";

import { getHttpListenConfig } from "../src/http.js";
import { createPingCodeServer, pingCodeServerInfo } from "../src/server.js";
import { errorResult, textResult } from "../src/tools/format.js";

import { makeConfig } from "./helpers.js";

function outputShapeKeys(tool: { outputSchema?: { _def?: { shape?: () => Record<string, unknown> } } }) {
  return Object.keys(tool.outputSchema?._def?.shape?.() ?? {});
}

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

test("createPingCodeServer uses concrete output schemas for representative tools", () => {
  const server = createPingCodeServer(makeConfig());
  const tools = (server as unknown as {
    _registeredTools: Record<string, { outputSchema?: { _def?: { shape?: () => Record<string, unknown> } } }>;
  })._registeredTools;

  for (const [name, tool] of Object.entries(tools)) {
    assert.ok(tool.outputSchema, `${name} should declare an output schema`);
    assert.ok(outputShapeKeys(tool).length > 1, `${name} should not use the generic ok-only schema`);
  }
  assert.deepEqual(outputShapeKeys(tools.pingcode_auth_logout).sort(), ["cleared", "ok"].sort());
  assert.deepEqual(outputShapeKeys(tools.pingcode_list_bugs).sort(), [
    "ok",
    "pageIndex",
    "pageSize",
    "total",
    "values",
  ].sort());
  assert.ok(outputShapeKeys(tools.pingcode_create_work_item).includes("dryRun"));
});

test("createPingCodeServer exposes curated PingCode discovery tools as read-only", () => {
  const server = createPingCodeServer(makeConfig());
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      _meta?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
      outputSchema?: { _def?: { shape?: () => Record<string, unknown> } };
    }>;
  })._registeredTools;
  const names = [
    "pingcode_list_projects",
    "pingcode_list_project_members",
    "pingcode_list_work_item_types",
    "pingcode_list_work_item_states",
    "pingcode_list_work_item_priorities",
    "pingcode_list_work_item_tags",
    "pingcode_list_iterations",
    "pingcode_list_boards",
    "pingcode_list_relation_types",
  ];

  for (const name of names) {
    assert.ok(tools[name], `${name} should be registered`);
    assert.deepEqual(tools[name]._meta?.securitySchemes, [{ type: "oauth2", scopes: ["pingcode.read"] }]);
    assert.equal(tools[name].annotations?.readOnlyHint, true);
    assert.ok(outputShapeKeys(tools[name]).includes("values"), `${name} should return a values list`);
  }
});

test("tool formatter returns structured content for output schema validation", () => {
  const value = { ok: true, team: { id: "team-1", name: "Team" } };
  const result = textResult(value);

  assert.deepEqual(result.structuredContent, value);
  assert.equal(result.content[0]?.text, JSON.stringify(value, null, 2));
});

test("tool formatter marks caught errors as MCP tool errors", () => {
  const result = errorResult(new Error("boom"));

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, undefined);
  assert.equal(result.content[0]?.text, JSON.stringify({ ok: false, error: "boom" }, null, 2));
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
