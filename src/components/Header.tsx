"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { 
  FileText, 
  ShieldCheck, 
  LogOut, 
  User, 
  Wifi, 
  Cloud, 
  CheckCircle2, 
  Database,
  Menu,
  X,
  Bot,
  Printer
} from "lucide-react";
import { getStoredFirebaseConfig } from "@/lib/firebase";

interface HeaderProps {
  onOpenTelegram?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenTelegram }) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasCloudConfig, setHasCloudConfig] = useState(false);

  useEffect(() => {
    setHasCloudConfig(!!getStoredFirebaseConfig());
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm no-print">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <Link href="/" className="flex items-center space-x-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 flex-shrink-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 text-sm sm:text-base leading-tight tracking-tight truncate">
                MCQ Master
              </span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 flex-shrink-0">
                PRO
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 leading-none mt-0.5 truncate">
              પ્રશ્નપત્ર અને MCQ નિર્માતા
            </p>
          </div>
        </Link>

        {/* Desktop Navigation & Actions */}
        <div className="hidden sm:flex items-center space-x-2.5 flex-shrink-0">
          {/* PDF Studio Button */}
          <Link
            href="/pdf-studio"
            className="h-9 flex items-center space-x-1.5 text-xs font-bold px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm transition-all"
            title="Branded MCQ to PDF Studio"
          >
            <Printer className="w-4 h-4" />
            <span>PDF Studio</span>
          </Link>

          {/* Telegram Bot Quick Trigger */}
          <button
            onClick={onOpenTelegram}
            className="h-9 flex items-center space-x-1.5 text-xs font-bold px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-sm transition-all"
            title="Telegram Bot & Group Mock Test"
          >
            <Bot className="w-4 h-4" />
            <span>Telegram Bot ક્વિઝ</span>
          </button>

          {/* Cloud Sync Status */}
          <div 
            className={`flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full transition-all border ${
              hasCloudConfig 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
            title={hasCloudConfig ? "Cloud Real-time Sync Active" : "Local Real-time Active"}
          >
            {hasCloudConfig ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <Cloud className="w-3.5 h-3.5" />
                <span className="font-medium">Cloud Realtime</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <Database className="w-3.5 h-3.5" />
                <span className="font-medium">Local Realtime</span>
              </>
            )}
          </div>

          {/* User Profile Pill */}
          {user && (
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800 leading-none">{user.name}</div>
                <div className="text-[11px] text-slate-500 font-mono leading-none mt-0.5">{user.phoneNumber}</div>
              </div>
              <button
                onClick={logout}
                title="Logout / Switch User"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Quick Actions (Uniform h-9 touch targets) */}
        <div className="flex sm:hidden items-center gap-1.5 flex-shrink-0">
          <Link
            href="/pdf-studio"
            className="h-9 px-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center gap-1 text-[11px] font-bold"
            title="PDF Studio"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF</span>
          </Link>

          <button
            onClick={onOpenTelegram}
            className="h-9 px-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center gap-1 text-[11px] font-bold"
            title="Telegram Bot"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Bot</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-200 bg-white px-4 py-3.5 space-y-3 shadow-lg animate-fadeIn">
          {user && (
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{user.phoneNumber}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="h-9 flex items-center space-x-1 text-xs text-rose-600 font-bold px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 flex-shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 pt-0.5">
            <Link
              href="/pdf-studio"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full h-11 flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Branded PDF Studio (A4 પ્રશ્નપત્ર)</span>
            </Link>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenTelegram?.();
              }}
              className="w-full h-11 flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold text-xs shadow-sm"
            >
              <Bot className="w-4 h-4" />
              <span>Telegram Bot - ગ્રૂપ ક્વિઝ કોડ બનાવો</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
