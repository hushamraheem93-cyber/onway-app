import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface AnimationItem {
  id: string;
  imageUrl: string;
  startX: number;
  startY: number;
}

interface CartAnimationContextType {
  triggerAnimation: (imageUrl: string, startX: number, startY: number) => void;
}

const CartAnimationContext = createContext<CartAnimationContextType | undefined>(undefined);

export function useCartAnimation() {
  const context = useContext(CartAnimationContext);
  if (!context) {
    throw new Error("useCartAnimation must be used within a CartAnimationProvider");
  }
  return context;
}

interface FlyingItemProps {
  item: AnimationItem;
  onComplete: (id: string) => void;
}

function FlyingItem({ item, onComplete }: FlyingItemProps) {
  const translateX = useSharedValue(item.startX);
  const translateY = useSharedValue(item.startY);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const targetX = SCREEN_WIDTH / 2;
  const targetY = 60;

  React.useEffect(() => {
    translateX.value = withTiming(targetX, {
      duration: 600,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
    
    translateY.value = withSequence(
      withTiming(item.startY - 80, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(targetY, { duration: 400, easing: Easing.in(Easing.quad) })
    );

    scale.value = withSequence(
      withSpring(1.3, { damping: 10, stiffness: 200 }),
      withTiming(0.3, { duration: 400 })
    );

    opacity.value = withSequence(
      withTiming(1, { duration: 400 }),
      withTiming(0, { duration: 200 }, () => {
        runOnJS(onComplete)(item.id);
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: translateX.value - 30,
    top: translateY.value - 30,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <View style={styles.flyingItem}>
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.flyingImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>
    </Animated.View>
  );
}

export function CartAnimationProvider({ children }: { children: React.ReactNode }) {
  const [flyingItems, setFlyingItems] = useState<AnimationItem[]>([]);
  const idCounter = useRef(0);

  const triggerAnimation = useCallback((imageUrl: string, startX: number, startY: number) => {
    const id = `flying-${idCounter.current++}`;
    setFlyingItems(prev => [...prev, { id, imageUrl, startX, startY }]);
  }, []);

  const handleComplete = useCallback((id: string) => {
    setFlyingItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return (
    <CartAnimationContext.Provider value={{ triggerAnimation }}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        {flyingItems.map(item => (
          <FlyingItem key={item.id} item={item} onComplete={handleComplete} />
        ))}
      </View>
    </CartAnimationContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    pointerEvents: "none",
  },
  flyingItem: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  flyingImage: {
    width: "100%",
    height: "100%",
  },
});
