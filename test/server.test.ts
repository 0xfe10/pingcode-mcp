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
