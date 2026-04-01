import React, { useEffect } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { ThemedText } from "@/components/ThemedText";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ACTIVE_COLOR  = "#E86520";
const INACTIVE_COLOR = "#AAAAAA";
const BAR_BG        = "#FFFFFF";

const CIRCLE_SIZE     = 64;
const CIRCLE_OVERFLOW = 26;           // px the circle pops above the bar top
const BAR_HEIGHT      = 66;           // visible white bar height
const NOTCH_R         = 38;           // horizontal radius of the notch curve
const NOTCH_SPREAD    = 18;           // extra smooth spread before the curve
const NOTCH_DEPTH     = CIRCLE_SIZE - CIRCLE_OVERFLOW + 8; // depth into the bar

const CX = SCREEN_WIDTH / 2;
const BY = CIRCLE_OVERFLOW;           // Y where the bar top starts in SVG

interface TabConfig {
  name: string;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  initialScreen: string;
}

const SIDE_TABS: TabConfig[] = [
  { name: "FavoritesTab", icon: "heart",        label: "المفضلة", initialScreen: "Favorites" },
  { name: "OrdersTab",    icon: "shopping-bag", label: "طلباتي",  initialScreen: "Orders"    },
];

const CENTER_TAB: TabConfig = {
  name: "HomeTab", icon: "home", label: "الرئيسية", initialScreen: "Home",
};

function buildPath(w: number, totalH: number): string {
  const nd = NOTCH_DEPTH;
  const nr = NOTCH_R;
  const sp = NOTCH_SPREAD;
  const by = BY;

  return [
    `M 0 ${by}`,
    `L ${CX - nr - sp} ${by}`,
    `C ${CX - nr} ${by} ${CX - nr} ${by + nd} ${CX} ${by + nd}`,
    `C ${CX + nr} ${by + nd} ${CX + nr} ${by} ${CX + nr + sp} ${by}`,
    `L ${w} ${by}`,
    `L ${w} ${totalH}`,
    `L 0 ${totalH}`,
    `Z`,
  ].join(" ");
}

function SideTab({
  config,
  isFocused,
  onPress,
}: {
  config: TabConfig;
  isFocused: boolean;
  onPress: () => void;
}) {
  const bounce = useSharedValue(1);

  useEffect(() => {
    if (isFocused) {
      bounce.value = withSequence(
        withTiming(1.25, { duration: 130 }),
        withSpring(1, { damping: 10, stiffness: 220 })
      );
    } else {
      bounce.value = withSpring(1, { damping: 12 });
    }
  }, [isFocused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.value }],
  }));

  const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;

  return (
    <Pressable onPress={onPress} style={styles.sideTab} testID={`tab-${config.name}`}>
      <Animated.View style={[styles.sideTabInner, animStyle]}>
        <Feather name={config.icon} size={22} color={color} />
        <ThemedText style={[styles.sideLabel, { color }]}>{config.label}</ThemedText>
      </Animated.View>
    </Pressable>
  );
}

function CenterButton({
  isFocused,
  onPress,
}: {
  isFocused: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isFocused) {
      scale.value = withSequence(
        withTiming(1.15, { duration: 140 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
    }
  }, [isFocused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={styles.centerPressable}
      testID={`tab-${CENTER_TAB.name}`}
    >
      <Animated.View
        style={[
          styles.centerCircle,
          {
            backgroundColor: ACTIVE_COLOR,
            shadowColor: ACTIVE_COLOR,
          },
          animStyle,
        ]}
      >
        <Feather name={CENTER_TAB.icon} size={28} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets      = useSafeAreaInsets();
  const safeBottom  = Math.max(insets.bottom, 0);
  const totalSvgH   = BY + BAR_HEIGHT + safeBottom;

  const navigate = (tabName: string, screen: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const routeIndex = state.routes.findIndex((r) => r.name === tabName);
    if (routeIndex === -1) return;
    const route = state.routes[routeIndex];
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(tabName, { screen });
    }
  };

  const homeIdx   = state.routes.findIndex((r) => r.name === CENTER_TAB.name);
  const homeActive = state.index === homeIdx;

  const favIdx   = state.routes.findIndex((r) => r.name === SIDE_TABS[0].name);
  const favActive = state.index === favIdx;

  const ordIdx   = state.routes.findIndex((r) => r.name === SIDE_TABS[1].name);
  const ordActive = state.index === ordIdx;

  return (
    <View
      style={[
        styles.container,
        { height: totalSvgH, bottom: 0 },
      ]}
      pointerEvents="box-none"
    >
      {/* ── Shadow layer (iOS) ─────────────────────────────── */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
              },
              android: { elevation: 12 },
            }),
          },
        ]}
        pointerEvents="none"
      />

      {/* ── SVG background with notch ──────────────────────── */}
      <Svg
        width={SCREEN_WIDTH}
        height={totalSvgH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Path d={buildPath(SCREEN_WIDTH, totalSvgH)} fill={BAR_BG} />
      </Svg>

      {/* ── Floating center button ──────────────────────────── */}
      <View style={styles.centerWrap}>
        <CenterButton
          isFocused={homeActive}
          onPress={() => navigate(CENTER_TAB.name, CENTER_TAB.initialScreen)}
        />
      </View>

      {/* ── Side tabs row (inside the white bar area) ──────── */}
      <View style={[styles.row, { marginTop: BY, height: BAR_HEIGHT }]}>
        {/* Right side — المفضلة */}
        <SideTab
          config={SIDE_TABS[0]}
          isFocused={favActive}
          onPress={() => navigate(SIDE_TABS[0].name, SIDE_TABS[0].initialScreen)}
        />

        {/* Center placeholder so the side tabs stay on the edges */}
        <View style={{ width: (NOTCH_R + NOTCH_SPREAD) * 2 + 8 }} />

        {/* Left side — طلباتي */}
        <SideTab
          config={SIDE_TABS[1]}
          isFocused={ordActive}
          onPress={() => navigate(SIDE_TABS[1].name, SIDE_TABS[1].initialScreen)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  centerWrap: {
    position: "absolute",
    top: 0,
    left: CX - CIRCLE_SIZE / 2,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    zIndex: 10,
  },
  centerPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  centerCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  sideTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sideTabInner: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  sideLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    includeFontPadding: false,
  },
});
