import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "@/lib/http/create-handler";
import {
  assertValidFilename,
  assertValidSlug,
  isValidFilename,
  isValidSlug,
} from "./slug-utils";

test("isValidSlug accepts valid slugs within the length limit", () => {
  assert.equal(isValidSlug("agent_1-test"), true);
  assert.equal(isValidSlug(`a${"b".repeat(62)}`), true);
});

test("isValidSlug rejects traversal, empty, unicode, dotted, and overlong input", () => {
  assert.equal(isValidSlug(""), false);
  assert.equal(isValidSlug(".."), false);
  assert.equal(isValidSlug("../../etc/passwd"), false);
  assert.equal(isValidSlug(".foo"), false);
  assert.equal(isValidSlug("中文"), false);
  assert.equal(isValidSlug(`a${"b".repeat(63)}`), false);
});

test("assertValidSlug throws HttpError for invalid slug input", () => {
  assert.throws(
    () => assertValidSlug("../../etc/passwd"),
    (error: unknown) => error instanceof HttpError && error.status === 400
  );
});

test("isValidFilename accepts normal filenames including hidden-dot names", () => {
  assert.equal(isValidFilename("context.md"), true);
  assert.equal(isValidFilename(".foo"), true);
  assert.equal(isValidFilename("stats_v2-1.json"), true);
});

test("isValidFilename rejects traversal and invalid characters", () => {
  assert.equal(isValidFilename(""), false);
  assert.equal(isValidFilename("."), false);
  assert.equal(isValidFilename(".."), false);
  assert.equal(isValidFilename("../../etc/passwd"), false);
  assert.equal(isValidFilename("notes/today.md"), false);
  assert.equal(isValidFilename("中文.md"), false);
});

test("assertValidFilename throws HttpError for invalid filenames", () => {
  assert.throws(
    () => assertValidFilename(".."),
    (error: unknown) => error instanceof HttpError && error.status === 400
  );
});
