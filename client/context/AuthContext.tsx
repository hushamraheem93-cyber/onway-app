import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { compressAndConvertToBase64 } from "@/lib/imageUtils";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

export type UserType = "customer" | "driver" | "vendor";

export interface UserProfile {
  id?: string;
  phoneNumber: string;
  fullName: string;
  gender: "male" | "female";
  region: string;
  address: string;
  profileImage?: string;
  profileComplete: boolean;
  userType?: UserType;
}

export interface VendorProfile {
  id: string;
  storeName: string;
  businessType: string;
  phoneNumber: string;
  ownerName: string;
  address?: string;
  status: "pending" | "active" | "suspended" | "rejected";
  totalProducts?: number;
  createdAt: string;
}

interface AuthContextType {
  isLoggedIn: boolean;
  phoneNumber: string | null;
  pendingPhone: string | null;
  userProfile: UserProfile | null;
  isProfileComplete: boolean;
  isOtpSent: boolean;
  isOtpVerified: boolean;
  selectedUserType: UserType | null;
  isDriverRegistered: boolean;
  hasSeenSplash: boolean;
  // Vendor
  vendorProfile: VendorProfile | null;
  vendorToken: string | null;
  isVendorRegistered: boolean;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  setUserType: (type: UserType) => void;
  login: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
  saveProfile: (profile: Omit<UserProfile, "phoneNumber" | "profileComplete">, imageUri?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeDriverRegistration: () => Promise<void>;
  completeVendorRegistration: (vendor: VendorProfile, token: string) => Promise<void>;
  refreshVendorProfile: () => Promise<void>;
  goBackToUserType: () => void;
  goBackToPhoneLogin: () => void;
  goBackToOtp: () => void;
  markSplashSeen: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "@onway_auth";
const PROFILE_STORAGE_KEY = "@onway_profile";
const VENDOR_TOKEN_KEY = "@onway_vendor_token";
const VENDOR_PROFILE_KEY = "@onway_vendor_profile";

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    let token: string;
    if (projectId) {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } else {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF7A00",
        sound: "default",
      });
    }

    return token;
  } catch (error) {
    return null;
  }
}

