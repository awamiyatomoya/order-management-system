# 受注管理システム

化粧品ブランドの卸売 B2B 受注業務を支える管理アプリです。MVP は、発注ファイルの取り込み、JAN による商品マスタ照合、受注保存、確定、取込履歴の確認までに絞っています。

## 開発

```bash
npm run dev
```

ブラウザで表示された `Local` URL を開きます。`3000` が使用中の場合は、Next.js が `3001` など別ポートで起動します。

## 現在できること

- クライアントと卸先を選択する
- CSV / Excel / PDF 発注書を取り込む
- PDF 発注書を macOS OCR / Tesseract OCR で読み取る
- 発注番号、日付、JAN、数量を受注データへ変換する
- 未登録JANを検出し、その場で商品マスタへ登録する
- 登録済み商品を画面から更新する
- 受注を `取込済み` として保存する
- 受注を `確定済み` にする
- 確定済み受注の再取込をブロックする
- 受注を削除する
- 取込履歴とエラー履歴をSupabaseから表示する
- 受注一覧を発注番号、PDFファイル名、届け先、ステータスで検索・絞り込みする

## 確認済みフロー

1. PDF発注書をアップロードする
2. OCR結果を確認する
3. 未登録JANがあれば商品を登録する
4. 商品価格を必要に応じて更新する
5. 受注が `取込済み` として保存される
6. 金額が発注書と一致することを確認する
7. `確定` を押して `確定済み` にする
8. 同じPDFを再アップロードし、確定済み受注が上書きされないことを確認する
9. 必要に応じて受注を削除し、再取込できることを確認する

## 重要なファイル

- `spec.md`: 今回合意したMVP仕様
- `.cursor/rules/order-management.md`: 実装時に守る不変ルール
- `supabase/migrations/20260529121600_initial_order_management_schema.sql`: Supabaseに作るDBテーブル定義
- `config/suppliers/sample-cosme-wholesale.json`: 卸先マッピング設定のひな形
- `samples/sample-order.csv`: 匿名サンプル発注ファイル
- `src/components/order-workbench.tsx`: 現在のMVP画面
- `src/app/api/parse-pdf/route.ts`: PDFから文字を抽出するAPI
- `src/lib/pdf-order-parser.ts`: OCR文字列を受注データへ変換する処理
- `scripts/ocr-image.swift`: macOS Vision OCR を使うローカルOCR補助スクリプト
- `src/lib/import-orders.ts`: 取り込み、チェック、確定時スナップショットのロジック
- `src/lib/supabase/read-order-data.ts`: Supabaseから画面の初期表示データを読む処理
- `src/lib/supabase/product-actions.ts`: 商品登録をSupabaseへ保存する処理
- `src/lib/supabase/import-actions.ts`: 取り込み結果と取込エラーをSupabaseへ保存する処理
- `src/lib/supabase/order-actions.ts`: 確定、確定取消、削除をSupabaseへ保存する処理

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

現在は読み取り、商品登録/更新、ファイル取り込み結果の保存、確定/確定取消、削除、取込履歴表示をSupabase化しています。

PDFファイルは文字抽出、OCR、発注書レイアウトに合わせた受注変換に対応しています。OCR結果は画面で確認でき、取込履歴とエラー履歴はSupabaseに保存します。

## 残っている主な課題

- PDFレイアウト差分への対応を増やす
- 商品マスタ編集UIをより分かりやすくする
- 削除操作の権限や監査ログを検討する
- 受注一覧が増えた時のページングを追加する
- COOOLa向けの出力ファイル生成を追加する

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
