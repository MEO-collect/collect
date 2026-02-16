import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type {
  UserProfile,
  AnalysisResult,
  DiagnosisResult,
  TokenUsage,
  UploadedFile,
} from "@shared/shozai-types";
import { DEFAULT_USER_PROFILE, WIZARD_STEPS } from "@shared/shozai-types";
import { ProfileStep } from "./ProfileStep";
import { UploadStep } from "./UploadStep";
import { AnalysisStep } from "./AnalysisStep";
import { DiagnosisStep } from "./DiagnosisStep";
import { ReportStep } from "./ReportStep";

const LS_PROFILE_KEY = "shozai-doctor-profile";

function loadProfile(): UserProfile {
  try {
    const saved = localStorage.getItem(LS_PROFILE_KEY);
    if (saved) return { ...DEFAULT_USER_PROFILE, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_USER_PROFILE };
}

function saveProfile(profile: UserProfile) {
  localStorage.setItem(LS_PROFILE_KEY, JSON.stringify(profile));
}

// ============ Progress Bar ============
function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full mb-6">
      <div className="flex items-center justify-between mb-2">
        {WIZARD_STEPS.map((step) => (
          <div key={step.id} className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                step.id < currentStep
                  ? "bg-teal-500 text-white shadow-lg shadow-teal-500/30"
                  : step.id === currentStep
                  ? "bg-teal-600 text-white ring-4 ring-teal-200 dark:ring-teal-800 shadow-lg"
                  : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
              }`}
            >
              {step.id < currentStep ? "✓" : step.id}
            </div>
            <span
              className={`text-[10px] mt-1 text-center leading-tight hidden sm:block ${
                step.id === currentStep
                  ? "text-teal-700 dark:text-teal-300 font-semibold"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
      <div className="relative h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${((currentStep - 1) / (WIZARD_STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ============ Fade Wrapper ============
function FadeIn({ children, stepKey }: { children: React.ReactNode; stepKey: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [stepKey]);

  return (
    <div
      className={`transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {children}
    </div>
  );
}

// ============ Main App ============
export default function ShozaiDoctorApp() {
  const [currentStep, setCurrentStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [analysisTokens, setAnalysisTokens] = useState<TokenUsage | null>(null);
  const [diagnosisTokens, setDiagnosisTokens] = useState<TokenUsage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleProfileSubmit = useCallback(
    (p: UserProfile) => {
      setProfile(p);
      saveProfile(p);
      setCurrentStep(2);
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleUploadComplete = useCallback(
    (uploadedFiles: UploadedFile[]) => {
      setFiles(uploadedFiles);
      setCurrentStep(3);
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleAnalysisComplete = useCallback(
    (result: AnalysisResult, tokens: TokenUsage) => {
      setAnalysisResult(result);
      setAnalysisTokens(tokens);
    },
    []
  );

  const handleProceedToDiagnosis = useCallback(() => {
    setCurrentStep(4);
    scrollToTop();
  }, [scrollToTop]);

  const handleDiagnosisComplete = useCallback(
    (result: DiagnosisResult, tokens: TokenUsage) => {
      setDiagnosisResult(result);
      setDiagnosisTokens(tokens);
      setCurrentStep(5);
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleRestart = useCallback(() => {
    setCurrentStep(1);
    setFiles([]);
    setAnalysisResult(null);
    setDiagnosisResult(null);
    setAnalysisTokens(null);
    setDiagnosisTokens(null);
    scrollToTop();
  }, [scrollToTop]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
      scrollToTop();
    }
  }, [currentStep, scrollToTop]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-indigo-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 overflow-y-auto"
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/home">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">🩺</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                商材ドクター
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                AI商材診断
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        <ProgressBar currentStep={currentStep} />

        <FadeIn stepKey={currentStep}>
          {currentStep === 1 && (
            <ProfileStep profile={profile} onSubmit={handleProfileSubmit} />
          )}
          {currentStep === 2 && (
            <UploadStep
              files={files}
              onComplete={handleUploadComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 3 && (
            <AnalysisStep
              files={files}
              profile={profile}
              analysisResult={analysisResult}
              onAnalysisComplete={handleAnalysisComplete}
              onProceed={handleProceedToDiagnosis}
              onBack={handleBack}
            />
          )}
          {currentStep === 4 && (
            <DiagnosisStep
              analysis={analysisResult!}
              profile={profile}
              onDiagnosisComplete={handleDiagnosisComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 5 && diagnosisResult && (
            <ReportStep
              diagnosis={diagnosisResult}
              analysis={analysisResult!}
              analysisTokens={analysisTokens!}
              diagnosisTokens={diagnosisTokens!}
              onRestart={handleRestart}
            />
          )}
        </FadeIn>
      </main>
    </div>
  );
}
