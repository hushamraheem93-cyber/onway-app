import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system/next";
import { Platform } from "react-native";

export type ImageSize = "profile" | "product" | "banner" | "category";

const SIZE_CONFIG: Record<ImageSize, { width: number; height?: number; quality: number }> = {
  profile: { width: 200, height: 200, quality: 0.6 },
  product: { width: 400, quality: 0.7 },
  banner: { width: 800, quality: 0.7 },
  category: { width: 300, quality: 0.7 },
};

export async function compressAndConvertToBase64(
  uri: string,
  imageType: ImageSize = "profile"
): Promise<string> {
  try {
    const config = SIZE_CONFIG[imageType];
    const resizeOptions: { width: number; height?: number } = { width: config.width };
    if (config.height) {
      resizeOptions.height = config.height;
    }

    const manipulated = await manipulateAsync(
      uri,
      [{ resize: resizeOptions }],
      { compress: config.quality, format: SaveFormat.JPEG }
    );

    if (Platform.OS === "web") {
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } else {
      const file = new File(manipulated.uri);
      const base64 = await file.base64();
      return `data:image/jpeg;base64,${base64}`;
    }
  } catch (error) {
    console.error("Error compressing image:", error);
    throw new Error("فشل في معالجة الصورة");
  }
}

export function isBase64Image(str: string | undefined): boolean {
  if (!str) return false;
  return str.startsWith("data:image/");
}
