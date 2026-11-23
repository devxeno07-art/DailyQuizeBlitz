"use client";

import React, { useState } from "react";
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
  X
} from "lucide-react";
import { getStoredFirebaseConfig } from "@/lib/firebase";

interface HeaderProps {
  onOpenAdmin: () => void;
  onOpenSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenAdmin, onOpenSettings }) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasCloudConfig = !!getStoredFirebaseConfig();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm no-print">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 text-base leading-tight tracking-tight">MCQ Master</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-none mt-0.5">પ્રશ્નપત્ર અને MCQ નિર્માતા</p>
          </div>
        </div>

        {/* Status & Desktop Actions */}
        <div className="hidden sm:flex items-center space-x-3">
          {/* Cloud Sync Status */}
          <div 
            onClick={onOpenSettings}
            className={`flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full cursor-pointer transition-all border ${
              hasCloudConfig 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
            }`}
            title={hasCloudConfig ? "Cloud Real-time Sync Active" : "Local Real-time Active (Click to connect Firebase Cloud)"}
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

          {/* Admin Button */}
          <button
            onClick={onOpenAdmin}
            className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Admin Panel</span>
          </button>

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

        {/* Mobile Hamburger / Quick Actions */}
        <div className="flex sm:hidden items-center space-x-1.5">
          {/* Admin Quick Icon */}
          <button
            onClick={onOpenAdmin}
            className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100"
            title="Admin Panel"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          {/* Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-3 shadow-lg">
          {user && (
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{user.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{user.phoneNumber}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex items-center space-x-1 text-xs text-rose-600 font-semibold px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div 
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSettings?.();
              }}
              className="flex items-center space-x-2 text-xs text-slate-600"
            >
              {hasCloudConfig ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="font-medium text-emerald-800">Cloud Real-time Connected</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="font-medium text-amber-800">Local Real-time Mode</span>
                </>
              )}
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAdmin();
              }}
              className="flex items-center space-x-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Panel</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
