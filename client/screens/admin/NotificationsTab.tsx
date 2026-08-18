/**
 * The admin "الإشعارات" (push notifications) tab (H-65).
 *
 * `renderNotificationsTab` moved verbatim out of AdminScreen. The send itself —
 * `handleSendNotification`, which posts to the broadcast endpoint — stays in
 * AdminScreen with the state it writes; this component only renders the form and
 * calls it. No recipient list, no token handling and no PII is read here.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors } from "@/constants/theme";
import { styles } from "@/screens/admin/adminStyles";

interface NotifForm {
  title: string;
  body: string;
}

interface Props {
  notifForm: NotifForm;
  setNotifForm: React.Dispatch<React.SetStateAction<NotifForm>>;
  handleSendNotification: () => void;
  isSendingNotif: boolean;
  notifError: string | null;
  notifResult: { sent: number; total: number } | null;
  theme: any;
}

function NotificationsTabInner({
  notifForm,
  setNotifForm,
  handleSendNotification,
  isSendingNotif,
  notifError,
  notifResult,
  theme,
}: Props) {
  const renderNotificationsTab = () => (
    <View style={styles.notifContainer}>
      <View style={styles.notifHeader}>
        <Feather name="bell" size={28} color={AppColors.primary} />
        <ThemedText style={styles.notifTitle}>
          إرسال إشعار للمستخدمين
        </ThemedText>
        <ThemedText style={styles.notifSubtitle}>
          سيصل الإشعار لجميع المستخدمين المسجلين حتى خارج التطبيق
        </ThemedText>
      </View>

      <View
        style={[
          styles.notifCard,
          { backgroundColor: theme.backgroundSecondary },
        ]}
      >
        <ThemedText style={styles.notifLabel}>عنوان الإشعار</ThemedText>
        <TextInput
          style={[
            styles.notifInput,
            { color: theme.text, borderColor: theme.backgroundSecondary },
          ]}
          accessibilityLabel="عنوان الإشعار"
          placeholder="مثال: تخفيضات حصرية اليوم!"
          placeholderTextColor={AppColors.gray400}
          value={notifForm.title}
          onChangeText={(v) => setNotifForm((f) => ({ ...f, title: v }))}
          textAlign="right"
        />

        <ThemedText style={[styles.notifLabel, { marginTop: Spacing.md }]}>
          نص الرسالة
        </ThemedText>
        <TextInput
          style={[
            styles.notifInput,
            styles.notifTextArea,
            { color: theme.text, borderColor: theme.backgroundSecondary },
          ]}
          placeholder="اكتب تفاصيل الإشعار هنا..."
          placeholderTextColor={AppColors.gray400}
          value={notifForm.body}
          onChangeText={(v) => setNotifForm((f) => ({ ...f, body: v }))}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          textAlign="right"
        />
      </View>

      {notifResult !== null ? (
        <View style={styles.notifSuccess}>
          <Feather name="check-circle" size={22} color={AppColors.success} />
          <ThemedText style={styles.notifSuccessText}>
            تم الإرسال بنجاح — وصل إلى {notifResult.sent} من {notifResult.total}{" "}
            مستخدم
          </ThemedText>
        </View>
      ) : null}

      {notifError !== null ? (
        <View style={styles.notifErrorBox}>
          <Feather name="alert-circle" size={18} color={AppColors.error} />
          <ThemedText style={styles.notifErrorText}>{notifError}</ThemedText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={[styles.notifSendBtn, isSendingNotif && { opacity: 0.7 }]}
        onPress={handleSendNotification}
        disabled={isSendingNotif}
      >
        {isSendingNotif ? (
          <ActivityIndicator color={AppColors.white} size="small" />
        ) : (
          <Feather name="send" size={18} color={AppColors.white} />
        )}
        <ThemedText style={styles.notifSendBtnText}>
          {isSendingNotif ? "جاري الإرسال..." : "إرسال للجميع"}
        </ThemedText>
      </Pressable>
    </View>
  );

  return renderNotificationsTab();
}

export const NotificationsTab = React.memo(NotificationsTabInner);
