import type { PingCodeConfig } from "../config.js";

interface SetupField {
  env: string;
  label: string;
  status: "ok" | "missing" | "optional";
  requiredFor: string;
  safeForChat: boolean;
  current: string;
  example: string;
  whereToFind: string;
  chatPrompt: string;
}

function isPlaceholder(value: string | undefined, placeholders: string[]): boolean {
  if (!value) return true;
  return placeholders.some(placeholder => value.includes(placeholder));
}

function configured(value: string | undefined): string {
  return value ? "已配置" : "未配置";
}

function safeCurrent(value: string | undefined): string {
  return value ? value : "未配置";
}

export function buildSetupGuide(config: PingCodeConfig) {
  const usesAccessToken = Boolean(config.accessToken);
  const hasClientCredentials = Boolean(config.clientId && config.clientSecret);
  const needsClientId = !usesAccessToken && !config.clientId;
  const needsClientSecret = !usesAccessToken && !config.clientSecret;

  const fields: SetupField[] = [
    {
      env: "PINGCODE_BASE_URL",
      label: "PingCode 租户地址",
      status: isPlaceholder(config.baseUrl, ["your-domain"]) ? "missing" : "ok",
      requiredFor: "所有工具",
      safeForChat: true,
      current: safeCurrent(config.baseUrl),
      example: "https://smrr20260525005926898.pingcode.com",
      whereToFind: "打开 PingCode 后复制浏览器地址栏里的域名部分，保留到 .pingcode.com，例如 https://xxx.pingcode.com。",
      chatPrompt: "请提供你的 PingCode 租户地址，形如 https://xxx.pingcode.com。",
    },
    {
      env: "PINGCODE_API_BASE_URL",
      label: "PingCode Open API 地址",
      status: config.apiBaseUrl ? "ok" : "missing",
      requiredFor: "所有 API 调用",
      safeForChat: true,
      current: safeCurrent(config.apiBaseUrl),
      example: "https://open.pingcode.com",
      whereToFind: "PingCode SaaS 固定使用 https://open.pingcode.com；私有化部署再问管理员 Open API 地址。",
      chatPrompt: "如果你是 PingCode SaaS 用户，这里填 https://open.pingcode.com。",
    },
    {
      env: "PINGCODE_CLIENT_ID",
      label: "Client ID",
      status: needsClientId ? "missing" : "ok",
      requiredFor: "Open API 鉴权",
      safeForChat: false,
      current: configured(config.clientId),
      example: "在 MCP env 中填写，不要发公共聊天",
      whereToFind: "PingCode 右上角头像 -> 管理后台 -> 凭据管理/凭证管理 -> 应用 -> 新建或打开 pingcode-mcp 应用 -> Client ID。",
      chatPrompt: "请在本地 MCP 配置或 .env 中填写 PINGCODE_CLIENT_ID；不建议发到公共聊天。",
    },
    {
      env: "PINGCODE_CLIENT_SECRET",
      label: "Client Secret",
      status: needsClientSecret ? "missing" : "ok",
      requiredFor: "Open API 鉴权",
      safeForChat: false,
      current: configured(config.clientSecret),
      example: "在 MCP env 中填写，不要发公共聊天",
      whereToFind: "PingCode 右上角头像 -> 管理后台 -> 凭据管理/凭证管理 -> 应用 -> 新建或打开 pingcode-mcp 应用 -> Client Secret。Secret 可能只显示一次。",
      chatPrompt: "请在本地 MCP 配置或 .env 中填写 PINGCODE_CLIENT_SECRET；不要把 Secret 发到公共聊天或提交到 Git。",
    },
    {
      env: "PINGCODE_PROJECT_IDENTIFIER",
      label: "项目标识",
      status: isPlaceholder(config.projectIdentifier, ["PROJECT_KEY"]) ? "missing" : "ok",
      requiredFor: "项目缺陷/需求查询",
      safeForChat: true,
      current: safeCurrent(config.projectIdentifier),
      example: "MYM",
      whereToFind: "进入项目后看地址栏：/pjm/projects/MYM/... 中的 MYM 就是项目标识。",
      chatPrompt: "请提供项目标识，例如项目地址 /pjm/projects/MYM/... 里的 MYM。",
    },
    {
      env: "PINGCODE_DEFAULT_ASSIGNEE_NAME",
      label: "默认负责人展示名",
      status: config.defaultAssigneeName ? "ok" : "missing",
      requiredFor: "我的缺陷 / 我的需求",
      safeForChat: true,
      current: safeCurrent(config.defaultAssigneeName),
      example: "张夏",
      whereToFind: "看 PingCode 右上角头像/个人信息里的展示名，或缺陷/需求列表负责人列里显示的名字。",
      chatPrompt: "请提供你的 PingCode 展示名，也就是负责人列里显示的名字。",
    },
    {
      env: "PINGCODE_BUG_TYPE_ID",
      label: "缺陷类型 ID",
      status: config.bugTypeId ? "ok" : "optional",
      requiredFor: "缺陷查询",
      safeForChat: true,
      current: safeCurrent(config.bugTypeId),
      example: "bug",
      whereToFind: "通常默认是 bug；如不确定，先运行 pingcode_get_project_schema 查看工作项类型。",
      chatPrompt: "一般不用填，默认 bug；如果你们项目改过工作项类型，再提供缺陷类型 ID。",
    },
    {
      env: "PINGCODE_REQUIREMENT_TYPE_ID",
      label: "需求类型 ID",
      status: config.requirementTypeId ? "ok" : "optional",
      requiredFor: "需求查询",
      safeForChat: true,
      current: safeCurrent(config.requirementTypeId),
      example: "需求类型 ID，或留空按名称自动识别",
      whereToFind: "运行 pingcode_get_project_schema 查看工作项类型，找到需求/用户故事对应的 id。",
      chatPrompt: "如果需求查询识别不到类型，请提供 schema 里的需求类型 ID；否则可留空。",
    },
  ];

  const missingFields = fields.filter(field => field.status === "missing");
  const safeQuestions = missingFields.filter(field => field.safeForChat).map(field => field.chatPrompt);
  const secretQuestions = missingFields.filter(field => !field.safeForChat).map(field => field.chatPrompt);

  return {
    ok: missingFields.length === 0,
    needsInput: missingFields.length > 0,
    authMode: usesAccessToken ? "access_token" : hasClientCredentials ? "client_credentials" : "missing",
    missingFields,
    fields,
    chatBoxGuide: {
      safeQuestions,
      secretSetupSteps: secretQuestions,
      suggestedOpening:
        "我需要先完成 PingCode MCP 配置。下面这些非敏感信息可以直接在聊天框回复；Secret 请只填到本地 MCP env，不要发到公共聊天。",
    },
    copyableEnvTemplate: [
      "PINGCODE_BASE_URL=https://your-domain.pingcode.com",
      "PINGCODE_API_BASE_URL=https://open.pingcode.com",
      "PINGCODE_CLIENT_ID=",
      "PINGCODE_CLIENT_SECRET=",
      "PINGCODE_PROJECT_IDENTIFIER=PROJECT_KEY",
      "PINGCODE_DEFAULT_ASSIGNEE_NAME=",
      "PINGCODE_BUG_TYPE_ID=bug",
      "PINGCODE_REQUIREMENT_TYPE_ID=",
      "PINGCODE_READONLY=false",
    ].join("\n"),
  };
}
