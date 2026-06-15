# Design: 用户态 OAuth 授权

## API（open.pingcode.com/api_data.json 核实）

| 步骤 | 调用 |
| --- | --- |
| 授权 | `GET {authorizeUrl}?response_type=code&client_id={id}&redirect_uri={uri}&state={state}` → 浏览器登录授权 → 回调 `redirect_uri?code=...` |
| 换 token | `GET /v1/auth/token?grant_type=authorization_code&client_id&client_secret&code` → `{access_token, refresh_token, token_type, expires_in}` |
| 刷新 | `GET /v1/auth/token?grant_type=refresh_token&refresh_token` → `{access_token, token_type, expires_in}`（无新 refresh_token） |
| 当前用户 | `GET /v1/myself`（仅用户令牌）→ `{id,name,display_name,email,...}` |

> redirect_uri/state 在 apiDoc 未文档化为 authorize 参数（redirect_uri 后台预配置）。实现里仍按标准 OAuth 附带 redirect_uri（若配置）与 state，最大化兼容；手动粘贴 code 流程下 state 仅作 URL 内防护，不强制回验。

## 配置（config.ts 新增）
```ts
oauthAuthorizeUrl?: string;   // PINGCODE_OAUTH_AUTHORIZE_URL，默认 `${baseUrl}/oauth2/authorize`
oauthRedirectUri?: string;    // PINGCODE_OAUTH_REDIRECT_URI（须与后台凭据管理一致）
authTokenPath: string;        // PINGCODE_AUTH_TOKEN_PATH，默认 `${XDG_CONFIG_HOME|~/.config}/pingcode-mcp/auth.json`
```

## Token 存储（新增 src/pingcode/authStore.ts）
```ts
export interface StoredTokens { accessToken: string; refreshToken?: string; tokenType: string; expiresAt?: number; savedAt: number; }
export class AuthStore {
  constructor(path: string)
  get(): StoredTokens | undefined          // 带内存缓存，首次从文件读
  hasToken(): boolean
  save(tokens: StoredTokens): StoredTokens  // mkdir -p + writeFile mode 0o600
  update(partial): StoredTokens             // 合并刷新结果，保留原 refreshToken
  clear(): void                             // 删除文件 + 清缓存
}
```
- 写文件用 `fs.writeFileSync(path, json, { mode: 0o600 })`；目录 `fs.mkdirSync(dir, { recursive: true })`，best-effort chmod 0o600。
- 读失败/不存在 → undefined（不抛）。

## Client（client.ts）
新增（复用现有 request 风格，token 端点用 GET + query，同 client_credentials）：
```ts
constructor(config, authStore?: AuthStore)
async exchangeAuthorizationCode(code: string): Promise<TokenResponse>  // grant_type=authorization_code
async refreshUserToken(refreshToken: string): Promise<TokenResponse>   // grant_type=refresh_token
```
`getAuthorization()` 改优先级（保留现有逻辑作为后两级）：
```
1. authStore 用户态 token：
   - 有 accessToken 且 expiresAt 未过期(留 60s) → 用之
   - 过期且有 refreshToken → refreshUserToken → authStore.update → 用新 token；refresh 失败则 fall through
   - 有 accessToken 但无 expiresAt → best-effort 用之
2. config.accessToken（现有 env 分支）
3. client_credentials（现有缓存分支）
```
expires_in 归一：`expiresAt = expires_in > 1e9 ? expires_in*1000 : Date.now()+expires_in*1000`。
**绝不**把 token 写日志；buildAuthorization 现有校验保留。

## AuthService（新增 src/pingcode/authService.ts）
持有 `config` + `authStore` + `new PingCodeClient(config, authStore)`。
```ts
buildAuthorizeUrl(): { url: string; state: string }
  // 缺 client_id → throw 明确中文错误（提示配置 client_id/secret/redirect_uri）
async loginWithCode(code: string): Promise<{ ok: true; user: PingCodeUser }>
  // exchangeAuthorizationCode → 归一 expiresAt → authStore.save → getCurrentUser(/v1/myself) → 返回 {ok,user}（无 token）
async status(): Promise<{ mode: "user"|"env-token"|"application"; hasUserToken: boolean; expiresInSeconds?: number; user?: PingCodeUser; note?: string }>
  // 有有效/可刷新用户 token → mode=user + /v1/myself（try）；否则 env-token / application
logout(): { ok: true; cleared: boolean }   // authStore.clear()
```
所有返回**不含 token 值**；过期时间只给相对秒数。

## WorkItemService 升级
- 构造接受 `authStore?` 透传给内部 client。
- `getCurrentUser()`：当 `authStore.hasToken() || config.accessToken` → try `/v1/myself` 返回 `{mode:"user",user}`；失败/无 → 现有应用身份降级。
- 新增 `resolveCurrentAssigneeName(override?)`：`override?.trim()` →（有用户 token：`/v1/myself` 的 display_name/name，带本次实例缓存）→ `config.defaultAssigneeName` → 否则 throw（提示：可 `pingcode_auth_login` 授权，或设 `PINGCODE_DEFAULT_ASSIGNEE_NAME`）。

## index.ts
- 共享单例：`const authStore = new AuthStore(config.authTokenPath)`；`new WorkItemService(config, authStore)`；`const authService = new AuthService(config, authStore)`。
- 注册 `pingcode_auth_login`(schema {code?})、`pingcode_auth_status`({})、`pingcode_auth_logout`({})。
- `list_my_bugs`/`list_my_requirements` handler 改用 `await service.resolveCurrentAssigneeName(args.assigneeName)`（替换 `resolveDefaultAssigneeName`，保留后者或合并）。
- `pingcode_get_current_user` 已走 service.getCurrentUser（自动用上 user token）。

## schemas.ts
`authLoginSchema = { code: z.string().optional().describe("浏览器授权回调 URL 中的 code；不传则返回授权 URL 与引导。") }`；`authStatusSchema = {}`；`authLogoutSchema = {}`。

## setupGuide.ts
增补：若已配置 client_id/secret(+redirect_uri/authorizeUrl)，引导用 `pingcode_auth_login` 浏览器授权（免手填负责人）；明确"不读取浏览器 cookie/storage，不要把网页 token 贴进聊天"。

## 安全
- token 只存 0600 文件；内存缓存仅本进程。
- auth 工具与 status 不回传 token；错误走 errorResult 仅回 message。
- getAuthorization/refresh 不打印 token。
- 现有 client_credentials/READONLY/dryRun 策略不动。

## 文件改动清单
| 文件 | 改动 |
| --- | --- |
| `src/config.ts` | 加 oauthAuthorizeUrl/oauthRedirectUri/authTokenPath |
| `src/pingcode/authStore.ts` | 新增 0600 token 存储 |
| `src/pingcode/authService.ts` | 新增 登录/状态/登出/buildAuthorizeUrl 编排 |
| `src/pingcode/client.ts` | 加 exchangeAuthorizationCode/refreshUserToken；getAuthorization 优先级；构造接 authStore |
| `src/pingcode/workItemService.ts` | 构造接 authStore；升级 getCurrentUser；加 resolveCurrentAssigneeName |
| `src/tools/schemas.ts` | 加 authLogin/authStatus/authLogout schema |
| `src/tools/setupGuide.ts` | 增补 OAuth 引导 |
| `src/index.ts` | 共享 authStore；注册 3 工具；my_* 改用 resolveCurrentAssigneeName |
| `README.md` | 鉴权方式/授权流程/安全说明 |
