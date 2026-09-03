import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseFeature,
  createMemberAuthPermissions,
  firstAllowedPath,
  resolveAuthPermissions,
  toggleAuthPermissionLevel,
  workbenchScopeToFeature,
} from "@/lib/auth-permissions";

test("権限がない人は見ることもできない", () => {
  const permissions = resolveAuthPermissions({ orders: "none", users: "none" });
  assert.equal(canUseFeature(permissions, "orders", "view"), false);
  assert.equal(canUseFeature(permissions, "orders", "delete"), false);
});

test("見るだけなら追加や削除はできない", () => {
  const permissions = resolveAuthPermissions({ orders: "view" });
  assert.equal(canUseFeature(permissions, "orders", "view"), true);
  assert.equal(canUseFeature(permissions, "orders", "create"), false);
  assert.equal(canUseFeature(permissions, "orders", "edit"), false);
  assert.equal(canUseFeature(permissions, "orders", "delete"), false);
});

test("削除まで付けると下の段階も全部できる", () => {
  const permissions = resolveAuthPermissions({ sellOut: "delete" });
  assert.equal(canUseFeature(permissions, "sellOut", "view"), true);
  assert.equal(canUseFeature(permissions, "sellOut", "create"), true);
  assert.equal(canUseFeature(permissions, "sellOut", "edit"), true);
  assert.equal(canUseFeature(permissions, "sellOut", "delete"), true);
});

test("同じボタンをもう一度押すと権限を外す", () => {
  assert.equal(toggleAuthPermissionLevel("edit", "edit"), "none");
  assert.equal(toggleAuthPermissionLevel("view", "delete"), "delete");
});

test("なしを選ぶとその機能は見られない", () => {
  const permissions = resolveAuthPermissions({ products: "none" });
  assert.equal(canUseFeature(permissions, "products", "view"), false);
});

test("管理者は保存がなくても全部できる", () => {
  const permissions = resolveAuthPermissions(undefined, { isAdmin: true });
  assert.equal(canUseFeature(permissions, "users", "delete"), true);
  assert.equal(canUseFeature(permissions, "orders", "delete"), true);
});

test("権限の記録がない一般ユーザーは見るだけでき、ユーザー画面は開けない", () => {
  const permissions = resolveAuthPermissions(undefined);
  const defaults = createMemberAuthPermissions();
  assert.deepEqual(permissions, defaults);
  assert.equal(canUseFeature(permissions, "products", "view"), true);
  assert.equal(canUseFeature(permissions, "products", "create"), false);
  assert.equal(canUseFeature(permissions, "users", "view"), false);
});

test("見られる最初の画面に戻す", () => {
  const permissions = {
    ...createMemberAuthPermissions(),
    orders: "none" as const,
    payouts: "none" as const,
    clients: "none" as const,
    products: "none" as const,
    deliveryDestinations: "none" as const,
    stores: "none" as const,
    storeIntroductions: "none" as const,
    sellIn: "none" as const,
    sellOut: "view" as const,
    orderFiles: "none" as const,
    history: "none" as const,
    users: "none" as const,
  };
  assert.equal(firstAllowedPath(permissions), "/sell-out");
});

test("セルアウトの取込ファイルはセルアウトの権限を使う", () => {
  assert.equal(workbenchScopeToFeature("sellOutFiles"), "sellOut");
  assert.equal(workbenchScopeToFeature("products"), "products");
});
