import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentEnv } from "./env-sanitize";

test("buildAgentEnv strips management-plane secrets", () => {
  const originals = new Map<string, string | undefined>();
  const set = (k: string, v: string) => {
    originals.set(k, process.env[k]);
    process.env[k] = v;
  };
  try {
    set("MULTICA_PAT", "mul_secret");
    set("NEXT_PUBLIC_MULTICA_PAT", "mul_public_secret");
    set("CABINET_DAEMON_TOKEN", "cdt_secret");
    set("KB_PASSWORD", "pw");
    set("TELEGRAM_BOT_TOKEN", "tg_secret");
    set("BENIGN_VAR", "keep-me");

    const env = buildAgentEnv();

    assert.equal(env.MULTICA_PAT, undefined);
    assert.equal(env.NEXT_PUBLIC_MULTICA_PAT, undefined);
    assert.equal(env.CABINET_DAEMON_TOKEN, undefined);
    assert.equal(env.KB_PASSWORD, undefined);
    assert.equal(env.TELEGRAM_BOT_TOKEN, undefined);
    assert.equal(env.BENIGN_VAR, "keep-me");
  } finally {
    for (const [k, v] of originals) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("buildAgentEnv skips undefined values", () => {
  const env = buildAgentEnv();
  for (const v of Object.values(env)) {
    assert.notEqual(v, undefined);
  }
});
