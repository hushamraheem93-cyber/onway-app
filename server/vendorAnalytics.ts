export type VendorAnalyticsPeriod = "today" | "week" | "month" | "all";

export type VendorAnalyticsOrder = {
  createdAt: Date | string | number | { toDate?: () => Date };
  status?: string;
};

export type DailyOrderPoint = {
  date: string;
  orders: number;
};

function asDate(value: VendorAnalyticsOrder["createdAt"]): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
  }
  const converted = value instanceof Date ? value : new Date(value as string | number);
  return !Number.isNaN(converted.getTime()) ? converted : null;
}

export function startOfVendorAnalyticsPeriod(
  period: VendorAnalyticsPeriod,
  now: Date,
): Date | null {
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

/**
 * Build a daily order-count series from already vendor-scoped, delivered orders.
 * The caller is responsible for applying the authenticated vendor query; this
 * helper never accepts a vendor id from a client payload and never reads money.
 */
export function aggregateDailyOrderTrend(
  orders: VendorAnalyticsOrder[],
  period: VendorAnalyticsPeriod,
  now = new Date(),
): DailyOrderPoint[] {
  const startDate = startOfVendorAnalyticsPeriod(period, now);
  const daily = new Map<string, number>();

  for (const order of orders) {
    if (order.status && order.status !== "delivered") continue;
    const createdAt = asDate(order.createdAt);
    if (!createdAt || (startDate && createdAt < startDate)) continue;
    const date = createdAt.toISOString().slice(0, 10);
    daily.set(date, (daily.get(date) ?? 0) + 1);
  }

  return [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, orders]) => ({ date, orders }));
}
