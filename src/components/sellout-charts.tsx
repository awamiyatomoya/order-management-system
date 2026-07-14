"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelloutChartRow } from "@/lib/sellout-view";

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatChartMonthLabel(value: string, { includeYear = false }: { includeYear?: boolean } = {}) {
  const [year, month] = value.split("-");
  if (!year || !month) {
    return value;
  }

  if (includeYear) {
    return `${year.slice(2)}年${Number(month)}月`;
  }

  return `${Number(month)}月`;
}

function formatChartAmount(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 1000) / 10}万`;
  }

  return value.toLocaleString("ja-JP");
}

function getNiceChartMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const normalized = value / base;

  if (normalized <= 1) {
    return base;
  }

  if (normalized <= 2) {
    return 2 * base;
  }

  if (normalized <= 5) {
    return 5 * base;
  }

  return 10 * base;
}

export function SelloutCharts({
  monthlyRows,
  productRows,
}: {
  monthlyRows: SelloutChartRow[];
  productRows: SelloutChartRow[];
}) {
  const maxMonthlyAmount = Math.max(...monthlyRows.map((row) => row.amount), 1);
  const monthlyAmountScaleMax = getNiceChartMax(maxMonthlyAmount);
  const needsScroll = monthlyRows.length > 14;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月別売上金額推移</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>
          ) : (
            <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
              <div className="flex min-h-52 flex-col justify-between pb-6 text-right text-[10px] text-muted-foreground">
                <span>{formatChartAmount(monthlyAmountScaleMax)}</span>
                <span>{formatChartAmount(Math.floor(monthlyAmountScaleMax / 2))}</span>
                <span>0</span>
              </div>
              <div className="relative">
                <div className={needsScroll ? "overflow-x-auto pb-8" : "pb-2"}>
                  <div
                    className={`relative flex min-h-64 items-end gap-1.5 border-b pb-8 pt-8 sm:gap-2 ${
                      needsScroll ? "min-w-[720px]" : ""
                    }`}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
                    {monthlyRows.map((row, index) => {
                      const height =
                        row.amount > 0
                          ? Math.max((row.amount / monthlyAmountScaleMax) * 144, 48)
                          : 0;
                      const includeYear = index === 0 || row.label.endsWith("-01");

                      return (
                        <div
                          key={row.label}
                          className="flex min-w-0 flex-1 flex-col items-center gap-1 text-xs"
                        >
                          <div
                            className={`group relative w-full max-w-12 rounded-t ${
                              row.amount > 0 ? "bg-blue-600 shadow-sm" : "bg-transparent"
                            }`}
                            style={{ height: `${height}px` }}
                          >
                            {row.amount > 0 ? (
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-2 py-1 text-[13px] font-normal text-popover-foreground shadow-md group-hover:block">
                                {formatYen(row.amount)}
                              </div>
                            ) : null}
                          </div>
                          <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                            {formatChartMonthLabel(row.label, { includeYear })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {needsScroll ? (
                  <div className="pointer-events-none absolute right-3 bottom-3 flex justify-end">
                    <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
                      スクロールできます →
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">商品別売上数量ランキング</CardTitle>
        </CardHeader>
        <CardContent>
          {productRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">表示できるデータがありません。</p>
          ) : (
            <div className="flex flex-col gap-3">
              {productRows.map((row) => {
                const maxQty = Math.max(...productRows.map((candidate) => candidate.qty), 1);
                const width = Math.max((row.qty / maxQty) * 100, row.qty > 0 ? 6 : 1);

                return (
                  <div key={row.label} className="grid gap-1.5">
                    <div className="truncate text-xs font-medium text-foreground">{row.label}</div>
                    <div className="relative h-[18px] overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-700" style={{ width: `${width}%` }} />
                      <div className="absolute inset-y-0 left-0 flex items-center rounded-full bg-emerald-900 px-3 text-xs font-bold text-white">
                        <span className="shrink-0">
                          {row.qty.toLocaleString()}点 / {formatYen(row.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
