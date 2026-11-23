"use client";

import React, { useState, useEffect } from "react";
import { UserProfile, Paper, FirebaseConfig, SourcePaper } from "@/types";
import { 
  subscribeAllUsers, 
  subscribeAllPapers, 
  getLocalUsers, 
  getLocalPapers,
  getLocalSourcePapers,
  addOrUpdateSourcePaper,
  toggleUserLibraryAccess
} from "@/lib/storage";
import { getStoredFirebaseConfig, initFirebase } from "@/lib/firebase";
import { 
  ShieldCheck, 
  Users, 
  FileText, 
  Layers, 
  Search, 
  Lock, 
  Eye, 
  X, 
  CheckCircle2, 
  Clock, 
  Cloud, 
  Database, 
  Settings, 
  ArrowLeft,
  Download,
  Phone,
  Sparkles,
  FileDown,
  Plus,
  ExternalLink,
  BookOpen
} from "lucide-react";

interface AdminPanelProps {
  isOpen?: boolean;
  standalone?: boolean;
  onClose?: () => void;
  onInspectPaper?: (paper: Paper) => void;
}

const DEFAULT_ADMIN_PIN = "7777";

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen = true,
  standalone = false,
  onClose,
  onInspectPaper,
}) => {
  const [pin, setPin] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "digitization">("users");

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allPapers, setAllPapers] = useState<Paper[]>([]);
  const [sourcePapers, setSourcePapers] = useState<SourcePaper[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Add Source Paper Form Modal
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTarget, setNewSourceTarget] = useState(100);
  const [newSourceExam, setNewSourceExam] = useState("GSRTC સ્પેશિયલ");

  // Cloud Config Modal inside Admin
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [customConfig, setCustomConfig] = useState<Partial<FirebaseConfig>>(() => {
    const stored = getStoredFirebaseConfig();
    return stored || {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };
  });
  const [configSaved, setConfigSaved] = useState(false);

  // Load users, papers, source papers
  useEffect(() => {
    if (!isAuthenticated) return;

    setSourcePapers(getLocalSourcePapers());

    const unsubUsers = subscribeAllUsers((updatedUsers) => {
      setUsers(updatedUsers);
    });

    const unsubPapers = subscribeAllPapers((updatedPapers) => {
      setAllPapers(updatedPapers);
    });

    return () => {
      unsubUsers();
      unsubPapers();
    };
  }, [isAuthenticated]);

  if (!isOpen && !standalone) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === DEFAULT_ADMIN_PIN || pin === "admin") {
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("ખોટો PIN! ડિફોલ્ટ PIN '7777' છે.");
    }
  };

  const totalQuestions = allPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);

  const usersWithCounts = users.map((u) => {
    const userPapers = allPapers.filter((p) => p.userId === u.id);
    const uQuestions = userPapers.reduce((sum, p) => sum + (p.questions?.length || 0), 0);
    return {
      ...u,
      papersCount: userPapers.length,
      questionsCount: uQuestions,
    };
  });

  const filteredUsers = usersWithCounts.filter((u) =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.phoneNumber.includes(userSearch)
  );

  const selectedUserPapers = selectedUser
    ? allPapers.filter((p) => p.userId === selectedUser.id)
    : [];

  const handleCreateSourcePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle || !newSourceUrl) return;

    const newSp: SourcePaper = {
      id: `source_paper_${Date.now()}`,
      title: newSourceTitle.trim(),
      pdfUrl: newSourceUrl.trim(),
      examName: newSourceExam.trim(),
      category: "GSRTC સ્પેશિયલ",
      targetQuestions: Number(newSourceTarget) || 100,
      createdAt: new Date().toISOString(),
    };

    await addOrUpdateSourcePaper(newSp);
    setSourcePapers(getLocalSourcePapers());
    setShowAddSourceModal(false);
    setNewSourceTitle("");
    setNewSourceUrl("");
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("mcq_firebase_custom_config", JSON.stringify(customConfig));
      setConfigSaved(true);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("gu-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const wrapperClass = standalone
    ? "min-h-screen bg-slate-900 p-2 sm:p-6 flex flex-col items-center justify-start"
    : "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn";

  const containerClass = standalone
    ? "w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto min-h-[88vh]"
    : "w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[94vh] flex flex-col";

  return (
    <div className={wrapperClass}>
      <div className={containerClass}>
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-brand-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">એડમિન પેનલ (Admin Control Center)</h3>
              <p className="text-[11px] text-slate-400">
                યુઝર્સ ટ્રેકિંગ અને ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન મોનિટરિંગ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isAuthenticated && (
              <button
                onClick={() => setShowConfigModal(true)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                title="Cloud Database Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
            {standalone ? (
              <a
                href="/"
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-xs font-bold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>મુખ્ય પેજ</span>
              </a>
            ) : (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/20 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Auth Gate if not logged in */}
        {!isAuthenticated ? (
          <div className="p-8 max-w-sm mx-auto text-center space-y-4 my-auto">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-lg">Admin સુરક્ષા પિન</h4>
              <p className="text-xs text-slate-500 mt-1">
                એડમિન કંટ્રોલ સેન્ટર ખોલવા માટે સુરક્ષા PIN દાખલ કરો. (Default: <strong>7777</strong>)
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN (દા.ત. 7777)"
                className="w-full text-center text-xl font-mono tracking-widest px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
              {authError && (
                <div className="text-xs text-rose-600 font-medium">{authError}</div>
              )}
              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md shadow-brand-500/20 transition-all"
              >
                અનલોક કરો (Unlock)
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Admin View */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Live Analytics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-4 rounded-2xl border border-indigo-200/60">
                <div className="flex items-center justify-between text-indigo-700">
                  <span className="text-xs font-bold">કુલ યુઝર્સ</span>
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{users.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">સક્રિય એકાઉન્ટ્સ</div>
              </div>

              <div className="bg-gradient-to-br from-brand-50 to-brand-100/50 p-4 rounded-2xl border border-brand-200/60">
                <div className="flex items-center justify-between text-brand-700">
                  <span className="text-xs font-bold">ડિજિટલ પેપર્સ</span>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{allPapers.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">બનાવેલ પ્રોજેક્ટ્સ</div>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-2xl border border-emerald-200/60">
                <div className="flex items-center justify-between text-emerald-700">
                  <span className="text-xs font-bold">કુલ MCQs</span>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{totalQuestions}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">ડિજિટલ પ્રશ્નો</div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-4 rounded-2xl border border-amber-200/60">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-xs font-bold">ઓલ્ડ PDF પેપર્સ</span>
                  <FileDown className="w-4 h-4" />
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">{sourcePapers.length}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Google Drive સોર્સ</div>
              </div>
            </div>

            {/* Admin Tabs */}
            <div className="flex border-b border-slate-200 space-x-4">
              <button
                onClick={() => setActiveTab("users")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 ${
                  activeTab === "users"
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>યુઝર્સ અને પ્રોજેક્ટ્સ (Users & Papers)</span>
              </button>

              <button
                onClick={() => setActiveTab("digitization")}
                className={`pb-2.5 text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-colors border-b-2 ${
                  activeTab === "digitization"
                    ? "border-orange-600 text-orange-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <FileDown className="w-4 h-4" />
                <span>ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન ટ્રેકર ({sourcePapers.length})</span>
              </button>
            </div>

            {/* TAB 1: USERS & PAPERS */}
            {activeTab === "users" && (
              <>
                {selectedUser ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedUser(null)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base">
                            {selectedUser.name} ના પેપર્સ ({selectedUserPapers.length})
                          </h4>
                          <p className="text-xs text-slate-500 font-mono">
                            મોબાઈલ: {selectedUser.phoneNumber}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedUser(null)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        તમામ યુઝર્સ જુઓ
                      </button>
                    </div>

                    {selectedUserPapers.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        આ યુઝરે હજુ સુધી કોઈ પેપર બનાવ્યું નથી.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedUserPapers.map((paper) => (
                          <div
                            key={paper.id}
                            className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-brand-400 transition-all space-y-2"
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                {paper.category || "General"}
                              </span>
                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(paper.updatedAt)}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-900 text-sm">{paper.title}</h5>
                            <p className="text-xs text-slate-500">વિષય: {paper.subject || "-"}</p>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                              <span className="font-bold text-indigo-700">
                                {paper.questions?.length || 0} પ્રશ્નો
                              </span>
                              <button
                                onClick={() => {
                                  onInspectPaper?.(paper);
                                  onClose?.();
                                }}
                                className="px-3 py-1 rounded-lg bg-brand-600 text-white font-bold text-xs hover:bg-brand-700"
                              >
                                પેપર ખોલો
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                        <Users className="w-4 h-4 text-brand-600" />
                        <span>તમામ યુઝર્સનું લિસ્ટ (Registered Users)</span>
                      </h4>

                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="નામ કે નંબરથી શોધો..."
                          className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    {filteredUsers.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        કોઈ યુઝર મળ્યો નથી.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredUsers.map((u) => (
                          <div
                            key={u.id}
                            className="p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                                <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{u.phoneNumber}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto text-xs flex-wrap">
                              <div className="text-left sm:text-right mr-1">
                                <div className="font-bold text-indigo-700">
                                  {u.papersCount || 0} પેપર્સ • {u.questionsCount || 0} પ્રશ્નો
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  છેલ્લે સક્રિય: {formatDate(u.lastActive)}
                                </div>
                              </div>

                              {/* Toggle Library Access */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await toggleUserLibraryAccess(u.id);
                                  setUsers((prev) =>
                                    prev.map((user) =>
                                      user.id === u.id ? { ...user, hasLibraryAccess: !user.hasLibraryAccess } : user
                                    )
                                  );
                                }}
                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all ${
                                  u.hasLibraryAccess
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200"
                                }`}
                                title={
                                  u.hasLibraryAccess
                                    ? "ઓરિજિનલ પેપર્સ લાઇબ્રેરી મંજૂર છે (ક્લિક કરી રદ કરો)"
                                    : "ઓરિજિનલ પેપર્સ લાઇબ્રેરી એક્સેસ આપો"
                                }
                              >
                                {u.hasLibraryAccess ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>લાઇબ્રેરી મંજૂર (Active)</span>
                                  </>
                                ) : (
                                  <>
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    <span>લાઇબ્રેરી આપો (Grant)</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => setSelectedUser(u)}
                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-indigo-700 font-bold text-xs shadow-sm flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>પેપર્સ જુઓ</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: DIGITIZATION MISSION TRACKER */}
            {activeTab === "digitization" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-base">
                      ઓલ્ડ પેપર્સ ડિજિટાઇઝેશન પ્રોગ્રેસ
                    </h4>
                    <p className="text-xs text-slate-500">
                      કયા ઓલ્ડ પેપર પર કેટલા પ્રશ્નો ડિજિટલ રૂપમાં સેવ થયા છે તેનું લાઈવ સ્ટેટસ
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddSourceModal(true)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ નવી PDF લિંક ઉમેરો</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sourcePapers.map((sp) => {
                    const linked = allPapers.filter((p) => p.sourcePaperId === sp.id);
                    const totalDigitized = linked.reduce(
                      (max, p) => Math.max(max, p.questions?.length || 0),
                      0
                    );
                    const percent = Math.min(100, Math.round((totalDigitized / sp.targetQuestions) * 100));

                    return (
                      <div
                        key={sp.id}
                        className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <h5 className="font-bold text-slate-900 text-sm">{sp.title}</h5>
                          <a
                            href={sp.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
                          >
                            <span>PDF</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* Progress */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-600">
                              ડિજિટલ પ્રશ્નો: {totalDigitized} / {sp.targetQuestions}
                            </span>
                            <span className="font-bold text-orange-600">{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-orange-500 h-full rounded-full"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Contributors list */}
                        <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                          {linked.length > 0 ? (
                            <div className="space-y-1">
                              <span className="font-bold text-slate-700">ડિજિટાઇઝ કરી રહેલા યુઝર્સ:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {linked.map((lp) => (
                                  <span
                                    key={lp.id}
                                    onClick={() => {
                                      onInspectPaper?.(lp);
                                      onClose?.();
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-slate-800 cursor-pointer hover:border-brand-500 text-[10px] font-medium"
                                  >
                                    {lp.userName} ({lp.questions?.length || 0} MCQs)
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-amber-700">હજુ સુધી કોઈએ આ પેપર લખવાનું શરૂ નથી કર્યું.</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Add New Source Paper Google Drive Link */}
        {showAddSourceModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h4 className="font-bold text-slate-900 text-sm">નવું ઓલ્ડ પેપર (Google Drive Link) ઉમેરો</h4>
                <button
                  onClick={() => setShowAddSourceModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSourcePaper} className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">પેપરનું શીર્ષક / નામ *</label>
                  <input
                    type="text"
                    value={newSourceTitle}
                    onChange={(e) => setNewSourceTitle(e.target.value)}
                    placeholder="દા.ત. GSRTC Conductor Exam 2021"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Google Drive PDF લિંક *</label>
                  <input
                    type="url"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">કુલ પ્રશ્નો</label>
                    <input
                      type="number"
                      value={newSourceTarget}
                      onChange={(e) => setNewSourceTarget(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-0.5">પરીક્ષા કેટેગરી</label>
                    <input
                      type="text"
                      value={newSourceExam}
                      onChange={(e) => setNewSourceExam(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSourceModal(false)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    રદ કરો
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700"
                  >
                    લિંક સેવ કરો
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cloud Config Modal */}
        {showConfigModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-brand-600" />
                  <h4 className="font-bold text-slate-900 text-sm">Firebase Cloud સેટિંગ્સ</h4>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Vercel પર ફ્રી હોસ્ટિંગ માટે તમે Firebase Console માંથી ક્રેડેન્શિયલ અહીં પેસ્ટ કરી શકો છો.
              </p>

              <form onSubmit={handleSaveFirebaseConfig} className="space-y-2.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Project ID *</label>
                  <input
                    type="text"
                    value={customConfig.projectId || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, projectId: e.target.value })}
                    placeholder="my-mcq-project"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">API Key *</label>
                  <input
                    type="text"
                    value={customConfig.apiKey || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">Auth Domain</label>
                  <input
                    type="text"
                    value={customConfig.authDomain || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, authDomain: e.target.value })}
                    placeholder="my-mcq-project.firebaseapp.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-0.5">App ID</label>
                  <input
                    type="text"
                    value={customConfig.appId || ""}
                    onChange={(e) => setCustomConfig({ ...customConfig, appId: e.target.value })}
                    placeholder="1:123456789:web:abcdef..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                {configSaved && (
                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                    સેટિંગ્સ સેવ થઈ ગઈ! પેજ રીલોડ થઈ રહ્યું છે...
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                  >
                    બંધ કરો
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-700"
                  >
                    સેવ કરો અને કનેક્ટ કરો
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
