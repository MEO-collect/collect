import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  PenTool,
  Settings,
  FileText,
  History,
  Sparkles,
} from "lucide-react";
import type {
  StoreProfile,
  Templates,
  HistoryEntry,
  GeneratedContent,
} from "@shared/bizwriter-types";
import {
  DEFAULT_STORE_PROFILE,
  DEFAULT_TEMPLATES,
} from "@shared/bizwriter-types";
import ProfileScreen from "./ProfileScreen";
import GeneratorScreen from "./GeneratorScreen";
import TemplateScreen from "./TemplateScreen";
import HistoryScreen from "./HistoryScreen";
import ResultView from "./ResultView";

type TabId = "generate" | "profile" | "template" | "history";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "generate", label: "生成", icon: <Sparkles className="h-5 w-5" /> },
  { id: "profile", label: "設定", icon: <Settings className="h-5 w-5" /> },
  { id: "template", label: "定型文", icon: <FileText className="h-5 w-5" /> },
  { id: "history", label: "履歴", icon: <History className="h-5 w-5" /> },
];

// LocalStorage keys
const LS_PROFILE = "bizwriter-profile";
const LS_TEMPLATES = "bizwriter-templates";
const LS_HISTORY = "bizwriter-history";

function loadFromLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default function BizWriterApp() {
  const [activeTab, setActiveTab] = useState<TabId>("generate");
  const [profile, setProfile] = useState<StoreProfile>(() =>
    loadFromLS(LS_PROFILE, DEFAULT_STORE_PROFILE)
  );
  const [templates, setTemplates] = useState<Templates>(() =>
    loadFromLS(LS_TEMPLATES, DEFAULT_TEMPLATES)
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    loadFromLS(LS_HISTORY, [])
  );
  const [latestResults, setLatestResults] = useState<GeneratedContent[] | null>(
    null
  );

  // Persist to LocalStorage
  useEffect(() => {
    localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(LS_TEMPLATES, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
  }, [history]);

  const handleGenerated = useCallback(
    (topic: string, results: GeneratedContent[]) => {
      setLatestResults(results);
      const entry: HistoryEntry = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        topic,
        results,
      };
      setHistory((prev) => [entry, ...prev].slice(0, 100));
    },
    []
  );

  const handleDeleteHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden flex flex-col">
      {/* 装飾 */}
      <div
        className="floating-orb w-72 h-72 bg-violet-400/10 top-[-5%] right-[-5%]"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="floating-orb w-56 h-56 bg-pink-400/10 bottom-[10%] left-[-5%]"
        style={{ animationDelay: "3s" }}
      />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-4xl mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="glass-button h-9 w-9 rounded-xl"
              onClick={() => (window.location.href = "/home")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <PenTool className="h-5 w-5 text-primary" />
              <span className="font-semibold text-base">AI文章作成</span>
            </div>
          </div>

          {/* PC用ヘッダーナビ */}
          <nav className="hidden md:flex items-center gap-1">
            {TABS.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "ghost"}
                size="sm"
                className={`gap-2 rounded-xl ${
                  activeTab === tab.id
                    ? "btn-gradient text-white border-0"
                    : "glass-button"
                }`}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== "generate") setLatestResults(null);
                }}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 pb-24 md:pb-6 relative z-10">
        {activeTab === "generate" && (
          <>
            {latestResults ? (
              <ResultView
                results={latestResults}
                onBack={() => setLatestResults(null)}
              />
            ) : (
              <GeneratorScreen
                profile={profile}
                templates={templates}
                history={history}
                onGenerated={handleGenerated}
              />
            )}
          </>
        )}
        {activeTab === "profile" && (
          <ProfileScreen profile={profile} onUpdate={setProfile} />
        )}
        {activeTab === "template" && (
          <TemplateScreen templates={templates} onUpdate={setTemplates} />
        )}
        {activeTab === "history" && (
          <HistoryScreen
            history={history}
            onDelete={handleDeleteHistory}
            onClear={handleClearHistory}
            onViewResult={(results) => {
              setLatestResults(results);
              setActiveTab("generate");
            }}
          />
        )}
      </main>

      {/* SP用ボトムナビ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-header border-t border-border/30">
        <div className="flex items-center justify-around h-16">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== "generate") setLatestResults(null);
              }}
            >
              {tab.icon}
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
