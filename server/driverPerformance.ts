export type DriverPerformanceActivity = {
  type?: string;
  timestamp?: unknown;
};

export type DriverPerformanceCompletedOrder = {
  orderId: string;
  completedAt?: unknown;
};

export type DriverPerformanceOrder = {
  id?: string;
  status?: string;
  pickedUpAt?: unknown;
  deliveredAt?: unknown;
  completedAt?: unknown;
};

export type DriverPerformanceDeliveryLog = {
  orderId?: string;
  order_id?: string;
  action?: string;
  createdAt?: unknown;
  created_at?: unknown;
};

export type DriverPerformanceDriver = {
  rating?: number | null;
  ratingCount?: number;
};

export interface DriverPerformanceInput {
  activities: DriverPerformanceActivity[];
  completedOrders: DriverPerformanceCompletedOrder[];
  orders: DriverPerformanceOrder[];
  deliveryLogs?: DriverPerformanceDeliveryLog[];
  driver?: DriverPerformanceDriver | null;
}

export interface DriverPerformanceResult {
  acceptanceRate: number | null;
  acceptedOffers: number;
  rejectedOffers: number;
  totalOffers: number;
  deliveryTimeMinutes: number | null;
  deliveryTimeSampleSize: number;
  rating: number | null;
  ratingCount: number;
  completedOrders: number;
  cancelledOrders: number;
  hasData: boolean;
  availability: {
    acceptanceRate: boolean;
    deliveryTime: boolean;
    rating: boolean;
    completedVsCancelled: boolean;
  };
}

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  try {
    if (typeof value === "object" && value !== null && "toMillis" in value) {
      const millis = (value as { toMillis?: () => number }).toMillis?.();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
    }
    if (value instanceof Date) {
      const millis = value.getTime();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
      const millis = new Date(value).getTime();
      return Number.isFinite(millis) ? millis : null;
    }
  } catch {
    return null;
  }
  return null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildDriverPerformance(
  input: DriverPerformanceInput,
): DriverPerformanceResult {
  const acceptedOffers = input.activities.filter((event) => event.type === "accepted").length;
  const rejectedOffers = input.activities.filter((event) => event.type === "rejected").length;
  const totalOffers = acceptedOffers + rejectedOffers;
  const acceptanceRate = totalOffers > 0
    ? round((acceptedOffers / totalOffers) * 100)
    : null;

  const completedIds = new Set(
    input.completedOrders.map((order) => String(order.orderId)).filter(Boolean),
  );
  const cancelledIds = new Set(
    input.orders
      .filter((order) => order.status === "cancelled" && order.id)
      .map((order) => String(order.id)),
  );

  const orderById = new Map(
    input.orders
      .filter((order) => order.id)
      .map((order) => [String(order.id), order]),
  );
  const deliveryDurations: number[] = [];
  const deliveryLogsByOrder = new Map<string, DriverPerformanceDeliveryLog[]>();
  for (const log of input.deliveryLogs ?? []) {
    const orderId = log.orderId ?? log.order_id;
    if (!orderId) continue;
    const list = deliveryLogsByOrder.get(String(orderId)) ?? [];
    list.push(log);
    deliveryLogsByOrder.set(String(orderId), list);
  }
  for (const completed of input.completedOrders) {
    const order = orderById.get(String(completed.orderId));
    const logs = deliveryLogsByOrder.get(String(completed.orderId)) ?? [];
    const pickupLog = logs
      .filter((log) => log.action === "picked_up" || log.action === "in_delivery")
      .map((log) => toMillis(log.createdAt ?? log.created_at))
      .filter((millis): millis is number => millis !== null)
      .sort((a, b) => a - b)[0];
    const deliveredLog = logs
      .filter((log) => log.action === "delivered")
      .map((log) => toMillis(log.createdAt ?? log.created_at))
      .filter((millis): millis is number => millis !== null)
      .sort((a, b) => b - a)[0];
    const pickup = toMillis(order?.pickedUpAt) ?? pickupLog ?? null;
    const delivered = toMillis(order?.deliveredAt ?? completed.completedAt) ?? deliveredLog ?? null;
    if (pickup === null || delivered === null || delivered < pickup) continue;
    deliveryDurations.push((delivered - pickup) / 60_000);
  }

  const deliveryTimeMinutes = deliveryDurations.length > 0
    ? round(deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length)
    : null;

  const rawRating = input.driver?.rating;
  const ratingCount = Math.max(0, Number(input.driver?.ratingCount) || 0);
  const rating = typeof rawRating === "number" && Number.isFinite(rawRating) && ratingCount > 0
    ? round(rawRating)
    : null;

  const availability = {
    acceptanceRate: acceptanceRate !== null,
    deliveryTime: deliveryTimeMinutes !== null,
    rating: rating !== null,
    completedVsCancelled: completedIds.size > 0 || cancelledIds.size > 0,
  };

  return {
    acceptanceRate,
    acceptedOffers,
    rejectedOffers,
    totalOffers,
    deliveryTimeMinutes,
    deliveryTimeSampleSize: deliveryDurations.length,
    rating,
    ratingCount,
    completedOrders: completedIds.size,
    cancelledOrders: cancelledIds.size,
    hasData: Object.values(availability).some(Boolean),
    availability,
  };
}
