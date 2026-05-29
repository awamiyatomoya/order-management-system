"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calculateLineAmount,
  buildImportDraft,
  confirmOrder,
} from "@/lib/import-orders";
import { supplierMappings } from "@/lib/mock-data";
import {
  saveBlockedImport,
  saveImportedOrders,
} from "@/lib/supabase/import-actions";
import {
  confirmOrderInSupabase,
  undoOrderConfirmationInSupabase,
} from "@/lib/supabase/order-actions";
import type { OrderWorkbenchInitialData } from "@/lib/supabase/read-order-data";
import { saveProduct } from "@/lib/supabase/product-actions";
import type { ImportBatch, ImportError, Order, Product } from "@/lib/types";

type ProductForm = {
  jan: string;
  internalSku: string;
  cooolaCode: string;
  name: string;
  wholesalePrice: string;
  taxRate: string;
  memo: string;
};

type PendingImport = {
  rows: Record<string, unknown>[];
  fileName: string;
  missingJans: string[];
};

const emptyProductForm: ProductForm = {
  jan: "",
  internalSku: "",
  cooolaCode: "",
  name: "",
  wholesalePrice: "",
  taxRate: "0.1",
  memo: "",
};

export function OrderWorkbench({ initialData }: { initialData: OrderWorkbenchInitialData }) {
  const [selectedClientId, setSelectedClientId] = useState(initialData.clients[0]?.id ?? "");
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialData.suppliers[0]?.id ?? "");
  const [products, setProducts] = useState<Product[]>(initialData.products);
  const [orders, setOrders] = useState<Order[]>(initialData.orders);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [notice, setNotice] = useState(initialData.message);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const selectableSuppliers = initialData.suppliers.filter(
    (supplier) => supplier.clientId === selectedClientId,
  );
  const selectedSupplier = selectableSuppliers.find(
    (supplier) => supplier.id === selectedSupplierId,
  );
  const selectedOrders = orders.filter((order) => order.clientId === selectedClientId);
  const selectedProducts = products.filter((product) => product.clientId === selectedClientId);
  const selectedClient = initialData.clients.find((client) => client.id === selectedClientId);
  const missingJans = pendingImport?.missingJans ?? [];

  const totalAmount = useMemo(
    () =>
      selectedOrders.reduce(
        (sum, order) =>
          sum +
          order.lines.reduce(
            (lineSum, line) => lineSum + calculateLineAmount(order, line, products),
            0,
          ),
        0,
      ),
    [products, selectedOrders],
  );

  function handleFileChange(file: File | null) {
    if (!file) {
      return;
    }

    setNotice(`${file.name} をチェックしています。`);
    readRows(file)
      .then((rows) => applyImport(rows, file.name))
      .catch((error: unknown) => {
        setErrors([{ row: 0, field: "file", message: getErrorMessage(error) }]);
        setNotice("ファイルを読めませんでした。");
      });
  }

  async function applyImport(rows: Record<string, unknown>[], fileName: string) {
    if (!selectedClientId || !selectedSupplier) {
      setNotice("先にクライアントと卸先を選んでください。");
      return;
    }

    const mapping = supplierMappings[selectedSupplier.mappingKey];
    const draft = buildImportDraft({
      rows,
      clientId: selectedClientId,
      supplier: selectedSupplier,
      mapping,
      products,
      existingOrders: orders,
      sourceFile: fileName,
    });

    if (draft.errors.length > 0) {
      setErrors(draft.errors);
      setPendingImport({ rows, fileName, missingJans: draft.missingJans });
      setImportBatches((current) => [
        buildImportBatch(fileName, "blocked", draft.errors),
        ...current,
      ]);
      setIsSavingImport(true);
      const saveResult = await saveBlockedImport({
        clientId: selectedClientId,
        supplierId: selectedSupplier.id,
        fileName,
        errors: draft.errors,
      });
      setIsSavingImport(false);
      setNotice(
        saveResult.ok
          ? `怪しい点があるため受注は保存していません。${saveResult.message}`
          : saveResult.message,
      );
      return;
    }

    setIsSavingImport(true);
    const saveResult = await saveImportedOrders({
      clientId: selectedClientId,
      supplierId: selectedSupplier.id,
      fileName,
      orders: draft.orders,
    });
    setIsSavingImport(false);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    const savedOrders = applySavedOrderIds(draft.orders, saveResult.orderIds);
    setOrders((current) => mergeImportedOrders(current, savedOrders));
    setErrors([]);
    setPendingImport(null);
    setImportBatches((current) => [buildImportBatch(fileName, "saved", []), ...current]);
    setNotice(`${draft.orders.length}件の受注を imported として保存しました。${saveResult.message}`);
  }

  async function registerProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const wholesalePrice = Number(productForm.wholesalePrice);
    const taxRate = Number(productForm.taxRate);

    if (!productForm.jan || !productForm.name || !productForm.cooolaCode) {
      setNotice("JAN、商品名、COOOLa商品コードは必須です。");
      return;
    }

    if (!Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      setNotice("下代は0以上の数字で入力してください。");
      return;
    }

    if (!Number.isFinite(taxRate) || taxRate < 0) {
      setNotice("税率は0以上の数字で入力してください。");
      return;
    }

    const nextProduct: Product = {
      jan: productForm.jan,
      clientId: selectedClientId,
      internalSku: productForm.internalSku,
      cooolaCode: productForm.cooolaCode,
      name: productForm.name,
      wholesalePrice,
      taxRate,
      memo: productForm.memo,
    };

    setIsSavingProduct(true);

    const saveResult = await saveProduct(nextProduct);
    setIsSavingProduct(false);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    const nextProducts = [
      ...products.filter(
        (product) => !(product.clientId === selectedClientId && product.jan === nextProduct.jan),
      ),
      nextProduct,
    ];

    setProducts(nextProducts);
    setProductForm(emptyProductForm);
    setNotice(`${nextProduct.jan} を商品マスタに登録しました。${saveResult.message}`);

    if (pendingImport) {
      const nextMissingJans = pendingImport.missingJans.filter((jan) => jan !== nextProduct.jan);
      setPendingImport({ ...pendingImport, missingJans: nextMissingJans });

      if (nextMissingJans.length === 0) {
        await retryImportAfterProductRegistration(
          pendingImport.rows,
          pendingImport.fileName,
          nextProducts,
        );
      }
    }
  }

  async function retryImportAfterProductRegistration(
    rows: Record<string, unknown>[],
    fileName: string,
    nextProducts: Product[],
  ) {
    if (!selectedSupplier) {
      return;
    }

    const draft = buildImportDraft({
      rows,
      clientId: selectedClientId,
      supplier: selectedSupplier,
      mapping: supplierMappings[selectedSupplier.mappingKey],
      products: nextProducts,
      existingOrders: orders,
      sourceFile: fileName,
    });

    if (draft.errors.length > 0) {
      setErrors(draft.errors);
      setNotice("商品登録後もエラーが残っています。");
      return;
    }

    setIsSavingImport(true);
    const saveResult = await saveImportedOrders({
      clientId: selectedClientId,
      supplierId: selectedSupplier.id,
      fileName,
      orders: draft.orders,
    });
    setIsSavingImport(false);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    const savedOrders = applySavedOrderIds(draft.orders, saveResult.orderIds);
    setOrders((current) => mergeImportedOrders(current, savedOrders));
    setErrors([]);
    setPendingImport(null);
    setImportBatches((current) => [buildImportBatch(fileName, "saved", []), ...current]);
    setNotice(`商品登録後に再チェックし、受注を自動保存しました。${saveResult.message}`);
  }

  async function updateOrderStatus(orderId: string, action: "confirm" | "undo") {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      setNotice("対象の受注が見つかりません。");
      return;
    }

    setSavingOrderId(orderId);
    const saveResult =
      action === "confirm"
        ? await confirmOrderInSupabase({
            clientId: targetOrder.clientId,
            orderId: targetOrder.id,
          })
        : await undoOrderConfirmationInSupabase({
            clientId: targetOrder.clientId,
            orderId: targetOrder.id,
          });
    setSavingOrderId(null);

    if (!saveResult.ok) {
      setNotice(saveResult.message);
      return;
    }

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== orderId) {
          return order;
        }

        if (action === "confirm") {
          return confirmOrder(order, products);
        }

        return {
          ...order,
          status: "imported",
          lines: order.lines.map((line) => ({
            ...line,
            unitPriceSnapshot: null,
            taxRateSnapshot: null,
            amount: null,
          })),
        };
      }),
    );
    setNotice(saveResult.message);
  }

  function handleClientChange(clientId: string) {
    const firstSupplier = initialData.suppliers.find((supplier) => supplier.clientId === clientId);
    setSelectedClientId(clientId);
    setSelectedSupplierId(firstSupplier?.id ?? "");
    setErrors([]);
    setPendingImport(null);
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">MVP Prototype</p>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">受注管理システム</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              まずは仮データで、発注ファイルの取り込み、JAN照合、未登録商品の登録、受注一覧までを確認できます。
              Supabase接続は次の段階で追加します。
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="選択中クライアント" value={selectedClient?.name ?? "未選択"} />
          <SummaryCard label="受注件数" value={`${selectedOrders.length}件`} />
          <SummaryCard label="表示中の仮合計" value={`${totalAmount.toLocaleString()}円`} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="flex flex-col gap-4">
            <Panel title="操作">
              <FieldGroup>
                <Field>
                  <FieldLabel>クライアント</FieldLabel>
                  <Select
                    items={initialData.clients.map((client) => ({
                      label: client.name,
                      value: client.id,
                    }))}
                    value={selectedClientId}
                    onValueChange={(value) => handleClientChange(value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {initialData.clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>卸先</FieldLabel>
                  <Select
                    items={selectableSuppliers.map((supplier) => ({
                      label: supplier.name,
                      value: supplier.id,
                    }))}
                    value={selectedSupplierId}
                    onValueChange={(value) => setSelectedSupplierId(value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {selectableSuppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>発注ファイル</FieldLabel>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    disabled={isSavingImport}
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  />
                </Field>
              </FieldGroup>

              <Alert>
                <AlertTitle>現在の状態</AlertTitle>
                <AlertDescription>
                  {isSavingImport ? "取り込み結果を保存しています。" : notice}
                </AlertDescription>
              </Alert>
            </Panel>

            {missingJans.length > 0 ? (
              <Panel title="未登録JANの商品登録">
                <p className="text-sm text-muted-foreground">
                  未登録JANがあるため、注文はまだ保存していません。商品を登録すると自動で再チェックします。
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingJans.map((jan) => (
                    <Button
                      variant="outline"
                      size="sm"
                      key={jan}
                      type="button"
                      onClick={() => setProductForm({ ...emptyProductForm, jan })}
                    >
                      {jan}
                    </Button>
                  ))}
                </div>
                <ProductRegistrationForm
                  form={productForm}
                  isSaving={isSavingProduct}
                  onChange={setProductForm}
                  onSubmit={registerProduct}
                />
              </Panel>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            {errors.length > 0 ? (
              <Panel title="取込エラー">
                <div className="flex flex-col gap-2">
                  {errors.map((error, index) => (
                    <Alert
                      variant="destructive"
                      key={`${error.field}-${index}`}
                    >
                      <AlertTitle>
                        {error.row > 0 ? `${error.row}行目` : "ファイル全体"}
                      </AlertTitle>
                      <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </Panel>
            ) : null}

            <Panel title="受注一覧">
              {selectedOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだ受注がありません。`samples/sample-order.csv` を取り込むと動きを確認できます。
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {selectedOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      products={products}
                      isSaving={savingOrderId === order.id}
                      onConfirm={() => updateOrderStatus(order.id, "confirm")}
                      onUndo={() => updateOrderStatus(order.id, "undo")}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="取込履歴">
              {importBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">取込履歴はまだありません。</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {importBatches.slice(0, 5).map((batch) => (
                    <Card size="sm" key={batch.id}>
                      <CardContent>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{batch.fileName}</span>
                        <StatusBadge status={batch.status} />
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {new Date(batch.importedAt).toLocaleString("ja-JP")} / エラー{" "}
                        {batch.errors.length}件
                      </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="商品マスタ">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>JAN</TableHead>
                    <TableHead>商品名</TableHead>
                    <TableHead>COOOLaコード</TableHead>
                    <TableHead>下代</TableHead>
                    <TableHead>税率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedProducts.map((product) => (
                    <TableRow key={product.jan}>
                      <TableCell className="font-mono text-xs">
                        {product.jan}
                      </TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.cooolaCode}</TableCell>
                      <TableCell>
                        {product.wholesalePrice.toLocaleString()}円
                      </TableCell>
                      <TableCell>{product.taxRate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
            </Table>
          </Panel>

          <Panel title="次に作るもの">
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li>Supabaseのテーブル作成と `client_id` 分離</li>
              <li>今回のブラウザ内状態をSupabase保存に差し替え</li>
              <li>卸先マッピング設定をJSONファイルから読む処理</li>
              <li>取込履歴とエラーのDB保存</li>
            </ul>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function ProductRegistrationForm({
  form,
  isSaving,
  onChange,
  onSubmit,
}: {
  form: ProductForm;
  isSaving: boolean;
  onChange: (form: ProductForm) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
      <TextInput label="JAN" value={form.jan} onChange={(jan) => onChange({ ...form, jan })} />
      <TextInput
        label="商品名"
        value={form.name}
        onChange={(name) => onChange({ ...form, name })}
      />
      <TextInput
        label="COOOLa商品コード"
        value={form.cooolaCode}
        onChange={(cooolaCode) => onChange({ ...form, cooolaCode })}
      />
      <TextInput
        label="社内SKU"
        value={form.internalSku}
        onChange={(internalSku) => onChange({ ...form, internalSku })}
      />
      <TextInput
        label="下代"
        value={form.wholesalePrice}
        onChange={(wholesalePrice) => onChange({ ...form, wholesalePrice })}
      />
      <TextInput
        label="税率"
        value={form.taxRate}
        onChange={(taxRate) => onChange({ ...form, taxRate })}
      />
      <TextInput label="メモ" value={form.memo} onChange={(memo) => onChange({ ...form, memo })} />
      <Button disabled={isSaving}>
        {isSaving ? "登録中..." : "商品を登録"}
      </Button>
      </FieldGroup>
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function OrderCard({
  order,
  products,
  isSaving,
  onConfirm,
  onUndo,
}: {
  order: Order;
  products: Product[];
  isSaving: boolean;
  onConfirm: () => void;
  onUndo: () => void;
}) {
  const amount = order.lines.reduce(
    (sum, line) => sum + calculateLineAmount(order, line, products),
    0,
  );

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>発注番号 {order.orderNo}</CardTitle>
            <StatusBadge status={order.status} />
          </div>
          <CardDescription>
            {order.shipToName} / {order.warehouse} / {order.sourceFile}
          </CardDescription>
        </div>
        <CardAction>
        <div className="flex gap-2">
          {order.status === "imported" ? (
            <Button
              type="button"
              disabled={isSaving}
              onClick={onConfirm}
            >
              {isSaving ? "保存中..." : "確定"}
            </Button>
          ) : null}
          {order.status === "confirmed" ? (
            <Button
              variant="outline"
              type="button"
              disabled={isSaving}
              onClick={onUndo}
            >
              {isSaving ? "保存中..." : "確定を取り消す"}
            </Button>
          ) : null}
        </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>JAN</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead>COOOLaコード</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>単価</TableHead>
              <TableHead>金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => {
              const product = products.find(
                (candidate) => candidate.clientId === order.clientId && candidate.jan === line.jan,
              );
              const unitPrice =
                order.status === "imported"
                  ? product?.wholesalePrice ?? 0
                  : line.unitPriceSnapshot ?? 0;

              return (
                <TableRow key={line.id}>
                  <TableCell className="font-mono text-xs">
                    {line.jan}
                  </TableCell>
                  <TableCell>{product?.name ?? "未登録"}</TableCell>
                  <TableCell>{product?.cooolaCode ?? "-"}</TableCell>
                  <TableCell>{line.qty}</TableCell>
                  <TableCell>
                    {unitPrice.toLocaleString()}円
                  </TableCell>
                  <TableCell>
                    {calculateLineAmount(order, line, products).toLocaleString()}円
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

      <p className="text-right text-sm font-semibold">合計 {amount.toLocaleString()}円</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "saved" || status === "confirmed"
      ? "default"
      : status === "blocked"
        ? "destructive"
        : "secondary";

  return (
    <Badge variant={variant}>{status}</Badge>
  );
}

function buildImportBatch(
  fileName: string,
  status: ImportBatch["status"],
  errors: ImportError[],
): ImportBatch {
  return {
    id: crypto.randomUUID(),
    fileName,
    clientId: "",
    supplierId: "",
    importedAt: new Date().toISOString(),
    status,
    errors,
  };
}

function mergeImportedOrders(current: Order[], importedOrders: Order[]) {
  const importedKeys = new Set(
    importedOrders.map((order) => `${order.clientId}:${order.supplierId}:${order.orderNo}`),
  );

  return [
    ...current.filter((order) => !importedKeys.has(`${order.clientId}:${order.supplierId}:${order.orderNo}`)),
    ...importedOrders,
  ];
}

function applySavedOrderIds(orders: Order[], orderIds?: Record<string, string>) {
  if (!orderIds) {
    return orders;
  }

  return orders.map((order) => ({
    ...order,
    id: orderIds[order.orderNo] ?? order.id,
  }));
}

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }

  const text = await file.text();

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject,
    });
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "不明なエラーです";
}
