import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthContextType {
  isLoggedIn: boolean;
  phoneNumber: string | null;
  login: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "@onway_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
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
      }
    } catch (error) {
      console.error("Error loading auth state:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (phone: string) => {
    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ phoneNumber: phone }));
      setPhoneNumber(phone);
      setIsLoggedIn(true);
    } catch (error) {
      console.error("Error saving auth state:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setPhoneNumber(null);
      setIsLoggedIn(false);
    } catch (error) {
      console.error("Error removing auth state:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, phoneNumber, login, logout, isLoading }}>
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
