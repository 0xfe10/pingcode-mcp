import os from "node:os";
import path from "node:path";

import "dotenv/config";

export interface PingCodeConfig {
  baseUrl: string;
  apiBaseUrl: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  authScheme: string;
  oauthAuthorizeUrl?: string;
  oauthRedirectUri?: string;
  authTokenPath: string;
  projectIdentifier?: string;
  projectId?: string;
  defaultAssigneeName?: string;
  bugTypeId?: string;
  requirementTypeId?: string;
  readonly: boolean;
  timeoutMs: number;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === "") return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, defaultValue: number): number {
  if (value == null || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(): PingCodeConfig {
  const baseUrl = trimTrailingSlash(
    process.env.PINGCODE_BASE_URL ?? "https://your-domain.pingcode.com",
  );
  const apiBaseUrl = trimTrailingSlash(process.env.PINGCODE_API_BASE_URL ?? "https://open.pingcode.com");

  const configHome = readOptional(process.env.XDG_CONFIG_HOME) ?? path.join(os.homedir(), ".config");
  const authTokenPath =
    readOptional(process.env.PINGCODE_AUTH_TOKEN_PATH) ?? path.join(configHome, "pingcode-mcp", "auth.json");

  return {
    baseUrl,
    apiBaseUrl,
    accessToken: readOptional(process.env.PINGCODE_ACCESS_TOKEN),
    clientId: readOptional(process.env.PINGCODE_CLIENT_ID),
    clientSecret: readOptional(process.env.PINGCODE_CLIENT_SECRET),
    authScheme: readOptional(process.env.PINGCODE_AUTH_SCHEME) ?? "Bearer",
    oauthAuthorizeUrl: readOptional(process.env.PINGCODE_OAUTH_AUTHORIZE_URL) ?? `${baseUrl}/oauth2/authorize`,
    oauthRedirectUri: readOptional(process.env.PINGCODE_OAUTH_REDIRECT_URI),
    authTokenPath,
    projectIdentifier: readOptional(process.env.PINGCODE_PROJECT_IDENTIFIER),
    projectId: readOptional(process.env.PINGCODE_PROJECT_ID),
    defaultAssigneeName: readOptional(process.env.PINGCODE_DEFAULT_ASSIGNEE_NAME),
    bugTypeId: readOptional(process.env.PINGCODE_BUG_TYPE_ID) || "bug",
    requirementTypeId: readOptional(process.env.PINGCODE_REQUIREMENT_TYPE_ID),
    readonly: readBoolean(process.env.PINGCODE_READONLY, false),
    timeoutMs: readNumber(process.env.PINGCODE_TIMEOUT_MS, 15000),
  };
}

export function assertWritable(config: PingCodeConfig): void {
  if (config.readonly) {
    throw new Error("PINGCODE_READONLY=true，写操作已被禁用。");
  }
}
