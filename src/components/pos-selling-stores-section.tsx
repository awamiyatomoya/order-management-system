"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildPosSellingStoreGroups,
  formatMonthKeyLabel,
  POS_SELLING_ACTIVE_MONTHS,
} from "@/lib/pos-selling-stores";
import { readSelloutData } from "@/lib/supabase/sellout-actions";
import type { SelloutEntry } from "@/lib/types";

type SelloutLoadState = {
  clientId: string;
  entries: SelloutEntry[];
  notice: string;
};

export function PosSellingStoresSection({ clientId }: { clientId: string }) {
  const [loadState, setLoadState] = useState<SelloutLoadState | null>(null);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    let cancelled = false;

    readSelloutData(clientId)
      .then((data) => {
        if (!cancelled) {
          setLoadState({ clientId, entries: data.entries, notice: "" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({
            clientId,
            entries: [],
            notice:
              error instanceof Error
                ? `セルアウトデータの読み込みに失敗しました: ${error.message}`
                : "セルアウトデータの読み込みに失敗しました。",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const isCurrent = loadState?.clientId === clientId;
  const notice = isCurrent ? loadState.notice : "";
  const isLoading = Boolean(clientId) && !isCurrent;

  const groups = useMemo(
    () => buildPosSellingStoreGroups(loadState?.clientId === clientId ? loadState.entries : []),
    [clientId, loadState],
  );

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="grid gap-1">
          <h3 className="text-base font-semibold">販売店舗（POS実売ベース）</h3>
          <p className="text-sm text-muted-foreground">
            セルアウトに取り込んだPOSから、小売企業ごとに直近{POS_SELLING_ACTIVE_MONTHS}
            ヶ月（最新POS月基準）に販売実績のある店舗を「販売中」として集計します。
            導入店舗ファイルの内容は書き換えず、実売ベースの参考情報として表示します。
          </p>
        </div>

        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        {isLoading ? (
          <p className="text-base text-muted-foreground">POSデータを読み込んでいます...</p>
        ) : groups.length === 0 ? (
          <p className="text-base text-muted-foreground">
            まだセルアウトのPOSデータがありません。セルアウトページからPOSを取り込むと、ここに販売店舗が表示されます。
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.retailer} className="grid gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-base font-semibold">{group.retailer}</h4>
                <Badge variant="secondary">
                  {formatMonthKeyLabel(group.latestMonthKey)}POS時点
                </Badge>
                <span className="text-sm text-muted-foreground">
                  販売中 {group.activeStoreCount.toLocaleString()}店
                  {group.inactiveStoreCount > 0
                    ? ` / 直近${POS_SELLING_ACTIVE_MONTHS}ヶ月実績なし ${group.inactiveStoreCount.toLocaleString()}店`
                    : ""}
                </span>
              </div>
              {group.isStale ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  最新のPOSが{group.monthsSinceLatest}ヶ月前（
                  {formatMonthKeyLabel(group.latestMonthKey)}分）で止まっています。
                  最新月のPOSを取り込むまで、この一覧は
                  {formatMonthKeyLabel(group.latestMonthKey)}時点の情報です。
                </p>
              ) : null}
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 min-w-12 text-center">No.</TableHead>
                      <TableHead>店舗名</TableHead>
                      <TableHead>最終販売月</TableHead>
                      <TableHead>直近{POS_SELLING_ACTIVE_MONTHS}ヶ月販売数</TableHead>
                      <TableHead>状態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.stores.map((store, index) => (
                      <TableRow key={store.storeKey}>
                        <TableCell className="text-center text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{store.storeName}</TableCell>
                        <TableCell>{formatMonthKeyLabel(store.lastSoldMonthKey)}</TableCell>
                        <TableCell>
                          {store.isActive ? `${store.recentQty.toLocaleString()}個` : "-"}
                        </TableCell>
                        <TableCell>
                          {store.isActive ? (
                            <Badge>販売中</Badge>
                          ) : (
                            <Badge variant="outline">実績なし</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
