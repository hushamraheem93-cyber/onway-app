import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { getApiUrl } from "@/lib/query-client";

export type ImageSize = "profile" | "product" | "banner" | "category";

const SIZE_CONFIG: Record<ImageSize, { width: number; height?: number; quality: number }> = {
  profile: { width: 400, height: 400, quality: 0.8 },
  product: { width: 1200, quality: 0.8 },
  banner:  { width: 1200, quality: 0.8 },
  category:{ width: 600,  quality: 0.8 },
};

/**
 * ضغط الصورة وتحويلها إلى WebP base64.
 * تُستخدم لصور الملف الشخصي فقط (تُخزَّن base64 في Firestore).
 */
export async function compressAndConvertToBase64(
  uri: string,
  imageType: ImageSize = "profile"
): Promise<string> {
  try {
    const config = SIZE_CONFIG[imageType];
    const resizeOptions: { width: number; height?: number } = { width: config.width };
    if (config.height) resizeOptions.height = config.height;

    const manipulated = await manipulateAsync(
      uri,
      [{ resize: resizeOptions }],
      { compress: config.quality, format: SaveFormat.WEBP, base64: true }
    );

    if (manipulated.base64) {
      return `data:image/webp;base64,${manipulated.base64}`;
    }

    const response = await fetch(manipulated.uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error("فشل في معالجة الصورة");
  }
}

/**
 * ضغط الصورة وتحويلها إلى WebP ثم رفعها إلى السيرفر.
 * تُعيد رابط URL مثل "/uploads/abc123.webp".
 * تُستخدم لصور المنتجات والبانرات والأقسام.
 */
export async function processAndUploadImage(
  uri: string,
  imageType: ImageSize = "product"
): Promise<string> {
  const config = SIZE_CONFIG[imageType];
  const resizeOptions: { width: number; height?: number } = { width: config.width };
  if (config.height) resizeOptions.height = config.height;

  const manipulated = await manipulateAsync(
    uri,
    [{ resize: resizeOptions }],
    { compress: config.quality, format: SaveFormat.WEBP }
  );

  const formData = new FormData();
  const file = new File(manipulated.uri);
  formData.append("image", file as any);
  formData.append("type", imageType);

  const response = await fetch(`${getApiUrl()}/api/admin/upload-image`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`فشل في رفع الصورة: ${text}`);
  }

  const data = await response.json();
  return data.url as string;
}

export function isBase64Image(str: string | undefined): boolean {
  if (!str) return false;
  return str.startsWith("data:image/");
}
