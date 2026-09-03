import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAuthCallbackSearch,
  extractAuthInviteParams,
  hasInviteAccessTokens,
} from "@/lib/auth-invite";

test("招待リンクのcodeを取り出す", () => {
  assert.deepEqual(extractAuthInviteParams("?code=abc123"), { code: "abc123" });
});

test("ログイン画面に落ちた招待リンクからもcodeを取り出す", () => {
  assert.deepEqual(extractAuthInviteParams("?next=%2F%3Fcode%3Dabc123"), { code: "abc123" });
});

test("token_hash付きの招待リンクを取り出す", () => {
  assert.deepEqual(extractAuthInviteParams("?token_hash=hash&type=invite"), {
    tokenHash: "hash",
    type: "invite",
  });
});

test("ハッシュにトークンがある招待リンクだと判断する", () => {
  assert.equal(hasInviteAccessTokens("#access_token=aaa&refresh_token=bbb"), true);
  assert.equal(hasInviteAccessTokens(""), false);
});

test("コールバック用のクエリを組み立てる", () => {
  assert.equal(buildAuthCallbackSearch({ code: "abc123" }), "?code=abc123");
});
