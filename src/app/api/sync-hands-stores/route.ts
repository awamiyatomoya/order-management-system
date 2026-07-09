import { ensureHandsStoreLocationsFromOfficialSite } from "@/lib/supabase/store-location-actions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await ensureHandsStoreLocationsFromOfficialSite();

  return Response.json(result, {
    status: result.ok ? 200 : 500,
  });
}
