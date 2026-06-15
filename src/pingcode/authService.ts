import { randomUUID } from "node:crypto";

import type { PingCodeConfig } from "../config.js";
import type { AuthStore } from "./authStore.js";
import { normalizeExpiresAt, PingCodeClient } from "./client.js";
import type { PingCodeUser } from "./types.js";

/** auth_status 返回结构：不含任何 token 值，过期只给相对秒数。 */
export type AuthStatus =
  | { mode: "user"; hasUserToken: true; expiresInSeconds?: number; user?: PingCodeUser }
  | { mode: "env-token"; hasUserToken: false }
  | { mode: "application"; hasUserToken: false; note: string };

/**
 * 用户态 OAuth 编排：构造授权 URL、用授权码登录、查询状态、登出。
 * 持有共享 authStore，并据此构造内部 client（client 的 getAuthorization 会优先用用户态 token）。
 */
export class AuthService {
  private readonly client: PingCodeClient;

  constructor(
    private readonly config: PingCodeConfig,
    private readonly authStore: AuthStore,
  ) {
    this.client = new PingCodeClient(config, authStore);
  }

  /** 构造浏览器授权 URL；缺 client_id 抛中文错误。state 仅作 URL 内防护。 */
  buildAuthorizeUrl(): { url: string; state: string } {
    if (!this.config.clientId) {
      throw new Error(
        "缺少 PINGCODE_CLIENT_ID，无法发起浏览器授权。请配置 PINGCODE_CLIENT_ID / PINGCODE_CLIENT_SECRET，并在 PingCode 后台凭据管理中设置 redirect_uri。",
      );
    }

    const state = randomUUID();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
    });
    if (this.config.oauthRedirectUri) {
      params.set("redirect_uri", this.config.oauthRedirectUri);
    }
    params.set("state", state);

    return { url: `${this.config.oauthAuthorizeUrl}?${params.toString()}`, state };
  }

  /** 用授权码换 token、持久化（0600），再读取 /v1/myself；返回不含任何 token。 */
  async loginWithCode(code: string): Promise<{ ok: true; user: PingCodeUser }> {
    const token = await this.client.exchangeAuthorizationCode(code);
    this.authStore.save({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: token.token_type ?? "Bearer",
      expiresAt: normalizeExpiresAt(token.expires_in),
      savedAt: Date.now(),
    });
    const user = await this.client.getCurrentUser();
    return { ok: true, user };
  }

  /** 鉴权状态；绝不返回 token。有用户态 token 时尽力读 /v1/myself，失败则省略 user。 */
  async status(): Promise<AuthStatus> {
    const stored = this.authStore.get();
    if (stored?.accessToken) {
      const expiresInSeconds =
        stored.expiresAt === undefined ? undefined : Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000));
      try {
        const user = await this.client.getCurrentUser();
        return { mode: "user", hasUserToken: true, expiresInSeconds, user };
      } catch {
        return { mode: "user", hasUserToken: true, expiresInSeconds };
      }
    }

    if (this.config.accessToken) {
      return { mode: "env-token", hasUserToken: false };
    }

    return {
      mode: "application",
      hasUserToken: false,
      note: "未授权，将使用 client_credentials/默认负责人。",
    };
  }

  /** 清除本地用户态 token。 */
  logout(): { ok: true; cleared: boolean } {
    this.authStore.clear();
    return { ok: true, cleared: true };
  }
}
