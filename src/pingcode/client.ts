import type { PingCodeConfig } from "../config.js";
import type {
  PageResponse,
  PingCodeComment,
  PingCodeProject,
  ProjectMember,
  WorkItem,
  WorkItemListQuery,
  WorkItemPayload,
  WorkItemPriority,
  WorkItemState,
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
}

type QueryValue = string | number | boolean | undefined;

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export class PingCodeClient {
  private cachedAuthorization?: string;
  private cachedAuthorizationExpiresAt = 0;

  constructor(private readonly config: PingCodeConfig) {}

  async listProjects(identifier?: string): Promise<PageResponse<PingCodeProject>> {
    return this.request("GET", "/v1/project/projects", {
      query: {
        identifier,
        include_archived: false,
        include_deleted: false,
      },
    });
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

  private async getAuthorization(): Promise<string> {
    if (this.config.accessToken) {
      return this.buildAuthorization(this.config.authScheme, this.config.accessToken, "PINGCODE_ACCESS_TOKEN");
    }

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

  private async requestClientCredentialsToken(): Promise<Required<Pick<TokenResponse, "access_token">> & TokenResponse> {
    const url = new URL(`${this.config.apiBaseUrl}/v1/auth/token`);
    url.searchParams.set("grant_type", "client_credentials");
    url.searchParams.set("client_id", this.config.clientId ?? "");
    url.searchParams.set("client_secret", this.config.clientSecret ?? "");

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
      return token as Required<Pick<TokenResponse, "access_token">> & TokenResponse;
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
