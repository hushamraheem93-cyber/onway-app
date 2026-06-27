interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
  badge?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const ORDER_STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "تم تأكيد الطلب",
    body: "تم استلام طلبك وسيتم تحضيره قريباً",
  },
  preparing: {
    title: "جاري تحضير الطلب",
    body: "طلبك الآن قيد التحضير في المتجر",
  },
  delivering: {
    title: "الطلب في الطريق",
    body: "تم استلام الطلب من قبل المندوب وهو في طريقه إليك",
  },
  delivered: {
    title: "تم التوصيل بنجاح",
    body: "تم توصيل طلبك بنجاح. شكراً لتسوقك معنا!",
  },
  cancelled: {
    title: "تم إلغاء الطلب",
    body: "نأسف لإعلامك أنه تم إلغاء طلبك",
  },
  issue: {
    title: "السائق يحاول التواصل معك",
    body: "يرجى الرد على مكالمة السائق أو التحقق من عنوانك",
  },
};

export async function sendPushNotification(
  pushToken: string,
  status: string,
  orderId: string,
  estimatedMinutes?: number
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    return false;
  }

  const messageContent = ORDER_STATUS_MESSAGES[status];
  if (!messageContent) {
    return false;
  }

  let body = messageContent.body;
  if (status === "confirmed" && estimatedMinutes && estimatedMinutes > 0) {
    body = `تم استلام طلبك وسيتم تحضيره خلال ${estimatedMinutes} دقيقة تقريباً`;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    title: messageContent.title,
    body,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 86400,
    data: { orderId, status },
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = (await response.json()) as { data: ExpoPushTicket };
    
    if (result.data.status === "ok") {
      return true;
    } else {
      console.error("Push notification error:", result.data.message);
      return false;
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}

export function getStatusMessage(status: string): { title: string; body: string } | null {
  return ORDER_STATUS_MESSAGES[status] || null;
}

export async function sendDriverBatchNotification(
  pushToken: string,
  totalOrders: number,
  batchId: string,
  badge?: number
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const message: ExpoPushMessage = {
    to: pushToken,
    title: `دفعة جديدة - ${totalOrders} ${totalOrders === 1 ? "طلب" : "طلبات"}`,
    body: "لديك دفعة توصيل جديدة. اضغط لعرض التفاصيل وقبول الطلبات",
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 300,
    badge,
    data: { type: "new_batch", batchId },
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Driver batch notification sent → ${pushToken.slice(-10)}`);
      return true;
    }
    console.error("[PUSH] Driver batch notification error:", result.data.message);
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending driver batch notification:", error);
    return false;
  }
}

export async function sendAdminNewOrderNotification(
  pushToken: string,
  orderId: string,
  region: string,
  total: number
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const message: ExpoPushMessage = {
    to: pushToken,
    title: "طلب جديد",
    body: `طلب من ${region} - المبلغ: ${total.toLocaleString()} د.ع`,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 86400,
    data: { type: "new_order", orderId },
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Admin new-order notification sent`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending admin notification:", error);
    return false;
  }
}

export async function sendVendorStatusNotification(
  pushToken: string,
  status: "active" | "rejected" | "suspended",
  storeName: string,
  reason?: string,
  unreadCount?: number
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;

  const messages: Record<string, { title: string; body: string }> = {
    active: {
      title: "تمت الموافقة على متجرك",
      body: `تمت الموافقة على متجرك "${storeName}" — يمكنك الآن إضافة منتجاتك`,
    },
    rejected: {
      title: "تم رفض طلبك",
      body: `تم رفض طلب متجرك "${storeName}". السبب: ${reason || "غير محدد"}`,
    },
    suspended: {
      title: "تم تعليق حسابك",
      body: `تم تعليق متجرك "${storeName}". تواصل مع الإدارة.`,
    },
  };

  const content = messages[status];
  if (!content) return false;

  const message: ExpoPushMessage = {
    to: pushToken,
    title: content.title,
    body: content.body,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 86400,
    badge: unreadCount,
    data: { type: "vendor_status", status, storeName, unreadCount },
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Vendor status notification sent (${status}) → ${pushToken.slice(-10)}`);
      return true;
    }
    console.error("[PUSH] Vendor status notification error:", result.data.message);
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending vendor status notification:", error);
    return false;
  }
}

export async function sendVendorProductNotification(
  pushToken: string,
  event: "approved" | "rejected",
  productName: string,
  reason?: string,
  unreadCount?: number
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;

  const content =
    event === "approved"
      ? {
          title: "تمت الموافقة على منتجك",
          body: `منتج "${productName}" تمت الموافقة عليه وهو متاح للعملاء الآن`,
        }
      : {
          title: "تم رفض منتجك",
          body: `منتج "${productName}" تم رفضه. السبب: ${reason || "غير محدد"}`,
        };

  const message: ExpoPushMessage = {
    to: pushToken,
    title: content.title,
    body: content.body,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 86400,
    badge: unreadCount,
    data: { type: "vendor_product", event, productName, unreadCount },
  };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Vendor product ${event} notification sent → ${pushToken.slice(-10)}`);
      return true;
    }
    console.error(`[PUSH] Vendor product ${event} notification error:`, result.data.message);
    return false;
  } catch (error) {
    console.error(`[PUSH] Error sending vendor product ${event} notification:`, error);
    return false;
  }
}

export async function sendBroadcastNotification(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  if (!tokens.length) return { sent: 0, failed: 0 };

  const CHUNK_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    const messages: ExpoPushMessage[] = chunk.map((token) => ({
      to: token,
      title,
      body,
      sound: "default",
      channelId: "default",
      data: data || {},
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json() as { data: ExpoPushTicket[] };
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      
      tickets.forEach((ticket) => {
        if (ticket.status === "ok") sent++;
        else failed++;
      });
    } catch (error) {
      console.error("Error sending broadcast chunk:", error);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

// ── Vendor: new order arrived ────────────────────────────────────────────────
export async function sendVendorNewOrderNotification(
  pushToken: string,
  orderId: string,
  itemsCount: number,
  total: number,
  customerName?: string
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const shortId = orderId.slice(-6).toUpperCase();
  const message: ExpoPushMessage = {
    to: pushToken,
    title: "طلب جديد وصلك",
    body: `${itemsCount} صنف · ${total.toLocaleString("ar-IQ")} د.ع${customerName ? ` · ${customerName}` : ""}`,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 300,
    data: { type: "vendor_new_order", orderId, shortId },
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Vendor new-order #${shortId} → token ...${pushToken.slice(-8)}`);
      return true;
    }
    console.error("[PUSH] Vendor new-order error:", result.data.message);
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending vendor new-order notification:", error);
    return false;
  }
}

// ── Admin: order ready for driver pickup ─────────────────────────────────────
export async function sendAdminOrderReadyNotification(
  pushToken: string,
  orderId: string,
  vendorName: string
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const shortId = orderId.slice(-6).toUpperCase();
  const message: ExpoPushMessage = {
    to: pushToken,
    title: "الطلب جاهز للاستلام",
    body: `متجر ${vendorName} · رقم #${shortId} · عيّن سائقاً الآن`,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 300,
    data: { type: "order_ready_for_driver", orderId, shortId, vendorName },
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const result = (await response.json()) as { data: ExpoPushTicket };
    if (result.data.status === "ok") {
      console.log(`[PUSH] Admin order-ready #${shortId} from ${vendorName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending admin order-ready notification:", error);
    return false;
  }
}
