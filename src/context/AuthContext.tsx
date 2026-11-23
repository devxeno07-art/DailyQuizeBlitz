"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UserProfile, Paper } from "@/types";
import { 
  getCurrentUser, 
  setCurrentUser, 
  loginOrRegister, 
  subscribeUserPapers,
  getLocalUsers
} from "@/lib/storage";

interface AuthContextType {
  user: UserProfile | null;
  papers: Paper[];
  isMounted: boolean;
  login: (phone: string, name: string) => Promise<UserProfile>;
  logout: () => void;
  checkExistingUser: (phone: string) => UserProfile | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  // Initialize from storage only after client mount to prevent SSR hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    try {
      const savedUser = getCurrentUser();
      if (savedUser) {
        setUser(savedUser);
      }
    } catch (e) {
      console.warn("Auth initialization error", e);
    }
  }, []);

  // Listen to user papers in real-time
  useEffect(() => {
    if (!user) {
      setPapers([]);
      return;
    }

    const unsubscribe = subscribeUserPapers(user.id, (updatedPapers) => {
      setPapers(updatedPapers);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const checkExistingUser = (phone: string): UserProfile | null => {
    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (!cleanPhone) return null;
    const users = getLocalUsers();
    return users.find(u => u.id === cleanPhone) || null;
  };

  const login = async (phoneNumber: string, name: string): Promise<UserProfile> => {
    const loggedUser = await loginOrRegister(phoneNumber, name);
    setUser(loggedUser);
    return loggedUser;
  };

  const logout = () => {
    setCurrentUser(null);
    setUser(null);
    setPapers([]);
  };

  return (
    <AuthContext.Provider value={{ user, papers, isMounted, login, logout, checkExistingUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
