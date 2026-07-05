module.exports = {
  expo: {
    name: "Onway",
    slug: "onway",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "tawseeli",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.husham.onway",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "يستخدم التطبيق موقعك لتحديد عنوان التوصيل ومتابعة موقع السائق.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "يحتاج التطبيق إلى موقعك في الخلفية لتتبع التوصيل بدقة.",
        NSPhotoLibraryUsageDescription: "اختر صورة من مكتبتك لتحديث ملفك الشخصي أو إضافة منتج.",
        NSPhotoLibraryAddUsageDescription: "يحتاج التطبيق إلى الإذن لحفظ الصور في مكتبتك.",
        NSCameraUsageDescription: "التقط صورة لملفك الشخصي أو لإضافة منتج جديد.",
        NSUserNotificationUsageDescription: "أرسل لك إشعارات فورية بحالة طلبك وتحديثات التوصيل.",
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#FF8C42",
        foregroundImage: "./assets/images/icon.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.husham.onway",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#FF8C42",
        },
      ],
      "expo-web-browser",
      "expo-secure-store",
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      supportsRTL: true,
      eas: {
        projectId: "31018b2b-d742-4f09-8d17-48d00575216c",
      },
    },
  },
};
