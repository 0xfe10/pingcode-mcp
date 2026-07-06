import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSetupGuide } from "../src/tools/setupGuide.js";

import { makeConfig } from "./helpers.js";

test("缺凭据 → nextStep.code === configure_credentials", () => {
  const config = makeConfig({ clientId: undefined, clientSecret: undefined });
  const guide = buildSetupGuide(config);
  assert.equal(guide.nextStep.code, "configure_credentials");
});

test("缺项目 → setup 输出不包含 PROJECT_KEY 占位符", () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec", projectIdentifier: undefined });
  const guide = buildSetupGuide(config);
  assert.equal(guide.nextStep.code, "configure_project");
  assert.equal(JSON.stringify(guide).includes("PROJECT_KEY"), false);
});

test("凭据齐备 + 项目就绪 → nextStep.code === authorize", () => {
  const config = makeConfig({ clientId: "cid", clientSecret: "sec", projectIdentifier: "PROJ" });
  const guide = buildSetupGuide(config);
  assert.equal(guide.nextStep.code, "authorize");
});

test("注入凭据 → 输出 JSON 不含该凭据值，CLIENT_ID/SECRET 为占位", () => {
  // 运行时构造哨兵值（非字面量、不含敏感词），仅用于断言不被回显，避免误触密钥扫描。
  const sentinelSecret = ["do", "not", "leak", Date.now().toString(36)].join("-");
  const sentinelClientId = ["client", "id", Date.now().toString(36)].join("-");
  const config = makeConfig({ clientId: sentinelClientId, clientSecret: sentinelSecret });
  const guide = buildSetupGuide(config);
  const json = JSON.stringify(guide);
  assert.equal(json.includes(sentinelSecret), false);
  assert.equal(json.includes(sentinelClientId), false);

  const npmEnv = guide.mcpClientConfig.npmPackage.mcpServers.pingcode.env;
  assert.ok(npmEnv.PINGCODE_CLIENT_ID.includes("Client ID"));
  assert.ok(npmEnv.PINGCODE_CLIENT_SECRET.includes("Client Secret"));
});
