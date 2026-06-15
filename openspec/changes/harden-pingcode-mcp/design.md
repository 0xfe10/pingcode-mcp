# Design: 硬化

## A. 测试套件（node:test，零新依赖）

- `package.json` scripts 加 `"test": "tsx --test test/*.test.ts"`（若该形式不被识别，回退 `node --import tsx --test test/*.test.ts`，实现者须实测 `npm test` 真跑通）。
- 测试直接 import `src/**`（tsx 转译），用 `globalThis.fetch` stub 记录 `{method,url,headers.Authorization,body}`，返回伪造 JSON。临时文件用 `os.tmpdir()` + 唯一名（Date.now/crypto 允许，这是应用/测试代码非 workflow 脚本）。
- 文件与最少用例：
  - `test/authStore.test.ts`：save 后文件 `mode & 0o777 === 0o600`；get 往返；update 不传 refreshToken 时保留原值；clear 删文件。
  - `test/auth.test.ts`：getAuthorization 优先级（有用户 token→Bearer 用户态；过期+refresh→新 token 且原 refresh 保留；无用户 token→client_credentials）；**401 强制刷新重试**（首请求 401→发 refresh→重试带新 token）；AuthService.loginWithCode 存盘且返回不含 token；status() 不含 token。
  - `test/workItemService.test.ts`：updateWorkItemFields/triage/create/bulk 在 dryRun 不发写请求；readonly=true 拒写；searchWorkItems 合并 stateNames+stateIds 去重、≤20、按 id 去重、`truncated` 标记；getMyWork 按状态分组+`truncated`；planStatusChange 只读；resolveCurrentAssigneeName 用 /v1/myself。
  - `test/setupGuide.test.ts`：nextStep 三分支码；mcpClientConfig 凭据占位、注入真实 secret 不出现在输出。

## B. refresh-on-401（client.ts request）

在 `request<T>()` 内，拿到 response 后：
```ts
if (!response.ok && response.status === 401 && !retried) {
  const retryAuth = await this.reauthorizeAfter401();   // 用户态→强制刷新；否则清 CC 缓存
  if (retryAuth) { retried = true; 重新发一次（带新 Authorization 头）; }
}
```
- 实现：把组装 fetch 的部分抽成可重入；或简单包一层 `for (let attempt=0; attempt<2; attempt++)`，第 1 次 401 且能 reauth 则 continue。
- `reauthorizeAfter401()`：若 `authStore?.get()?.refreshToken` → try `refreshUserToken` → `authStore.update` → 返回 true；否则若有 client_credentials → 清 `cachedAuthorization` → 返回 true；都不行 → false。
- Authorization 头每次循环都重新 `await this.getAuthorization()` 取（刷新后自然拿到新值）。
- 防循环：最多重试 1 次。token 端点自身（/v1/auth/token）的请求不走此重试。

## C. 截断提示

- `WorkItemListQuery`/list 不变。`searchWorkItems`：每 kind push `hasMore = page.total > (page.page_index + 1) * page.page_size`；顶层 `truncated = byKind.some(k => k.hasMore)`，并在返回加 `note`（截断时提示"结果超过一页，请用 pageIndex/pageSize 翻页或收紧过滤"）。
- `getMyWork`：同理对每 kind 算 hasMore，返回 `truncated` + note。
- 均为新增返回字段，旧字段不动。

## D. 错误脱敏（client.ts）

`PingCodeApiError` 增：
```ts
private static mask(text: string): string {
  return text.replace(/("?(access_token|refresh_token|client_secret|code)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, "$1***")
             .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");
}
toJSON() { return { name: this.name, message: this.message, status: this.status }; }  // 不含 responseText
```
- `responseText` 保留为字段（内部诊断用）但 `toJSON` 不输出；如需诊断可经 `mask`。现有 `errorResult` 仍只回 message，双保险。

## E. 发布

- `package.json` version `0.1.0 → 0.2.0`。
- 新增 `CHANGELOG.md`：按版本列本轮所有 OpenSpec change（详情/搜索/创建/批量/流转/目录/raw 过滤/关系/个人台/OAuth/check_setup 增强/硬化）。

## 文件改动清单
| 文件 | 改动 |
| --- | --- |
| `src/pingcode/client.ts` | request 加 401 重试 + reauthorizeAfter401；PingCodeApiError 加 mask/toJSON |
| `src/pingcode/workItemService.ts` | searchWorkItems/getMyWork 加 truncated/hasMore |
| `package.json` | 加 test 脚本；version 0.2.0 |
| `test/*.test.ts` | 新增 4 个测试文件 |
| `CHANGELOG.md` | 新增 |
