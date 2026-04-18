import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getMulticaPatFile,
  getMulticaWorkspaceIdFile,
  readMulticaPAT,
  readMulticaPATFile,
  readMulticaWorkspaceId,
} from "./multica-auth";

function mkTmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-multica-auth-"));
}

test("getMulticaPatFile points to .agents/.config/multica-pat.json", () => {
  const dataDir = "/any/data";
  assert.equal(
    getMulticaPatFile(dataDir),
    path.join(dataDir, ".agents", ".config", "multica-pat.json"),
  );
});

test("getMulticaWorkspaceIdFile points to .agents/.telegram/workspace-id.txt", () => {
  const dataDir = "/any/data";
  assert.equal(
    getMulticaWorkspaceIdFile(dataDir),
    path.join(dataDir, ".agents", ".telegram", "workspace-id.txt"),
  );
});

test("readMulticaPATFile returns trimmed token", () => {
  const dir = mkTmpDataDir();
  const file = path.join(dir, "pat.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ token: "  mul_live_abc  " }));
    assert.equal(readMulticaPATFile(file), "mul_live_abc");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readMulticaPATFile returns empty string when file missing or malformed", () => {
  const dir = mkTmpDataDir();
  try {
    assert.equal(readMulticaPATFile(path.join(dir, "missing.json")), "");

    const badJson = path.join(dir, "bad.json");
    fs.writeFileSync(badJson, "not-json");
    assert.equal(readMulticaPATFile(badJson), "");

    const noToken = path.join(dir, "no-token.json");
    fs.writeFileSync(noToken, JSON.stringify({ other: "value" }));
    assert.equal(readMulticaPATFile(noToken), "");

    const wrongType = path.join(dir, "wrong-type.json");
    fs.writeFileSync(wrongType, JSON.stringify({ token: 123 }));
    assert.equal(readMulticaPATFile(wrongType), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readMulticaPAT prefers file, mirrors to env, falls back to env", () => {
  const dir = mkTmpDataDir();
  const originalEnv = process.env.MULTICA_PAT;
  try {
    fs.mkdirSync(path.join(dir, ".agents", ".config"), { recursive: true });
    fs.writeFileSync(
      getMulticaPatFile(dir),
      JSON.stringify({ token: "mul_from_file" }),
    );
    process.env.MULTICA_PAT = "mul_from_env";

    assert.equal(readMulticaPAT(dir), "mul_from_file");
    assert.equal(process.env.MULTICA_PAT, "mul_from_file");

    fs.rmSync(path.join(dir, ".agents"), { recursive: true });
    process.env.MULTICA_PAT = "  mul_from_env_padded  ";
    assert.equal(readMulticaPAT(dir), "mul_from_env_padded");

    delete process.env.MULTICA_PAT;
    assert.equal(readMulticaPAT(dir), "");
  } finally {
    if (originalEnv === undefined) delete process.env.MULTICA_PAT;
    else process.env.MULTICA_PAT = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readMulticaWorkspaceId returns trimmed file contents or empty", () => {
  const dir = mkTmpDataDir();
  try {
    assert.equal(readMulticaWorkspaceId(dir), "");

    fs.mkdirSync(path.join(dir, ".agents", ".telegram"), { recursive: true });
    fs.writeFileSync(getMulticaWorkspaceIdFile(dir), "  ws_abc123\n");
    assert.equal(readMulticaWorkspaceId(dir), "ws_abc123");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
