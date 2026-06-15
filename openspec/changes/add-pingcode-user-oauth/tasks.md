# Tasks: 用户态 OAuth 授权

## M1 配置与 token 存储

- [x] `config.ts`：新增 `oauthAuthorizeUrl` / `oauthRedirectUri` / `authTokenPath`（含默认值）。
- [x] `src/pingcode/authStore.ts`：新增 `AuthStore`（get/hasToken/save/update/clear，0600 文件 + 内存缓存）。
- [x] `npm run check` 通过。

## M2 Client 鉴权优先级 + token 交换

- [x] `client.ts`：构造接 `authStore?`；新增 `exchangeAuthorizationCode` / `refreshUserToken`。
- [x] `client.ts`：`getAuthorization()` 改优先级 用户态(自动 refresh) → env access token → client_credentials；expires_in 归一。
- [x] `npm run check` 通过。

## M3 AuthService + 工具 + my_* 升级

- [x] `src/pingcode/authService.ts`：新增 `buildAuthorizeUrl` / `loginWithCode` / `status` / `logout`（返回不含 token）。
- [x] `workItemService.ts`：构造接 `authStore?`；升级 `getCurrentUser`；新增 `resolveCurrentAssigneeName`。
- [x] `schemas.ts`：新增 `authLoginSchema` / `authStatusSchema` / `authLogoutSchema`。
- [x] `index.ts`：共享 `authStore`；注册 `pingcode_auth_login` / `pingcode_auth_status` / `pingcode_auth_logout`；`list_my_bugs` / `list_my_requirements` 改用 `resolveCurrentAssigneeName`。
- [x] `npm run check` 通过。

## M4 setupGuide + README

- [x] `setupGuide.ts`：增补 OAuth 登录引导 + 不读浏览器 cookie 声明。
- [x] README：鉴权方式（三级优先级）、授权流程（手动粘贴 code）、安全说明、Tools 表 +3。

## M5 验证

- [x] `npm run check` / `npm run build` 通过；工具总数 30。
- [x] 未授权：client_credentials 仍可用（现有 27 工具兼容）。
- [x] 授权（stub /v1/auth/token + /v1/myself）：login 存 token、getAuthorization 用用户态、get_current_user 返回真实用户。
- [x] my_* 在有用户 token 时无需 `PINGCODE_DEFAULT_ASSIGNEE_NAME`。
- [x] token 过期自动 refresh（stub 验证）。
- [x] auth_status / login / logout / 错误返回均不含 token；token 文件 mode 0600。

## M6 复盘

- [x] 输出变更清单、验证结果、残余风险。
