"use server";

import type { StoreLocationRecord } from "@/lib/store-location-groups";
import { inferStoreLocationChainName } from "@/lib/store-location-groups";
import { createServerSupabaseClient, hasSupabaseServerEnv } from "./server";

export async function readStoreLocationRecords(): Promise<StoreLocationRecord[]> {
  if (!hasSupabaseServerEnv()) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const withChain = await supabase
    .from("store_locations")
    .select("store_code, store_name, postal_code, address, tel, chain_name")
    .order("store_name");

  let rows = withChain.data;

  if (withChain.error) {
    const withoutChain = await supabase
      .from("store_locations")
      .select("store_code, store_name, postal_code, address, tel")
      .order("store_name");

    if (withoutChain.error) {
      return [];
    }

    rows = (withoutChain.data ?? []).map((row) => ({
      ...row,
      chain_name: "",
    }));
  }

  return (rows ?? []).map((row) => {
    const location = {
      storeCode: row.store_code,
      storeName: row.store_name,
      postalCode: row.postal_code,
      address: row.address,
      tel: row.tel,
      chainName: row.chain_name ?? "",
    };

    return {
      ...location,
      chainName: location.chainName || inferStoreLocationChainName(location),
    };
  });
}
