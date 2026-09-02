import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveAuthAppOrigin,
  resolveAuthDisplayName,
  validateAuthDisplayName,
  validateAuthEmail,
  validateAuthPassword,
} from "@/lib/auth-user";

test("ログインユーザーの表示名は登録名を優先し、なければメールにする", () => {
  assert.equal(
    resolveAuthDisplayName({
      email: "taro@example.com",
      user_metadata: { display_name: "山田太郎" },
    }),
    "山田太郎",
  );
  assert.equal(resolveAuthDisplayName({ email: "taro@example.com" }), "taro@example.com");
});

test("メールとパスワードの入力を検証する", () => {
  assert.equal(validateAuthEmail("taro@example.com").ok, true);
  assert.equal(validateAuthEmail("not-an-email").ok, false);
  assert.equal(validateAuthPassword("short").ok, false);
  assert.equal(validateAuthPassword("longenough").ok, true);
  assert.equal(validateAuthDisplayName("").ok, false);
  assert.equal(validateAuthDisplayName("山田太郎").ok, true);
});

test("招待メールの戻り先は公開サイトの住所を優先する", () => {
  assert.equal(
    resolveAuthAppOrigin({ siteUrl: "https://oms.example.com/" }),
    "https://oms.example.com",
  );
  assert.equal(
    resolveAuthAppOrigin({
      forwardedProto: "https",
      forwardedHost: "oms.example.com",
    }),
    "https://oms.example.com",
  );
});
