import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../src/config.js";

test("loadConfig leaves projectIdentifier unset when env is missing", () => {
  const previous = process.env.PINGCODE_PROJECT_IDENTIFIER;
  delete process.env.PINGCODE_PROJECT_IDENTIFIER;
  try {
    const config = loadConfig();
    assert.equal(config.projectIdentifier, undefined);
  } finally {
    if (previous === undefined) delete process.env.PINGCODE_PROJECT_IDENTIFIER;
    else process.env.PINGCODE_PROJECT_IDENTIFIER = previous;
  }
});
