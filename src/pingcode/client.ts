import type { PingCodeConfig } from "../config.js";
import type { AuthStore } from "./authStore.js";
import type {
  BulkUpdatePayload,
  PageResponse,
  PingCodeComment,
  PingCodeProject,
  PingCodeTeam,
  PingCodeUser,
  ProjectMember,
  RelationType,
  WorkItem,
  WorkItemListQuery,
  WorkItemPayload,
  WorkItemPriority,
  WorkItemRelation,
  WorkItemState,
  WorkItemStateFlow,
  WorkItemStatePlan,
  WorkItemType,
} from "./types.js";

export class PingCodeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseText: string,
  ) {
    super(message);
    this.name = "PingCodeApiError";
  }

  /** 序列化时只暴露 name/message/status，绝不输出原始响应体（可能含 token/secret）。 */
  toJSON(): { name: string; message: string; status: number } {
    return { name: this.name, message: this.message, status: this.status };
  }

  /** 对任意文本做脱敏：打码 access_token/refresh_token/client_secret/code 的值与 Bearer 令牌。 */
  static mask(text: string): string {
    return text
      .replace(/("?(access_token|refresh_token|client_secret|code)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, "$1***")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");
  }
}

type QueryValue = string | number | boolean | undefined;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** 用户态 token 缺省有效期（30 天），仅在 token 响应未带 expires_in 时兜底。 */
const DEFAULT_USER_TOKEN_TTL_SECONDS = 30 * 24 * 3600;

/** expires_in 归一为绝对毫秒时间戳：大于 1e9 视为已是秒级绝对时间戳，否则按相对秒数推算。 */
export function normalizeExpiresAt(expiresIn: number | undefined): number {
  const seconds = expiresIn ?? DEFAULT_USER_TOKEN_TTL_SECONDS;
  return seconds > 1e9 ? seconds * 1000 : Date.now() + seconds * 1000;
}

/** token 端点响应类型别名：access_token 必定存在，其余字段可选。 */
export type TokenExchangeResult = Required<Pick<TokenResponse, "access_token">> & TokenResponse;

export class PingCodeClient {
  private cachedAuthorization?: string;
  private cachedAuthorizationExpiresAt = 0;

  constructor(
    private readonly config: PingCodeConfig,
    private readonly authStore?: AuthStore,
  ) {}

  async listProjects(identifier?: string): Promise<PageResponse<PingCodeProject>> {
    return this.request("GET", "/v1/project/projects", {
      query: {
        identifier,
        include_archived: false,
        include_deleted: false,
      },
    });
  }

  async getCurrentTeam(): Promise<PingCodeTeam> {
    return this.request<PingCodeTeam>("GET", "/v1/directory/team");
  }

  async getCurrentUser(): Promise<PingCodeUser> {
    return this.request<PingCodeUser>("GET", "/v1/myself");
  }

  async listEnterpriseUsers(query: Record<string, QueryValue>): Promise<PageResponse<PingCodeUser>> {
    return this.request<PageResponse<PingCodeUser>>("GET", "/v1/directory/users", { query });
  }

  async resolveProject(projectIdentifier?: string, projectId?: string): Promise<PingCodeProject> {
    if (projectId) {
      return {
        id: projectId,
        identifier: projectIdentifier ?? this.config.projectIdentifier,
        name: projectIdentifier ?? projectId,
      };
    }

    const identifier = projectIdentifier ?? this.config.projectIdentifier;
    if (!identifier) {
      throw new Error("未配置 PingCode 项目标识；请传入 projectIdentifier/projectId，或设置 PINGCODE_PROJECT_IDENTIFIER。");
    }
    const page = await this.listProjects(identifier);
    const project = page.values.find(item => item.identifier === identifier) ?? page.values[0];
    if (!project) {
      throw new Error(`未找到 PingCode 项目：${identifier}`);
    }
    return project;
  }

  async getWorkItemTypes(projectId: string): Promise<WorkItemType[]> {
    const page = await this.request<PageResponse<WorkItemType>>("GET", "/v1/project/work_item/types", {
      query: { project_id: projectId },
    });
    return page.values;
  }

  async getWorkItemStates(projectId: string, typeId: string): Promise<WorkItemState[]> {
    const page = await this.request<PageResponse<WorkItemState>>("GET", "/v1/project/work_item/states", {
      query: { project_id: projectId, work_item_type_id: typeId },
    });
    return page.values;
  }

