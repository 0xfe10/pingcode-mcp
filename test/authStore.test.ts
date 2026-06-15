import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { AuthStore } from "../src/pingcode/authStore.js";

const dir = mkdtempSync(join(tmpdir(), "pingcode-authstore-"));

function freshStore(name: string): { store: AuthStore; path: string } {
  const path = join(dir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return { store: new AuthStore(path), path };
}

after(() => {
  // mkdtemp 目录里仅有测试 token 文件，逐个 clear 后目录可留空。
  // 不强制 rmdir，避免与并发用例竞争。
});

test("save 写入文件权限为 0600", () => {
  const { store, path } = freshStore("perm");
  store.save({ accessToken: "a", tokenType: "Bearer", savedAt: Date.now() });
  const mode = statSync(path).mode & 0o777;
  assert.equal(mode, 0o600);
  store.clear();
});

test("get 与 save 往返一致", () => {
  const { store } = freshStore("roundtrip");
  const tokens = {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    tokenType: "Bearer",
    expiresAt: 123456,
    savedAt: 999,
  };
  store.save(tokens);
  // 新建一个 store 实例强制读盘，验证持久化往返。
  const reread = new AuthStore((store as unknown as { path: string }).path);
  assert.deepEqual(reread.get(), tokens);
  store.clear();
});

test("update 不传 refreshToken 时保留原值", () => {
  const { store } = freshStore("update");
  store.save({ accessToken: "a0", refreshToken: "r0", tokenType: "Bearer", savedAt: 1 });
  const updated = store.update({ accessToken: "a1", expiresAt: 555 });
  assert.equal(updated.accessToken, "a1");
  assert.equal(updated.refreshToken, "r0");
  assert.equal(updated.expiresAt, 555);
  store.clear();
});

test("clear 后文件不存在", () => {
  const { store, path } = freshStore("clear");
  store.save({ accessToken: "a", tokenType: "Bearer", savedAt: Date.now() });
  assert.equal(existsSync(path), true);
  store.clear();
  assert.equal(existsSync(path), false);
  assert.equal(store.get(), undefined);
});
