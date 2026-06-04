"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DeliveryDestination } from "@/lib/delivery-destination-master";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

const deliveryDestinationSchema = z.object({
  clientId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  postalCode: z.string(),
  address1: z.string().min(1),
  address2: z.string(),
  address3: z.string(),
  tel: z.string(),
  aliases: z.array(z.string()),
});

export type SaveDeliveryDestinationResult =
  | {
      ok: true;
      savedToSupabase: boolean;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveDeliveryDestination(
  destination: DeliveryDestination,
): Promise<SaveDeliveryDestinationResult> {
  const result = deliveryDestinationSchema.safeParse(destination);

  if (!result.success) {
    return {
      ok: false,
      message: "配送先情報に不足があります。コード、配送先名、住所を確認してください。",
    };
  }

  if (!hasSupabaseServerEnv()) {
    return {
      ok: true,
      savedToSupabase: false,
      message: "Supabase環境変数が未設定のため、画面内だけに登録しました。",
    };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("delivery_destinations").upsert(
    {
      client_id: result.data.clientId,
      code: result.data.code,
      name: result.data.name,
      postal_code: result.data.postalCode,
      address1: result.data.address1,
      address2: result.data.address2,
      address3: result.data.address3,
      tel: result.data.tel,
      aliases: result.data.aliases,
    },
    {
      onConflict: "client_id,code",
    },
  );

  if (error) {
    return {
      ok: false,
      message: `Supabaseへの配送先マスター登録に失敗しました: ${error.message}`,
    };
  }

  revalidatePath("/");

  return {
    ok: true,
    savedToSupabase: true,
    message: "Supabaseの配送先マスターに登録しました。",
  };
}
