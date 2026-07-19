import { expect, test } from "bun:test";
import { hasMobileSyncCursorRewound, hasMobileSyncIdentityChanged } from "./mobile-sync-protocol";

test("rebuilds the mobile mirror when the server change cursor rewinds", () => {
  expect(hasMobileSyncCursorRewound(42, 7)).toBe(true);
  expect(hasMobileSyncCursorRewound(42, 42)).toBe(false);
  expect(hasMobileSyncCursorRewound(42, 64)).toBe(false);
});

test("keeps compatibility with servers that do not report their current cursor", () => {
  expect(hasMobileSyncCursorRewound(42)).toBe(false);
});

test("rebuilds the mobile mirror when the server data identity changes", () => {
  expect(hasMobileSyncIdentityChanged("workspace-created-at-a", "workspace-created-at-b")).toBe(true);
  expect(hasMobileSyncIdentityChanged("workspace-created-at-a", "workspace-created-at-a")).toBe(false);
});

test("keeps compatibility with servers that do not report a data identity", () => {
  expect(hasMobileSyncIdentityChanged("legacy")).toBe(false);
});
