# Tasks: 硬化

## M1 健壮性（refresh-on-401 + 截断 + 脱敏）

- [x] `client.ts`：`request()` 加单次 401 重试 + `reauthorizeAfter401`（用户态强制刷新/CC 清缓存）。
- [x] `client.ts`：`PingCodeApiError` 加 `toJSON()`（不含 responseText）+ `mask` 静态方法。
- [x] `workItemService.ts`：`searchWorkItems` 加 `hasMore`(每 kind)/`truncated`/note。
- [x] `workItemService.ts`：`getMyWork` 加 `truncated`/note。
- [x] `npm run check` 通过。

## M2 测试套件

- [x] `package.json`：加 `"test"` 脚本（tsx + node:test），实测 `npm test` 能跑。
- [x] `test/authStore.test.ts`：0600 / 往返 / update 保留 refreshToken / clear。
- [x] `test/auth.test.ts`：鉴权优先级 / 过期刷新 / 401 刷新重试 / login 不回 token / status 不回 token。
- [x] `test/workItemService.test.ts`：dryRun 不写 / readonly 拒写 / search 合并去重+截断 / getMyWork 分组 / planStatusChange 只读 / resolveCurrentAssigneeName。
- [x] `test/setupGuide.test.ts`：nextStep 分支 / mcpClientConfig 凭据脱敏。
- [x] `npm test` 全绿。

## M3 发布卫生

- [x] `package.json`：version 0.1.0 → 0.2.0。
- [x] 新增 `CHANGELOG.md`，记录本轮各 OpenSpec change。
- [x] `npm run check` / `npm run build` / `npm test` 全通过。

## M4 复盘

- [x] 输出变更清单、测试结果、残余风险（含必须人工的真实 API 冒烟）。
