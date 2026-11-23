"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Phone, User, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen }) => {
  const { login, checkExistingUser } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [name, setName] = useState("");
  const [isExisting, setIsExisting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const clean = raw.replace(/\D/g, "").slice(0, 10);
    setPhoneNumber(clean);
    setError("");

    if (clean.length === 10) {
      const existing = checkExistingUser(clean);
      if (existing) {
        setName(existing.name);
        setIsExisting(true);
      } else {
        setIsExisting(false);
      }
    } else {
      setIsExisting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length < 10) {
      setError("કૃપા કરીને 10 અંકનો મોબાઈલ નંબર દાખલ કરો.");
      return;
    }
    if (!name.trim()) {
      setError("કૃપા કરીને તમારું પૂરું નામ દાખલ કરો.");
      return;
    }

    try {
      setLoading(true);
      await login(phoneNumber, name);
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoPhone: string, demoName: string) => {
    setPhoneNumber(demoPhone);
    setName(demoName);
    login(demoPhone, demoName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 transform transition-all">
        {/* Header with decorative background */}
        <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-md border border-white/20 shadow-inner">
            <Sparkles className="w-7 h-7 text-amber-300" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">MCQ Master માં સ્વાગત છે</h2>
          <p className="text-xs text-indigo-100 mt-1">
            કોઈ પાસવર્ડ નહીં! માત્ર તમારો મોબાઈલ નંબર અને નામ નાખો અને તમારા પ્રશ્નપત્રો મેળવો.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="text-xs font-semibold p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
              {error}
            </div>
          )}

          {isExisting && (
            <div className="flex items-center space-x-2 text-xs font-medium p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>વેલકમ બેક! તમારા બનાવેલા પેપર લોડ થઈ જશે.</span>
            </div>
          )}

          {/* Mobile Number Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              મોબાઈલ નંબર (Mobile Number) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
                <span className="text-xs font-bold ml-1.5 text-slate-600">+91</span>
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="9876543210"
                className="w-full pl-16 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-sm tracking-wider text-slate-900 bg-slate-50/50"
                maxLength={10}
                required
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              આ જ નંબરથી લોગિન કરવાથી તમારા બધા પેપર હંમેશા સુરક્ષિત રહેશે.
            </p>
          </div>

          {/* Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              તમારું પૂરું નામ (Your Full Name) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="દા.ત. રમેશભાઈ પટેલ / Rahul Sharma"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm text-slate-900 bg-slate-50/50"
                required
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-brand-500/25 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.98] disabled:opacity-70"
          >
            <span>{loading ? "લોગિન થઈ રહ્યું છે..." : "ડેશબોર્ડમાં પ્રવેશ કરો"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Quick Demo Login Pills for instant review */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400 uppercase font-semibold">અથવા ડેમો એકાઉન્ટથી ટ્રાય કરો</span>
            <div className="flex gap-2 mt-2 justify-center">
              <button
                type="button"
                onClick={() => handleQuickDemo("9898012345", "GSRTC ઉમેદવાર")}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              >
                🚌 GSRTC ઉમેદવાર
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo("9988776655", "પરીક્ષક સર (Admin)")}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
              >
                👨‍🏫 શિક્ષક / પરીક્ષક
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
