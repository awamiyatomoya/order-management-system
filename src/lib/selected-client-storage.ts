const STORAGE_KEY = "order-management:selected-client-id";

export function readSelectedClientId() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedClientId(clientId: string) {
  if (typeof window === "undefined" || !clientId) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, clientId);
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function resolveSelectedClientId(
  clients: { id: string }[],
  options?: {
    urlClientId?: string;
    persistedClientId?: string | null;
  },
) {
  const candidates = [options?.urlClientId, options?.persistedClientId].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    if (clients.some((client) => client.id === candidate)) {
      return candidate;
    }
  }

  return clients[0]?.id ?? "";
}
