#!/usr/bin/env node
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { pathToFileURL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  assertStytchOAuthConfig,
  buildOAuthChallenge,
  buildProtectedResourceMetadata,
  handleStytchAuthorizeApi,
  isStytchAuthMode,
  oauthRoutes,
  parseOAuthConfig,
  renderOAuthAuthorizePage,
  verifyStytchAccessToken,
} from "./oauth.js";
import { createPingCodeServer } from "./server.js";

export function getHttpListenConfig(env: NodeJS.ProcessEnv = process.env) {
  const host = env.PINGCODE_MCP_HOST ?? "127.0.0.1";
  const portValue = env.PORT ?? env.PINGCODE_MCP_PORT ?? "3000";
  const port = Number.parseInt(portValue, 10);
  const token = env.PINGCODE_MCP_HTTP_TOKEN;
  const oauthConfig = parseOAuthConfig(env);
  const allowUnauthenticated = ["1", "true", "yes", "y"].includes(
    (env.PINGCODE_MCP_ALLOW_UNAUTHENTICATED ?? "").toLowerCase(),
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MCP HTTP port: ${portValue}`);
  }

  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!isLoopback && isStytchAuthMode(oauthConfig)) {
    assertStytchOAuthConfig(oauthConfig, { requireConsentPassword: true });
  }
  if (!isLoopback && !token && !isStytchAuthMode(oauthConfig) && !allowUnauthenticated) {
    throw new Error(
      "PINGCODE_MCP_HTTP_TOKEN is required when PINGCODE_MCP_HOST is not loopback. Set PINGCODE_MCP_ALLOW_UNAUTHENTICATED=true only behind trusted network controls.",
    );
  }

  return { host, port, token };
}

async function isAuthorized(req: IncomingMessage, token: string | undefined, oauthConfig: ReturnType<typeof parseOAuthConfig>) {
  if (oauthConfig.authMode === "none") return true;

  const authorization = req.headers.authorization;
  if (
    (oauthConfig.authMode === "token" || oauthConfig.authMode === "stytch,token" || oauthConfig.allowStaticToken) &&
    token &&
    authorization === `Bearer ${token}`
  ) {
    return true;
  }
  if (oauthConfig.authMode === "token") {
    return !token;
  }
  if (isStytchAuthMode(oauthConfig) && authorization?.startsWith("Bearer ")) {
    try {
      await verifyStytchAccessToken(authorization.slice("Bearer ".length), oauthConfig);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function main() {
  const { host, port, token } = getHttpListenConfig();
  const oauthConfig = parseOAuthConfig();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }

    if (url.pathname === oauthRoutes.metadataRootPath || url.pathname === oauthRoutes.metadataPath) {
      try {
        res.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(buildProtectedResourceMetadata(oauthConfig)));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "OAuth metadata is not configured" }));
      }
      return;
    }

    if (url.pathname === oauthRoutes.authorizePath && req.method === "GET") {
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      res.end(renderOAuthAuthorizePage(oauthConfig));
      return;
    }

    try {
      if (await handleStytchAuthorizeApi(req, res, oauthConfig)) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "OAuth authorization failed";
      res.writeHead(400, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
      return;
    }

    if (url.pathname === "/mcp" && (req.method === "GET" || req.method === "POST")) {
      if (!(await isAuthorized(req, token, oauthConfig))) {
        res.writeHead(401, {
          "content-type": "text/plain; charset=utf-8",
          "www-authenticate": isStytchAuthMode(oauthConfig) ? buildOAuthChallenge(oauthConfig) : "Bearer",
        });
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
