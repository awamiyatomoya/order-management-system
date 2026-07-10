import { parseOfficialStoreChainName } from "@/lib/official-chain-store-masters";
import {
  applyOfficialChainStoreSync,
  previewOfficialChainStoreSync,
} from "@/lib/supabase/store-location-actions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const chainName = parseOfficialStoreChainName(new URL(request.url).searchParams.get("chain"));

  if (!chainName) {
    return Response.json({ ok: false, message: "チェーン名が不正です。" }, { status: 400 });
  }

  const preview = await previewOfficialChainStoreSync(chainName);

  return Response.json(preview, {
    status: preview.ok ? 200 : 500,
  });
}

export async function POST(request: Request) {
  let body: { chain?: string } = {};

  try {
    body = (await request.json()) as { chain?: string };
  } catch {
    body = {};
  }

  const chainName = parseOfficialStoreChainName(body.chain ?? null);

  if (!chainName) {
    return Response.json({ ok: false, message: "チェーン名が不正です。" }, { status: 400 });
  }

  const result = await applyOfficialChainStoreSync(chainName);

  return Response.json(result, {
    status: result.ok ? 200 : 500,
  });
}
