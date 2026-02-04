import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import * as FileSystem from "expo-file-system";

export interface UserProfile {
  id?: string;
  phoneNumber: string;
  fullName: string;
  gender: "male" | "female";
  region: string;
  address: string;
  profileImage?: string;
  profileComplete: boolean;
}

interface AuthContextType {
  isLoggedIn: boolean;
  phoneNumber: string | null;
  userProfile: UserProfile | null;
  isProfileComplete: boolean;
  login: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
  saveProfile: (profile: Omit<UserProfile, "phoneNumber" | "profileComplete">, imageUri?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "@onway_auth";
const PROFILE_STORAGE_KEY = "@onway_profile";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuthState();
  }, []);

  const loadAuthState = async () => {
    try {
      const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        setPhoneNumber(data.phoneNumber);
        setIsLoggedIn(true);
        
        const profileStored = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (profileStored) {
          const profile = JSON.parse(profileStored);
          setUserProfile(profile);
          setIsProfileComplete(profile.profileComplete || false);
        } else {
          await checkProfileFromServer(data.phoneNumber);
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
    } catch (error) {
      console.error("Error checking profile:", error);
      setIsProfileComplete(false);
    }
  };

  const login = async (phone: string) => {
    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber: phone }));
      setPhoneNumber(phone);
      setIsLoggedIn(true);
      await checkProfileFromServer(phone);
    } catch (error) {
      console.error("Error saving auth state:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem(PROFILE_STORAGE_KEY);
      setPhoneNumber(null);
      setUserProfile(null);
      setIsProfileComplete(false);
      setIsLoggedIn(false);
    } catch (error) {
      console.error("Error removing auth state:", error);
      throw error;
    }
  };

  const saveProfile = async (profile: Omit<UserProfile, "phoneNumber" | "profileComplete">, imageUri?: string) => {
    if (!phoneNumber) throw new Error("No phone number");

    try {
      const formData = new FormData();
      formData.append("phoneNumber", phoneNumber);
      formData.append("fullName", profile.fullName);
      formData.append("gender", profile.gender);
      formData.append("region", profile.region);
      formData.append("address", profile.address);

      if (imageUri) {
        if (Platform.OS === "web") {
          const response = await fetch(imageUri);
          const blob = await response.blob();
          const fileName = `profile-${Date.now()}.jpg`;
          formData.append("profileImage", blob, fileName);
        } else {
          const file = new FileSystem.File(imageUri);
          formData.append("profileImage", file);
        }
      }

      const response = await fetch(new URL("/api/users", getApiUrl()).toString(), {
        method: "POST",
        body: formData,
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
      console.error("Error saving profile:", error);
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
        userProfile,
        isProfileComplete,
        login, 
        logout, 
        saveProfile,
        refreshProfile,
        isLoading 
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
