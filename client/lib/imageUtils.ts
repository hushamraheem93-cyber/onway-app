import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system/next";
import { Platform } from "react-native";

const MAX_IMAGE_SIZE = 200;
const COMPRESSION_QUALITY = 0.6;

export async function compressAndConvertToBase64(uri: string): Promise<string> {
  try {
    const manipulated = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE } }],
      { compress: COMPRESSION_QUALITY, format: SaveFormat.JPEG }
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
