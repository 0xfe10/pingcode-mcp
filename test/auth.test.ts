import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthService } from "../src/pingcode/authService.js";
import { AuthStore } from "../src/pingcode/authStore.js";
import { PingCodeClient } from "../src/pingcode/client.js";

import { installFetchStub, makeConfig, tempAuthPath } from "./helpers.js";

const MYSELF = "/v1/myself";
const TOKEN = "/v1/auth/token";

test("无用户态 token + 有 clientId/secret → 业务请求用 client_credentials 令牌", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const store = new AuthStore(config.authTokenPath);
  const client = new PingCodeClient(config, store);

  const stub = installFetchStub(req => {
    if (req.url.includes(TOKEN)) {
      return { json: { access_token: "cc-access", token_type: "Bearer", expires_in: 7200 } };
    }
    if (req.url.includes(MYSELF)) {
      return { json: { id: "u1", display_name: "应用用户" } };
    }
    return undefined;
  });

  try {
    const user = await client.getCurrentUser();
    assert.equal(user.id, "u1");
    const myselfReq = stub.requests.find(r => r.url.includes(MYSELF));
    assert.equal(myselfReq?.authorization, "Bearer cc-access");
  } finally {
    stub.restore();
    store.clear();
  }
});

test("authStore 有未过期用户 token → 直接用用户 token，不走 client_credentials", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const store = new AuthStore(config.authTokenPath);
  store.save({
    accessToken: "user-access",
    refreshToken: "user-refresh",
    tokenType: "Bearer",
    expiresAt: Date.now() + 3600_000,
    savedAt: Date.now(),
  });
  const client = new PingCodeClient(config, store);

  const stub = installFetchStub(req => {
    if (req.url.includes(MYSELF)) {
      return { json: { id: "u2", display_name: "本人" } };
    }
    return undefined;
  });

  try {
    const user = await client.getCurrentUser();
    assert.equal(user.id, "u2");
    const myselfReq = stub.requests.find(r => r.url.includes(MYSELF));
    assert.equal(myselfReq?.authorization, "Bearer user-access");
    // 不应触发 token 端点。
    assert.equal(stub.requests.some(r => r.url.includes(TOKEN)), false);
  } finally {
    stub.restore();
    store.clear();
  }
});

test("用户 token 过期 + 有 refreshToken → 触发 refresh，后续用新 token 且保留原 refreshToken", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const store = new AuthStore(config.authTokenPath);
  store.save({
    accessToken: "old-access",
    refreshToken: "keep-refresh",
    tokenType: "Bearer",
    expiresAt: Date.now() - 1000,
    savedAt: Date.now(),
  });
  const client = new PingCodeClient(config, store);

  const stub = installFetchStub(req => {
    if (req.url.includes(TOKEN)) {
      assert.ok(req.url.includes("grant_type=refresh_token"));
      assert.ok(req.url.includes("refresh_token=keep-refresh"));
      return { json: { access_token: "new-access", token_type: "Bearer", expires_in: 3600 } };
    }
    if (req.url.includes(MYSELF)) {
      return { json: { id: "u3", display_name: "本人" } };
    }
    return undefined;
  });

  try {
    await client.getCurrentUser();
    const myselfReq = stub.requests.find(r => r.url.includes(MYSELF));
    assert.equal(myselfReq?.authorization, "Bearer new-access");
    const stored = store.get();
    assert.equal(stored?.accessToken, "new-access");
    // refresh_token 响应未返回新 refresh，应保留原值。
    assert.equal(stored?.refreshToken, "keep-refresh");
  } finally {
    stub.restore();
    store.clear();
  }
});

test("401 重试：业务端点首次 401、refresh 后第二次 200 → 最终成功", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const store = new AuthStore(config.authTokenPath);
  store.save({
    accessToken: "stale-access",
    refreshToken: "retry-refresh",
    tokenType: "Bearer",
    expiresAt: Date.now() + 3600_000,
    savedAt: Date.now(),
  });
  const client = new PingCodeClient(config, store);

  let myselfCalls = 0;
  const stub = installFetchStub(req => {
    if (req.url.includes(TOKEN)) {
      return { json: { access_token: "refreshed-access", token_type: "Bearer", expires_in: 3600 } };
    }
    if (req.url.includes(MYSELF)) {
      myselfCalls += 1;
      if (myselfCalls === 1) {
        return { status: 401, text: "unauthorized" };
      }
      return { json: { id: "u4", display_name: "本人" } };
    }
    return undefined;
  });

  try {
    const user = await client.getCurrentUser();
    assert.equal(user.id, "u4");
    assert.equal(myselfCalls, 2);
    // 触发了一次 refresh。
    assert.equal(stub.requests.filter(r => r.url.includes(TOKEN)).length, 1);
    // 重试请求使用了刷新后的新令牌。
    const retried = stub.requests.filter(r => r.url.includes(MYSELF));
    assert.equal(retried[1]?.authorization, "Bearer refreshed-access");
  } finally {
    stub.restore();
    store.clear();
  }
});

test("AuthService.loginWithCode 序列化不含 token 值，status 不含 token 值", async () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec" });
  const path = tempAuthPath("authservice");
  const store = new AuthStore(path);
  const authService = new AuthService(config, store);

  const stub = installFetchStub(req => {
    if (req.url.includes(TOKEN)) {
      return {
        json: {
          access_token: "secret-access-xyz",
          refresh_token: "secret-refresh-xyz",
          token_type: "Bearer",
          expires_in: 3600,
        },
      };
    }
    if (req.url.includes(MYSELF)) {
      return { json: { id: "u5", display_name: "登录用户" } };
    }
    return undefined;
  });

  try {
    const login = await authService.loginWithCode("auth-code-123");
    const loginJson = JSON.stringify(login);
    assert.equal(loginJson.includes("secret-access-xyz"), false);
    assert.equal(loginJson.includes("secret-refresh-xyz"), false);

    const status = await authService.status();
    const statusJson = JSON.stringify(status);
    assert.equal(statusJson.includes("secret-access-xyz"), false);
    assert.equal(statusJson.includes("secret-refresh-xyz"), false);
    assert.equal(status.hasUserToken, true);
  } finally {
    stub.restore();
    store.clear();
  }
});
