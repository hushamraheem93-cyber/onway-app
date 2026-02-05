interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
  channelId?: string;
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
};

export async function sendPushNotification(
  pushToken: string,
  status: string,
  orderId: string
): Promise<boolean> {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.log("Invalid push token:", pushToken);
    return false;
  }

  const messageContent = ORDER_STATUS_MESSAGES[status];
  if (!messageContent) {
    console.log("No message template for status:", status);
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    title: messageContent.title,
    body: messageContent.body,
    sound: "default",
    channelId: "default",
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
      console.log("Push notification sent successfully to:", pushToken);
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
