import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";

import { AppColors } from "@/constants/theme";

interface CategoryIconProps {
  uri: string;
  fallbackUri?: string;
  size?: number;
}

/**
 * A fixed-size category picture that never leaves a blank hole when a remote
 * image is stale or unavailable. The transparent image box keeps every card
 * aligned while the fallback icon preserves a useful visual affordance.
 */
export function CategoryIcon({ uri, fallbackUri = "", size = 72 }: CategoryIconProps) {
  const initialUri = uri || fallbackUri;
  const [sourceUri, setSourceUri] = useState(initialUri);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceUri(uri || fallbackUri);
    setFailed(false);
  }, [uri, fallbackUri]);

  if (!sourceUri || failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="image" size={Math.min(30, size * 0.42)} color={AppColors.gray400} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: sourceUri }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="disk"
      transition={200}
      onError={() => {
        if (fallbackUri && fallbackUri !== sourceUri) {
          setSourceUri(fallbackUri);
          return;
        }
        setFailed(true);
      }}
    />
  );
}