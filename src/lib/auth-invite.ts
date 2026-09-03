export type AuthInviteParams = {
  code?: string;
  tokenHash?: string;
  type?: string;
};

export function extractAuthInviteParams(search: string, hash = ""): AuthInviteParams | null {
  const fromSearch = readAuthInviteParams(search);
  if (fromSearch) {
    return fromSearch;
  }

  const fromHash = readAuthInviteParams(hash.replace(/^#/, ""));
  if (fromHash) {
    return fromHash;
  }

  const next = new URLSearchParams(stripLeadingSearch(search)).get("next");
  if (!next) {
    return null;
  }

  const queryIndex = next.indexOf("?");
  if (queryIndex === -1) {
    return null;
  }

  return extractAuthInviteParams(next.slice(queryIndex));
}

export function buildAuthCallbackSearch(params: AuthInviteParams) {
  const search = new URLSearchParams();
  if (params.code) {
    search.set("code", params.code);
  }
  if (params.tokenHash) {
    search.set("token_hash", params.tokenHash);
  }
  if (params.type) {
    search.set("type", params.type);
  }
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function hasInviteAccessTokens(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return Boolean(params.get("access_token") && params.get("refresh_token"));
}

function readAuthInviteParams(value: string): AuthInviteParams | null {
  const params = new URLSearchParams(stripLeadingSearch(value));
  const code = params.get("code") ?? "";
  const tokenHash = params.get("token_hash") ?? "";
  const type = params.get("type") ?? "";

  if (code) {
    return type ? { code, type } : { code };
  }

  if (tokenHash && type) {
    return { tokenHash, type };
  }

  return null;
}

function stripLeadingSearch(value: string) {
  return value.startsWith("?") ? value.slice(1) : value;
}
