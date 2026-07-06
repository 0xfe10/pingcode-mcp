import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthStore } from "../src/pingcode/authStore.js";
import { WorkItemService } from "../src/pingcode/workItemService.js";

import { installFetchStub, makeConfig, type RecordedRequest, type StubResponse } from "./helpers.js";

function page<T>(values: T[], total?: number, pageIndex = 0, pageSize = 30) {
  return { page_size: pageSize, page_index: pageIndex, total: total ?? values.length, values };
}

/** 默认 schema：项目 PROJ / bug 类型 / 两个状态 / 两个优先级 / 一个成员。 */
function schemaResponder(req: RecordedRequest): StubResponse | undefined {
  const { url } = req;
  if (url.includes("/v1/project/projects/") && url.includes("/members")) {
    return {
      json: page([{ id: "m1", user: { id: "user-zhang", display_name: "张三", name: "zhangxia" } }]),
    };
  }
  if (url.includes("/v1/project/projects")) {
    return { json: page([{ id: "proj-1", identifier: "PROJ", name: "项目" }]) };
  }
  if (url.includes("/v1/project/work_item/types")) {
    return {
      json: page([
        { id: "bug", name: "缺陷" },
        { id: "req", name: "需求" },
      ]),
    };
  }
  if (url.includes("/v1/project/work_item/priorities")) {
    return {
      json: page([
        { id: "p-high", name: "高" },
        { id: "p-low", name: "低" },
      ]),
    };
  }
  if (url.includes("/v1/project/work_item/states")) {
    return {
      json: page([
        { id: "s_new", name: "新提交" },
        { id: "s_done", name: "已完成" },
      ]),
    };
  }
  return undefined;
}

function makeService(overrides = {}) {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec", ...overrides });
  const store = new AuthStore(config.authTokenPath);
  const service = new WorkItemService(config, store);
  return { service, store, config };
}

function tokenResponder(req: RecordedRequest): StubResponse | undefined {
  if (req.url.includes("/v1/auth/token")) {
    return { json: { access_token: "cc", token_type: "Bearer", expires_in: 7200 } };
  }
  return undefined;
}

function hasWriteRequest(requests: RecordedRequest[]): boolean {
  return requests.some(r => ["POST", "PATCH", "DELETE", "PUT"].includes(r.method));
}

