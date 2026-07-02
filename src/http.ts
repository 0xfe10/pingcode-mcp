#!/usr/bin/env node
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createPingCodeServer } from "./server.js";

export function getHttpListenConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.PINGCODE_MCP_HOST ?? "127.0.0.1";
  const portValue = env.PORT ?? env.PINGCODE_MCP_PORT ?? "3000";
  const port = Number.parseInt(portValue, 10);
  const token = env.PINGCODE_MCP_HTTP_TOKEN;
  const allowUnauthenticated = ["1", "true", "yes", "y"].includes(
    (env.PINGCODE_MCP_ALLOW_UNAUTHENTICATED ?? "").toLowerCase(),
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MCP HTTP port: ${portValue}`);
  }

  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLoopback && !token && !allowUnauthenticated) {
    throw new Error(
      "PINGCODE_MCP_HTTP_TOKEN is required when PINGCODE_MCP_HOST is not loopback. Set PINGCODE_MCP_ALLOW_UNAUTHENTICATED=true only behind trusted network controls.",
    );
  }

  return { host, port, token };
}

function isAuthorized(req: IncomingMessage, token?: string) {
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

async function main() {
  const { host, port, token } = getHttpListenConfig();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }

    if (url.pathname === "/mcp" && (req.method === "GET" || req.method === "POST")) {
      if (!isAuthorized(req, token)) {
        res.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        res.end("unauthorized");
        return;
      }

      const mcpServer = createPingCodeServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        void transport.close();
        void mcpServer.close();
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[pingcode-mcp] HTTP transport error: ${message}`);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          }),
        );
      }
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, resolve);
  });

  console.error(`[pingcode-mcp] HTTP transport listening on ${host}:${port}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pingcode-mcp] ${message}`);
    process.exit(1);
  });
}
