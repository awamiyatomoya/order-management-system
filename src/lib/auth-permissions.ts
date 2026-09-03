export const AUTH_FEATURES = [
  { id: "orders", label: "受注" },
  { id: "payouts", label: "振り込み" },
  { id: "clients", label: "クライアント" },
  { id: "products", label: "商品" },
  { id: "deliveryDestinations", label: "配送先" },
  { id: "stores", label: "店舗" },
  { id: "storeIntroductions", label: "導入店舗" },
  { id: "sellIn", label: "セルイン" },
  { id: "sellOut", label: "セルアウト" },
  { id: "orderFiles", label: "発注書" },
  { id: "history", label: "処理履歴" },
  { id: "users", label: "ユーザー" },
] as const;

export const AUTH_PERMISSION_LEVELS = [
  { id: "view", label: "見る" },
  { id: "create", label: "追加" },
  { id: "edit", label: "編集" },
  { id: "delete", label: "削除" },
] as const;

export const AUTH_PERMISSION_CHOICES = [
  { id: "none", label: "なし" },
  ...AUTH_PERMISSION_LEVELS,
] as const;

export type AuthFeatureId = (typeof AUTH_FEATURES)[number]["id"];
export type AuthPermissionAction = (typeof AUTH_PERMISSION_LEVELS)[number]["id"];
export type AuthPermissionLevel = "none" | AuthPermissionAction;
export type AuthPermissions = Record<AuthFeatureId, AuthPermissionLevel>;

const FEATURE_IDS = new Set<string>(AUTH_FEATURES.map((feature) => feature.id));
const LEVEL_RANK: Record<AuthPermissionLevel, number> = {
  none: 0,
  view: 1,
  create: 2,
  edit: 3,
  delete: 4,
};

const FEATURE_PATHS: { feature: AuthFeatureId; path: string }[] = [
  { feature: "orders", path: "/" },
  { feature: "payouts", path: "/payouts" },
  { feature: "clients", path: "/clients" },
  { feature: "products", path: "/products" },
  { feature: "deliveryDestinations", path: "/delivery-destinations" },
  { feature: "stores", path: "/stores" },
  { feature: "storeIntroductions", path: "/store-introductions" },
  { feature: "sellIn", path: "/sell-in" },
  { feature: "sellOut", path: "/sell-out" },
  { feature: "orderFiles", path: "/order-files" },
  { feature: "history", path: "/history" },
  { feature: "users", path: "/users" },
];

export const AUTH_PERMISSION_DENIED_MESSAGE = "権限がありません。";

export function createFullAuthPermissions(): AuthPermissions {
  return Object.fromEntries(AUTH_FEATURES.map((feature) => [feature.id, "delete"])) as AuthPermissions;
}

export function createMemberAuthPermissions(): AuthPermissions {
  return {
    ...(Object.fromEntries(AUTH_FEATURES.map((feature) => [feature.id, "view"])) as AuthPermissions),
    users: "none",
  };
}

export function isAuthFeatureId(value: string): value is AuthFeatureId {
  return FEATURE_IDS.has(value);
}

export function isAuthPermissionLevel(value: unknown): value is AuthPermissionLevel {
  return value === "none" || value === "view" || value === "create" || value === "edit" || value === "delete";
}

export function resolveAuthPermissions(
  raw: unknown,
  options?: { isAdmin?: boolean },
): AuthPermissions {
  if (options?.isAdmin) {
    return createFullAuthPermissions();
  }

  const defaults = createMemberAuthPermissions();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const source = raw as Record<string, unknown>;
  const next = { ...defaults };

  for (const feature of AUTH_FEATURES) {
    const value = source[feature.id];
    if (isAuthPermissionLevel(value)) {
      next[feature.id] = value;
    }
  }

  return next;
}

export function canUseFeature(
  permissions: AuthPermissions,
  feature: AuthFeatureId,
  action: AuthPermissionAction,
) {
  return LEVEL_RANK[permissions[feature]] >= LEVEL_RANK[action];
}

export function toggleAuthPermissionLevel(
  current: AuthPermissionLevel,
  clicked: AuthPermissionAction,
): AuthPermissionLevel {
  return current === clicked ? "none" : clicked;
}

export function firstAllowedPath(permissions: AuthPermissions) {
  for (const item of FEATURE_PATHS) {
    if (canUseFeature(permissions, item.feature, "view")) {
      return item.path;
    }
  }

  return null;
}

export function workbenchScopeToFeature(scope: string): AuthFeatureId {
  if (scope === "sellOutFiles") {
    return "sellOut";
  }

  if (isAuthFeatureId(scope)) {
    return scope;
  }

  return "orders";
}
