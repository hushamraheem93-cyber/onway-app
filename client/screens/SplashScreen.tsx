import React, { useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

const deliveryRiderImage = require("../assets/images/delivery-rider.png");

type RootStackParamList = {
  PhoneLogin: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SplashScreen() {
  const navigation = useNavigation<NavigationProp>();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonAnim = useRef(new Animated.Value(0)).current;
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.stagger(150, [
          Animated.timing(dot1Anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const floatTranslate = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -12],
  });

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#F4B942", "#F5A623", "#F4B942"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />
        <View style={styles.decorCircle3} />

        <Animated.View style={[styles.titleContainer, { opacity: fadeAnim }]}>
          <ThemedText style={styles.titleOn}>On</ThemedText>
          <ThemedText style={styles.titleWay}>Way</ThemedText>
        </Animated.View>
        <Animated.View style={[styles.subtitleRow, { opacity: fadeAnim }]}>
          <Feather name="truck" size={16} color="rgba(255,255,255,0.8)" />
          <ThemedText style={styles.subtitle}>توصيل سريع وموثوق</ThemedText>
        </Animated.View>

        <Animated.View
          style={[
            styles.imageContainer,
            {
              opacity: fadeAnim,
              transform: [
                { scale: scaleAnim },
                { translateY: floatTranslate },
              ],
            },
          ]}
        >
          <View style={styles.imageGlow} />
          <Image
            source={deliveryRiderImage}
            style={styles.deliveryImage}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.dotsContainer,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.dot,
              styles.activeDot,
              { opacity: dot1Anim, transform: [{ scale: dot1Anim }] },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { opacity: dot2Anim, transform: [{ scale: dot2Anim }] },
            ]}
          />
          <Animated.View
            style={[
              styles.dot,
              { opacity: dot3Anim, transform: [{ scale: dot3Anim }] },
            ]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.taglineContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <ThemedText style={styles.tagline}>احصل على طلبك</ThemedText>
          <ThemedText style={styles.taglineBold}>
            في أي مكان، في أي وقت
          </ThemedText>
        </Animated.View>

        <Animated.View
          style={[
            styles.buttonWrapper,
            {
              opacity: buttonAnim,
              transform: [
                {
                  translateY: buttonAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed ? { transform: [{ scale: 0.97 }] } : undefined,
            ]}
            onPress={() => navigation.navigate("PhoneLogin")}
            testID="button-get-started"
          >
            <LinearGradient
              colors={["#FF6B6B", "#FF8E8E"]}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Feather
                name="arrow-left"
                size={22}
                color="#FFFFFF"
                style={styles.buttonIcon}
              />
              <ThemedText style={styles.buttonText}>ابدأ الآن</ThemedText>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4B942",
  },
  gradient: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: 120,
    left: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  decorCircle3: {
    position: "absolute",
    top: height * 0.3,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Platform.OS === "web" ? 40 : 30,
  },
  titleOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 42,
    color: "#FFFFFF",
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.15)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  titleWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 42,
    color: "#2C3E50",
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.1)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
    letterSpacing: 0.5,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    maxHeight: height * 0.38,
    marginTop: 10,
  },
  imageGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  deliveryImage: {
    width: width * 0.65,
    height: width * 0.65,
    maxWidth: 300,
    maxHeight: 300,
  },
  dotsContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  activeDot: {
    width: 28,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  taglineContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 22,
    color: "#2C3E50",
    textAlign: "center",
  },
  taglineBold: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    color: "#2C3E50",
    textAlign: "center",
  },
  buttonWrapper: {
    width: "100%",
    paddingHorizontal: 0,
    marginBottom: 30,
  },
  button: {
    width: width - 40,
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#FF6B6B",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  buttonIcon: {
    marginTop: 2,
  },
  buttonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
  },
});
