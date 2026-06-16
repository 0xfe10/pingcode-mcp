import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PingCodeConfig } from "../src/config.js";

/** 记录到 fetch stub 的单次请求信息。 */
export interface RecordedRequest {
  method: string;
  url: string;
  authorization?: string;
  body?: unknown;
}

/** 一条 stub 响应：可按调用顺序逐个返回。 */
export interface StubResponse {
  status?: number;
  json?: unknown;
  text?: string;
}

export interface FetchStub {
  requests: RecordedRequest[];
  restore: () => void;
}

/**
 * 安装一个按 (method,url) 路由的 fetch stub。
 * - matcher 返回 StubResponse 或 undefined（undefined 时回退 404）。
 * - 记录每次请求的 method/url/Authorization/body。
 */
export function installFetchStub(matcher: (req: RecordedRequest) => StubResponse | undefined): FetchStub {
  const requests: RecordedRequest[] = [];
  const original = globalThis.fetch;

  const stub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const authorization = headers.get("Authorization") ?? undefined;
    const rawBody = init?.body;
    const body = typeof rawBody === "string" ? safeParse(rawBody) : undefined;

    const recorded: RecordedRequest = { method, url, authorization, body };
    requests.push(recorded);

    const result = matcher(recorded);
    if (!result) {
      return new Response("not stubbed", { status: 404 });
    }
    const text = result.text ?? (result.json === undefined ? "" : JSON.stringify(result.json));
    return new Response(text, { status: result.status ?? 200 });
  };

  globalThis.fetch = stub as typeof globalThis.fetch;

  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 临时 token 文件路径（唯一名，测试可自行 clear）。 */
export function tempAuthPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pingcode-${name}-`));
  return join(dir, "auth.json");
}

/** 构造测试用 PingCodeConfig，可覆盖任意字段。 */
export function makeConfig(overrides: Partial<PingCodeConfig> = {}): PingCodeConfig {
  return {
    baseUrl: "https://tenant.pingcode.com",
    apiBaseUrl: "https://open.pingcode.com",
    authScheme: "Bearer",
    authTokenPath: tempAuthPath("cfg"),
    projectIdentifier: "PROJ",
    bugTypeId: "bug",
    readonly: false,
    timeoutMs: 5000,
    ...overrides,
  };
}