  async getWorkItemPriorities(projectId: string): Promise<WorkItemPriority[]> {
    const page = await this.request<PageResponse<WorkItemPriority>>("GET", "/v1/project/work_item/priorities", {
      query: { project_id: projectId },
    });
    return page.values;
  }

  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const page = await this.request<PageResponse<ProjectMember>>(
      "GET",
      `/v1/project/projects/${encodeURIComponent(projectId)}/members`,
    );
    return page.values;
  }

  async getWorkItemStatePlans(projectId: string): Promise<WorkItemStatePlan[]> {
    const page = await this.request<PageResponse<WorkItemStatePlan>>("GET", "/v1/project/work_item_state_plans", {
      query: { project_id: projectId },
    });
    return page.values;
  }

  async getWorkItemStateFlows(statePlanId: string, fromStateId: string): Promise<WorkItemStateFlow[]> {
    const page = await this.request<PageResponse<WorkItemStateFlow>>(
      "GET",
      `/v1/project/work_item_state_plans/${encodeURIComponent(statePlanId)}/work_item_state_flows`,
      { query: { from_state_id: fromStateId } },
    );
    return page.values;
  }

  async listWorkItems(query: WorkItemListQuery): Promise<PageResponse<WorkItem>> {
    return this.request("GET", "/v1/project/work_items", {
      query: {
        ...query,
        page_index: query.page_index ?? 0,
        page_size: query.page_size ?? 30,
      },
    });
  }

  async getWorkItem(workItemId: string): Promise<WorkItem> {
    return this.request("GET", `/v1/project/work_items/${encodeURIComponent(workItemId)}`, {
      query: { include_public_image_token: true },
    });
  }

  async createWorkItem(payload: WorkItemPayload): Promise<WorkItem> {
    return this.request("POST", "/v1/project/work_items", { body: payload });
  }

  async updateWorkItem(workItemId: string, payload: WorkItemPayload): Promise<WorkItem> {
    return this.request("PATCH", `/v1/project/work_items/${encodeURIComponent(workItemId)}`, { body: payload });
  }

  async bulkUpdateWorkItems(ids: string[], propertyName: string, propertyValue: string): Promise<void> {
    const body: BulkUpdatePayload = { ids, property_name: propertyName, property_value: propertyValue };
    await this.request("PATCH", "/v1/project/work_items", { body });
  }

  async getRelationTypes(): Promise<RelationType[]> {
    const page = await this.request<PageResponse<RelationType>>("GET", "/v1/project/work_item/relation_types");
    return page.values;
  }

  async listWorkItemRelations(workItemId: string, relationType?: string): Promise<PageResponse<WorkItemRelation>> {
    return this.request("GET", `/v1/project/work_items/${encodeURIComponent(workItemId)}/relations`, {
      query: { relation_type: relationType },
    });
  }

  async createWorkItemRelation(
    workItemId: string,
    body: { target_work_item_id: string; relation_type: string },
  ): Promise<WorkItemRelation> {
    return this.request("POST", `/v1/project/work_items/${encodeURIComponent(workItemId)}/relations`, { body });
  }

  async deleteWorkItemRelation(workItemId: string, relationId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/v1/project/work_items/${encodeURIComponent(workItemId)}/relations/${encodeURIComponent(relationId)}`,
    );
  }

  async listWorkItemComments(workItemId: string): Promise<PageResponse<PingCodeComment>> {
    return this.request("GET", "/v1/comments", {
      query: {
        principal_type: "work_item",
        principal_id: workItemId,
      },
    });
  }

  async createWorkItemComment(workItemId: string, content: string): Promise<PingCodeComment> {
    return this.request("POST", "/v1/comments", {
      query: {
        principal_type: "work_item",
        principal_id: workItemId,
      },
      body: { content },
    });
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.config.apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    // 最多两轮：首轮命中 401 且能重新鉴权时刷新令牌并重试一次，避免令牌过期导致整次失败。
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: await this.getAuthorization(),
            Accept: "application/json",
            ...(options.body == null ? {} : { "Content-Type": "application/json" }),
          },
          body: options.body == null ? undefined : JSON.stringify(options.body),
        });

        if (!response.ok && response.status === 401 && attempt === 0 && (await this.reauthorizeAfter401())) {
          continue;
        }

        const text = await response.text();
        if (!response.ok) {
          throw new PingCodeApiError(`PingCode API 请求失败：${response.status} ${response.statusText}`, response.status, text);
        }
        if (!text) return undefined as T;
        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`PingCode API 请求超时：${method} ${path}`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    // for 循环理论上不会走到这里（最多一次 continue 后必定返回或抛错）。
    throw new Error(`PingCode API 请求未完成：${method} ${path}`);
  }

  /**
   * 401 后尝试重新鉴权，供 request 重试一次：
   * - 有用户态 refresh_token：强制刷新并持久化，成功返回 true。
   * - 否则有 client_credentials：清掉进程内缓存，下次 getAuthorization 会重新换取，返回 true。
   * - 都不行：返回 false（由调用方按原逻辑抛 401）。
   */
  private async reauthorizeAfter401(): Promise<boolean> {
    const refreshToken = this.authStore?.get()?.refreshToken;
    if (refreshToken) {
      try {
        const refreshed = await this.refreshUserToken(refreshToken);
        this.authStore?.update({
          accessToken: refreshed.access_token,
          tokenType: refreshed.token_type ?? "Bearer",
          expiresAt: normalizeExpiresAt(refreshed.expires_in),
        });
        return true;
      } catch {
        return false;
      }
    }

    if (this.config.clientId && this.config.clientSecret) {
      this.cachedAuthorization = undefined;
      this.cachedAuthorizationExpiresAt = 0;
      return true;
    }

    return false;
  }

  private async getAuthorization(): Promise<string> {
    // 1. 用户态 token（authStore）：未过期直接用；过期且有 refresh_token 则刷新；无过期时间则尽力用之。
    const userAuthorization = await this.tryUserAuthorization();
    if (userAuthorization) {
      return userAuthorization;
    }

    // 2. 环境变量 access_token。
    if (this.config.accessToken) {
      return this.buildAuthorization(this.config.authScheme, this.config.accessToken, "PINGCODE_ACCESS_TOKEN");
    }

    // 3. client_credentials（带进程内缓存）。
    if (this.cachedAuthorization && Date.now() < this.cachedAuthorizationExpiresAt) {
      return this.cachedAuthorization;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        "缺少 PingCode 鉴权配置：请设置 PINGCODE_ACCESS_TOKEN，或设置 PINGCODE_CLIENT_ID 和 PINGCODE_CLIENT_SECRET。",
      );
    }

    const token = await this.requestClientCredentialsToken();
    const authorization = this.buildAuthorization(token.token_type ?? this.config.authScheme, token.access_token, "PingCode access_token");
    const ttlSeconds = Math.max((token.expires_in ?? 7200) - 60, 60);
    this.cachedAuthorization = authorization;
    this.cachedAuthorizationExpiresAt = Date.now() + ttlSeconds * 1000;
    return authorization;
  }

  /**
   * 尝试用 authStore 里的用户态 token 构造 Authorization。
   * - 有效（距过期 >60s）：直接用。
   * - 已过期且有 refresh_token：刷新并持久化新 token；刷新失败返回 undefined 由调用方落到下一级。
   * - 无过期时间：best-effort 直接用。
   * - 无 authStore / 无 token：返回 undefined。
   */
  private async tryUserAuthorization(): Promise<string | undefined> {
    const stored = this.authStore?.get();
    if (!stored?.accessToken) {
      return undefined;
    }

    const scheme = stored.tokenType || "Bearer";

    if (stored.expiresAt === undefined) {
      return this.buildAuthorization(scheme, stored.accessToken, "PingCode 用户令牌");
    }

    if (Date.now() < stored.expiresAt - 60000) {
      return this.buildAuthorization(scheme, stored.accessToken, "PingCode 用户令牌");
    }

    if (stored.refreshToken) {
      try {
        const refreshed = await this.refreshUserToken(stored.refreshToken);
        const updated = this.authStore?.update({
          accessToken: refreshed.access_token,
          tokenType: refreshed.token_type ?? stored.tokenType,
          expiresAt: normalizeExpiresAt(refreshed.expires_in),
        });
        const nextScheme = updated?.tokenType || scheme;
        const nextToken = updated?.accessToken ?? refreshed.access_token;
        return this.buildAuthorization(nextScheme, nextToken, "PingCode 用户令牌");
      } catch {
        // 刷新失败：落到下一级鉴权，不抛错。
        return undefined;
      }
    }

    return undefined;
  }

  private async requestClientCredentialsToken(): Promise<TokenExchangeResult> {
    return this.tokenRequest({
      grant_type: "client_credentials",
      client_id: this.config.clientId ?? "",
      client_secret: this.config.clientSecret ?? "",
    });
  }

  /** 用授权码换用户态 token（authorization_code）。需要 client_id/secret。 */
  async exchangeAuthorizationCode(code: string): Promise<TokenExchangeResult> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("缺少 PINGCODE_CLIENT_ID / PINGCODE_CLIENT_SECRET，无法用授权码换取用户令牌。");
    }
    return this.tokenRequest({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
    });
  }

  /** 用 refresh_token 刷新用户态 access_token（refresh_token 响应可能不返回新 refresh_token）。 */
  async refreshUserToken(refreshToken: string): Promise<TokenExchangeResult> {
    return this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  /** /v1/auth/token 统一 GET + query 请求；不打印任何 token。 */
  private async tokenRequest(query: Record<string, string>): Promise<TokenExchangeResult> {
    const url = new URL(`${this.config.apiBaseUrl}/v1/auth/token`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      const text = await response.text();
      if (!response.ok) {
        throw new PingCodeApiError(`PingCode Token 请求失败：${response.status} ${response.statusText}`, response.status, text);
      }

      const token = text ? (JSON.parse(text) as TokenResponse) : {};
      if (!token.access_token) {
        throw new Error("PingCode Token 响应缺少 access_token。");
      }
      return token as TokenExchangeResult;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("PingCode Token 请求超时。");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAuthorization(scheme: string, token: string | undefined, label: string): string {
    if (!token) {
      throw new Error(`缺少 ${label}。`);
    }

    const authorization = `${scheme} ${token}`;
    if (/[^ -~]/.test(authorization)) {
      throw new Error(
        `${label} 或 PINGCODE_AUTH_SCHEME 包含中文/全角/不可见字符，请只填写 PingCode Open API 返回的原始值。`,
      );
    }
    return authorization;
  }
}
