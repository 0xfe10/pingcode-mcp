#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createPingCodeServer } from "./server.js";

async function main() {
  const server = createPingCodeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[pingcode-mcp] ${message}`);
  process.exit(1);
});