async function savePushTokenToServer(phone: string, token: string): Promise<void> {
  try {
    await fetch(new URL("/api/users/push-token", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, pushToken: token }),
    });
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<UserType | null>(null);
  const [isDriverRegistered, setIsDriverRegistered] = useState(false);
  const [hasSeenSplash, setHasSeenSplash] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Vendor
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [vendorToken, setVendorToken] = useState<string | null>(null);
  const [isVendorRegistered, setIsVendorRegistered] = useState(false);

  useEffect(() => {
    loadAuthState();
  }, []);

  useEffect(() => {
    if (isLoggedIn && phoneNumber) {
      registerForPushNotificationsAsync().then((token) => {
        if (token) savePushTokenToServer(phoneNumber, token);
      });
    }
  }, [isLoggedIn, phoneNumber]);

  const loadAuthState = async () => {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        setPhoneNumber(data.phoneNumber);
        setIsLoggedIn(true);
        setIsOtpSent(true);
        setIsOtpVerified(true);
        setSelectedUserType(data.userType || "customer");
        setIsDriverRegistered(data.isDriverRegistered || false);

        if (data.userType === "vendor") {
          // Load vendor token + profile
          const vToken = await AsyncStorage.getItem(VENDOR_TOKEN_KEY);
          const vProfile = await AsyncStorage.getItem(VENDOR_PROFILE_KEY);
          if (vToken) setVendorToken(vToken);
          if (vProfile) {
            const parsed = JSON.parse(vProfile) as VendorProfile;
            setVendorProfile(parsed);
            setIsVendorRegistered(true);
          }
        } else {
          const profileStored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
          if (profileStored) {
            const profile = JSON.parse(profileStored);
            setUserProfile(profile);
            setIsProfileComplete(profile.profileComplete || false);
          } else {
            await checkProfileFromServer(data.phoneNumber);
          }
        }
      }
    } catch (error) {
      console.error("Error loading auth state:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkProfileFromServer = async (phone: string) => {
    try {
      const response = await fetch(new URL(`/api/users/${encodeURIComponent(phone)}`, getApiUrl()).toString());
      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        setIsProfileComplete(profile.profileComplete || false);
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      } else {
        setIsProfileComplete(false);
      }
    } catch {
      setIsProfileComplete(false);
    }
  };

  const sendOtp = async (phone: string) => {
    try {
      const response = await fetch(new URL("/api/auth/send-otp", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "فشل في إرسال رمز التحقق");
      }

      setPendingPhone(phone);
      setIsOtpSent(true);
    } catch (error: any) {
      throw error;
    }
  };

  const verifyOtp = async (code: string) => {
    if (!pendingPhone) throw new Error("No pending phone");

    try {
      const response = await fetch(new URL("/api/auth/verify-otp", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pendingPhone, code }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "رمز التحقق غير صحيح");
      }

      setPhoneNumber(pendingPhone);
      setIsOtpVerified(true);
    } catch (error: any) {
      throw error;
    }
  };

  const checkExistingDriver = async (phone: string): Promise<boolean> => {
    try {
      const response = await fetch(new URL(`/api/drivers/check/${encodeURIComponent(phone)}`, getApiUrl()).toString());
      if (response.ok) {
        const data = await response.json();
        return data.exists && !!data.driver;
      }
      return false;
    } catch {
      return false;
    }
  };

  const checkExistingVendor = async (phone: string): Promise<{ vendor: VendorProfile | null; token: string | null }> => {
    try {
      const response = await fetch(new URL("/api/vendor/mobile-auth", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      if (response.ok) {
        const data = await response.json();
        return { vendor: data.vendor || null, token: data.token || null };
      }
      return { vendor: null, token: null };
    } catch {
      return { vendor: null, token: null };
    }
  };

  const setUserType = async (type: UserType) => {
    setSelectedUserType(type);

    if (type === "customer") {
      await loginAfterTypeSelect(type);
    } else if (type === "driver" && phoneNumber) {
      const existingDriver = await checkExistingDriver(phoneNumber);
      if (existingDriver) {
        setIsDriverRegistered(true);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber, userType: "driver", isDriverRegistered: true }));
        setIsLoggedIn(true);
        await checkProfileFromServer(phoneNumber);
      }
    } else if (type === "vendor" && phoneNumber) {
      const { vendor, token } = await checkExistingVendor(phoneNumber);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber, userType: "vendor" }));
      setIsLoggedIn(true);
      if (vendor && token) {
        setVendorProfile(vendor);
        setVendorToken(token);
        setIsVendorRegistered(true);
        await AsyncStorage.setItem(VENDOR_TOKEN_KEY, token);
        await AsyncStorage.setItem(VENDOR_PROFILE_KEY, JSON.stringify(vendor));
      }
    }
  };

  const loginAfterTypeSelect = async (type: UserType) => {
    if (!phoneNumber) return;
    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber, userType: type, isDriverRegistered: false }));
      setIsLoggedIn(true);
      await checkProfileFromServer(phoneNumber);
    } catch (error) {
      throw error;
    }
  };

  const completeVendorRegistration = async (vendor: VendorProfile, token: string) => {
    setVendorProfile(vendor);
    setVendorToken(token);
    setIsVendorRegistered(true);
    await AsyncStorage.setItem(VENDOR_TOKEN_KEY, token);
    await AsyncStorage.setItem(VENDOR_PROFILE_KEY, JSON.stringify(vendor));
  };

  const refreshVendorProfile = async () => {
    if (!vendorToken) return;
    try {
      const response = await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (response.ok) {
        const updated = await response.json();
        setVendorProfile(updated);
        await AsyncStorage.setItem(VENDOR_PROFILE_KEY, JSON.stringify(updated));
      }
    } catch {}
  };

  const goBackToUserType = () => {
    setSelectedUserType(null);
    setIsDriverRegistered(false);
    setIsVendorRegistered(false);
  };

  const markSplashSeen = () => {
    setHasSeenSplash(true);
  };

  const goBackToPhoneLogin = () => {
    setHasSeenSplash(true);
    setIsOtpSent(false);
    setIsOtpVerified(false);
    setPendingPhone(null);
    setSelectedUserType(null);
  };

  const goBackToOtp = () => {
    setIsOtpVerified(false);
    setSelectedUserType(null);
  };

  const completeDriverRegistration = async () => {
    if (!phoneNumber) return;
    try {
      setIsDriverRegistered(true);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber, userType: "driver", isDriverRegistered: true }));
      setIsLoggedIn(true);
      await checkProfileFromServer(phoneNumber);
    } catch (error) {
      throw error;
    }
  };

  const login = async (phone: string) => {
    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber: phone }));
      setPhoneNumber(phone);
      setIsLoggedIn(true);
      await checkProfileFromServer(phone);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
      await AsyncStorage.removeItem(VENDOR_TOKEN_KEY);
      await AsyncStorage.removeItem(VENDOR_PROFILE_KEY);
      setPhoneNumber(null);
      setPendingPhone(null);
      setUserProfile(null);
      setIsProfileComplete(false);
      setIsLoggedIn(false);
      setIsOtpSent(false);
      setIsOtpVerified(false);
      setSelectedUserType(null);
      setIsDriverRegistered(false);
      setHasSeenSplash(false);
      setVendorProfile(null);
      setVendorToken(null);
      setIsVendorRegistered(false);
    } catch (error) {
      throw error;
    }
  };

  const saveProfile = async (profile: Omit<UserProfile, "phoneNumber" | "profileComplete">, imageUri?: string) => {
    if (!phoneNumber) throw new Error("No phone number");

    try {
      let profileImageBase64: string | undefined;
      if (imageUri) {
        profileImageBase64 = await compressAndConvertToBase64(imageUri);
      }

      const body = {
        phoneNumber,
        fullName: profile.fullName,
        gender: profile.gender,
        region: profile.region,
        address: profile.address,
        ...(profileImageBase64 && { profileImage: profileImageBase64 }),
      };

      const response = await fetch(new URL("/api/users", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to save profile");
      }

      const savedProfile = await response.json();
      setUserProfile(savedProfile);
      setIsProfileComplete(true);
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(savedProfile));
    } catch (error) {
      throw error;
    }
  };

  const refreshProfile = async () => {
    if (phoneNumber) {
      await checkProfileFromServer(phoneNumber);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        phoneNumber,
        pendingPhone,
        userProfile,
        isProfileComplete,
        isOtpSent,
        isOtpVerified,
        selectedUserType,
        isDriverRegistered,
        hasSeenSplash,
        vendorProfile,
        vendorToken,
        isVendorRegistered,
        sendOtp,
        verifyOtp,
        setUserType,
        login,
        logout,
        saveProfile,
        refreshProfile,
        completeDriverRegistration,
        completeVendorRegistration,
        refreshVendorProfile,
        goBackToUserType,
        goBackToPhoneLogin,
        goBackToOtp,
        markSplashSeen,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
