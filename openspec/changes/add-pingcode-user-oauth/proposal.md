# Proposal: 用户态 OAuth 授权 + 免手填默认负责人

## Why

当前只支持 client_credentials（应用身份）与手填 `PINGCODE_ACCESS_TOKEN`。应用身份不代表登录用户，`pingcode_get_current_user` 只能降级返回 `PINGCODE_DEFAULT_ASSIGNEE_NAME`，同事首次使用仍要手配展示名，不够"直接可用"。

经官方权威源 `open.pingcode.com/api_data.json` 核实：**PingCode 支持标准 OAuth 授权码 + refresh_token**（复用 `/v1/auth/token`），`/v1/myself` 在用户令牌下返回真实当前用户。**不支持 PKCE / device code**（机密客户端，需持有 client_secret）。loopback 自动回调未文档化，故采用"浏览器授权后手动粘贴 code"的稳妥方式，不读取任何浏览器 cookie/storage、不要求复制网页登录态 token。

## What Changes

新增用户态授权能力（保留 client_credentials 不变）：

- **`pingcode_auth_login`**：无 `code` 时返回授权 URL + 引导（去浏览器登录授权，复制回调 URL 里的 `code`）；带 `code` 时用 `授权码 + client_secret` 换 access/refresh token，落盘到 0600 文件，返回真实当前用户（不含 token）。
- **`pingcode_auth_status`**：返回当前鉴权模式（user / env-token / application）、用户令牌是否有效、相对过期时间、当前用户展示名——**不含任何 token 值**。
- **`pingcode_auth_logout`**：清除本机用户令牌。
- **鉴权优先级**：`getAuthorization()` 改为 用户态 token（自动 refresh）→ `PINGCODE_ACCESS_TOKEN` → client_credentials。
- **`pingcode_get_current_user`**：用户态下走真实 `/v1/myself`；否则维持应用身份降级。
- **`pingcode_list_my_bugs` / `pingcode_list_my_requirements`**：用户态下以真实当前用户为负责人，**不再强依赖** `PINGCODE_DEFAULT_ASSIGNEE_NAME`（仍支持 `assigneeName` 覆盖与 env 兜底）。
- `pingcode_check_setup` / setupGuide 增补 OAuth 登录引导。

配套：`config.ts` 增 OAuth 配置；新增 `src/pingcode/authStore.ts`（0600 token 持久化）、`src/pingcode/authService.ts`（登录/状态/登出编排）；`client.ts` 增授权码/刷新交换 + 改 `getAuthorization` 优先级；`workItemService.ts` 增 `resolveCurrentAssigneeName` 并升级 `getCurrentUser`；README 更新。

## Scope

包含：上述 3 工具 + 优先级链 + 自动 refresh + token 存储 + my_*/current_user 升级 + setupGuide/README + OpenSpec + check/build/运行时验证。

不包含：本地 loopback 回调自动回收 code（未确认，留作后续）；PKCE/device code（API 不支持）；浏览器 cookie/storage 读取（明确禁止）；OS 钥匙串（避免原生依赖，用 0600 文件）。

非目标：不破坏现有 27 工具；不提交凭据；不把 token/secret/cookie 写日志或返回。

## Success Criteria

- `npm run check`、`npm run build` 通过。
- 现有 27 工具向后兼容；未授权时 client_credentials 仍可用。
- 授权后 `pingcode_get_current_user` 返回真实 `/v1/myself` 用户。
- 授权后"我的缺陷/需求"无需 `PINGCODE_DEFAULT_ASSIGNEE_NAME`。
- 日志与返回值不泄露 token/secret/cookie；token 文件 0600。
- README 明确：不读浏览器 cookie，使用官方授权（手动粘贴 code）或配置向导。

## Risks and Mitigations

- **loopback 回调未确认**：→ 采用手动粘贴 code，不起本地服务、不依赖未确认能力；待实测确认后可升级自动回收。
- **机密客户端需 client_secret**：→ 与现有 client_credentials 一致，仅从 env 读、不外泄；纯本地自用可接受。
- **refresh 不返回新 refresh_token**：→ 刷新时保留原 refresh_token，仅更新 access_token 与过期时间。
- **expires_in 可能为绝对 epoch 或 TTL**：→ 归一化（>1e9 视为绝对秒级 epoch，否则 now+TTL），并留 60s 偏移；过期且无法 refresh 时回退下一鉴权级。
- **token 泄露面**：→ auth 工具只回用户信息与相对过期；错误走 errorResult 仅回 message；token 文件权限 0600。
