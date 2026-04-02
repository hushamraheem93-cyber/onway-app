import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface SupportMessage {
  id: string;
  text: string;
  sender: "user" | "admin";
  timestamp: number;
}

const POLL_INTERVAL = 5000;

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg }: { msg: SupportMessage }) {
  const { theme } = useTheme();
  const isUser = msg.sender === "user";
  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAdmin,
      ]}
    >
      {!isUser ? (
        <View style={styles.adminAvatar}>
          <Feather name="headphones" size={14} color="#FFFFFF" />
        </View>
      ) : null}
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: AppColors.primary }
            : { backgroundColor: theme.backgroundDefault, borderWidth: 1, borderColor: theme.border },
        ]}
      >
        <ThemedText
          type="body"
          style={[styles.bubbleText, isUser ? { color: "#FFFFFF" } : { color: theme.text }]}
        >
          {msg.text}
        </ThemedText>
        <ThemedText
          type="small"
          style={[styles.bubbleTime, { color: isUser ? "rgba(255,255,255,0.7)" : theme.textSecondary }]}
        >
          {formatTime(msg.timestamp)}
        </ThemedText>
      </View>
    </View>
  );
}

function EmptyState() {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name="message-circle" size={40} color={AppColors.primary} />
      </View>
      <ThemedText type="h3" style={[styles.emptyTitle, { color: theme.text }]}>
        مرحباً بك في الدعم
      </ThemedText>
      <ThemedText type="body" style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        فريق الدعم متواجد لمساعدتك. اكتب رسالتك وسنرد عليك بأسرع وقت
      </ThemedText>
    </View>
  );
}

export default function SupportChatScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { phoneNumber, userProfile } = useAuth();

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const url = new URL("/api/support/messages", getApiUrl());
      url.searchParams.set("phoneNumber", phoneNumber);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [phoneNumber]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !phoneNumber || sending) return;
    setInputText("");
    setSending(true);

    const optimisticMsg: SupportMessage = {
      id: `opt_${Date.now()}`,
      text,
      sender: "user",
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const url = new URL("/api/support/messages", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          text,
          userName: userProfile?.fullName || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
    finally { setSending(false); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <GradientBackground />
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <GradientBackground />

      <FlatList
        data={messages.length > 0 ? messages.toReversed() : []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        inverted={messages.length > 0}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: headerHeight + Spacing.md, paddingBottom: Spacing.md },
        ]}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.sm,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border },
          ]}
          placeholder="اكتب رسالتك..."
          placeholderTextColor={theme.textSecondary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          textAlign="right"
          testID="input-support-message"
        />
        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor: inputText.trim() ? AppColors.primary : theme.border,
              opacity: sending ? 0.7 : 1,
            },
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
          testID="button-send-support"
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="send" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 4,
    alignItems: "flex-end",
    gap: 8,
  },
  bubbleRowUser: {
    justifyContent: "flex-start",
  },
  bubbleRowAdmin: {
    justifyContent: "flex-end",
  },
  adminAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 2,
    textAlign: "left",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    textAlign: "center",
    lineHeight: 22,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 0,
  },
});