test("missing projectIdentifier fails before querying placeholder project", async () => {
  const { service, store } = makeService({ projectIdentifier: undefined });
  const stub = installFetchStub(req => tokenResponder(req));
  try {
    await assert.rejects(
      () => service.createWorkItem({ kind: "bug", title: "新缺陷" }),
      /请传入 projectIdentifier\/projectId/,
    );
    assert.equal(stub.requests.some(req => req.url.includes("/v1/project/projects")), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("updateWorkItemFields 默认 dryRun → 无写请求", async () => {
  const { service, store } = makeService();
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items/")) {
      return { json: { id: "wi-1", identifier: "PROJ-1", title: "旧标题", state: { id: "s_new", name: "新提交" } } };
    }
    return undefined;
  });
  try {
    const result = await service.updateWorkItemFields({ kind: "bug", workItemId: "wi-1", title: "新标题" });
    assert.equal(result.dryRun, true);
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("triageWorkItem 默认 dryRun → 无写请求", async () => {
  const { service, store } = makeService();
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items/")) {
      return { json: { id: "wi-1", identifier: "PROJ-1", title: "t", state: { id: "s_new", name: "新提交" } } };
    }
    return undefined;
  });
  try {
    const result = await service.triageWorkItem({ kind: "bug", workItemId: "wi-1", priorityName: "高" });
    assert.equal(result.dryRun, true);
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("createWorkItem 默认 dryRun → 无写请求", async () => {
  const { service, store } = makeService();
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    return schemaResponder(req);
  });
  try {
    const result = await service.createWorkItem({ kind: "bug", title: "新缺陷" });
    assert.equal(result.dryRun, true);
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("bulkUpdateWorkItems 默认 dryRun → 无写请求", async () => {
  const { service, store } = makeService();
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items")) {
      return { json: page([{ id: "wi-1", identifier: "PROJ-1", state: { id: "s_new", name: "新提交" } }]) };
    }
    return undefined;
  });
  try {
    const result = await service.bulkUpdateWorkItems({ kind: "bug", identifiers: ["PROJ-1"], priorityName: "高" });
    assert.equal(result.dryRun, true);
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("readonly=true + dryRun=false → 抛错含 READONLY 且无写请求", async () => {
  const { service, store } = makeService({ readonly: true });
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items/")) {
      return { json: { id: "wi-1", identifier: "PROJ-1", title: "旧", state: { id: "s_new", name: "新提交" } } };
    }
    return undefined;
  });
  try {
    await assert.rejects(
      () => service.updateWorkItemFields({ kind: "bug", workItemId: "wi-1", title: "新标题", dryRun: false }),
      /READONLY/,
    );
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("searchWorkItems 合并去重 state_ids / tag_ids ≤20，并返回 truncated=true", async () => {
  const { service, store } = makeService();
  let workItemsQuery: string | undefined;
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items")) {
      workItemsQuery = req.url;
      // total 大于一页 → 触发 truncated。
      return { json: page([{ id: "wi-1", identifier: "PROJ-1", state: { id: "s_new", name: "新提交" } }], 100, 0, 30) };
    }
    return undefined;
  });
  try {
    const result = await service.searchWorkItems({
      kinds: ["bug"],
      stateNames: ["新提交"],
      stateIds: ["s_new", "s_extra"],
      tagIds: Array.from({ length: 25 }, (_, i) => `tag-${i}`),
    });
    assert.equal(result.truncated, true);
    assert.ok(result.note);
    assert.equal(result.byKind[0]?.hasMore, true);

    const parsed = new URL(workItemsQuery ?? "");
    const stateIds = (parsed.searchParams.get("state_ids") ?? "").split(",").filter(Boolean);
    // 名称解析出的 s_new + raw s_new/s_extra 去重 → s_new, s_extra。
    assert.deepEqual([...new Set(stateIds)].sort(), ["s_extra", "s_new"]);
    const tagIds = (parsed.searchParams.get("tag_ids") ?? "").split(",").filter(Boolean);
    assert.equal(tagIds.length, 20);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("getMyWork 按状态分组、跨 kind 去重、返回 truncated 字段", async () => {
  const { service, store } = makeService({ defaultAssigneeName: "张三" });
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_items")) {
      // 同一 id 在两个 kind 都出现，验证去重；total 超过一页验证 truncated。
      return {
        json: page(
          [
            { id: "wi-1", identifier: "PROJ-1", state: { id: "s_new", name: "新提交" } },
            { id: "wi-2", identifier: "PROJ-2", state: { id: "s_done", name: "已完成" } },
          ],
          50,
          0,
          30,
        ),
      };
    }
    return undefined;
  });
  try {
    const result = await service.getMyWork({ kinds: ["bug", "requirement"] });
    assert.equal(result.assigneeName, "张三");
    // 跨两个 kind 同样两条 id 去重 → total 2。
    assert.equal(result.total, 2);
    assert.equal(result.truncated, true);
    assert.ok(result.note);
    const statuses = result.groups.map(g => g.status).sort();
    assert.deepEqual(statuses, ["已完成", "新提交"]);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("planStatusChange 只读 → 无写请求", async () => {
  const { service, store } = makeService();
  const stub = installFetchStub(req => {
    const t = tokenResponder(req);
    if (t) return t;
    const s = schemaResponder(req);
    if (s) return s;
    if (req.url.includes("/v1/project/work_item_state_plans")) {
      return { json: page([]) };
    }
    if (req.url.includes("/v1/project/work_items/")) {
      return { json: { id: "wi-1", identifier: "PROJ-1", state: { id: "s_new", name: "新提交" } } };
    }
    return undefined;
  });
  try {
    const result = await service.planStatusChange({ kind: "bug", workItemId: "wi-1", statusName: "已完成" });
    assert.equal(result.toStateId, "s_done");
    assert.equal(hasWriteRequest(stub.requests), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("resolveCurrentAssigneeName 有用户 token 时返回 /v1/myself 的 display_name", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const store = new AuthStore(config.authTokenPath);
  store.save({
    accessToken: "user-access",
    tokenType: "Bearer",
    expiresAt: Date.now() + 3600_000,
    savedAt: Date.now(),
  });
  const service = new WorkItemService(config, store);
  const stub = installFetchStub(req => {
    if (req.url.includes("/v1/myself")) {
      return { json: { id: "u1", display_name: "我本人" } };
    }
    return undefined;
  });
  try {
    const name = await service.resolveCurrentAssigneeName();
    assert.equal(name, "我本人");
  } finally {
    stub.restore();
    store.clear();
  }
});
