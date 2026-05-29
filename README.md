# 受注管理システム

化粧品ブランドの卸売 B2B 受注業務を支える管理アプリです。MVP は、発注ファイルの取り込み、JAN による商品マスタ照合、受注一覧、確定処理までに絞っています。

## 開発

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

## まず試すこと

1. クライアントに `cocone` を選ぶ
2. 卸先に `サンプル卸` を選ぶ
3. `samples/sample-order.csv` を取り込む
4. 受注が `imported` として保存されることを確認する
5. `確定` を押して `confirmed` にする

## 重要なファイル

- `spec.md`: 今回合意したMVP仕様
- `.cursor/rules/order-management.md`: 実装時に守る不変ルール
- `supabase/migrations/20260529121600_initial_order_management_schema.sql`: Supabaseに作るDBテーブル定義
- `config/suppliers/sample-cosme-wholesale.json`: 卸先マッピング設定のひな形
- `samples/sample-order.csv`: 匿名サンプル発注ファイル
- `src/components/order-workbench.tsx`: 現在のMVP画面
- `src/lib/import-orders.ts`: 取り込み、チェック、確定時スナップショットのロジック
- `src/lib/supabase/read-order-data.ts`: Supabaseから画面の初期表示データを読む処理
- `src/lib/supabase/product-actions.ts`: 商品登録をSupabaseへ保存する処理
- `src/lib/supabase/import-actions.ts`: 取り込み結果と取込エラーをSupabaseへ保存する処理
- `src/lib/supabase/order-actions.ts`: 確定/確定取消をSupabaseへ保存する処理

## Supabase DB

DBの設計図は `supabase/migrations` に置いています。画面の初期表示データは、環境変数が設定されていればSupabaseから読みます。未設定または読み取り失敗時は、開発を止めないために匿名サンプルデータを表示します。

作られる主なテーブル:

- `clients`: クライアント
- `suppliers`: 卸先
- `products`: 商品マスタ
- `orders`: 受注ヘッダ
- `order_lines`: 受注明細
- `import_batches`: 取込履歴
- `import_errors`: 取込エラー

すべての業務テーブルに `client_id` を持たせています。これは、将来クライアントログインを入れたときに、会社ごとのデータが混ざらないようにするためです。

### 接続に必要な環境変数

`.env.example` を参考に `.env.local` を作ります。`.env.local` は秘密情報なのでGitに入れません。

```bash
cp .env.example .env.local
```

Supabaseの管理画面から以下をコピーして `.env.local` に入れます。

- `NEXT_PUBLIC_SUPABASE_URL`: Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: service_role key

`SUPABASE_SERVICE_ROLE_KEY` は強い権限を持つキーです。ブラウザに出してはいけません。サーバー側だけで使います。

現在は読み取り、商品登録、ファイル取り込み結果の保存、確定/確定取消をSupabase化しています。

### ローカルSupabaseで試す場合

Dockerが使える環境なら、以下でローカルDBを起動し、マイグレーションとseedを適用できます。

```bash
npx supabase start
npx supabase db reset
```

### クラウドSupabaseへ適用する場合

Supabaseプロジェクトを作成後、CLIでログインしてプロジェクトを紐づけます。

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`<your-project-ref>` はSupabaseのプロジェクトURLや管理画面で確認できます。

## Git に入れないもの

本番の発注ファイル、住所、電話番号、取引先名、秘密キー、`.env.local` は Git に入れません。サンプルは匿名化したものだけを置きます。
