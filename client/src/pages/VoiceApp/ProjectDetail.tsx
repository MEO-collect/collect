import { useAuth } from "@/_core/hooks/useAuth";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Check,
  Clipboard, 
  Download, 
  Edit3, 
  Eye,
  FileText, 
  Loader2, 
  Mic, 
  Pause,
  Play,
  RefreshCw,
  Square,
  Users,
  Coins,
  AlertTriangle,
  Camera,
  FileDown
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { downloadAsPng, downloadAsPdf } from "@/lib/exportDocument";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { 
  getProject, 
  updateProject, 
  Project,
  calculateTokenCost,
  getTotalTokens
} from "@/lib/projectStorage";
import { saveAudio, getAudio, saveTranscriptionProgress, getTranscriptionProgress, clearTranscriptionProgress, type TranscriptionProgress } from "@/lib/indexedDB";
import { useAudioRecorder, formatDuration } from "@/hooks/useAudioRecorder";
import { Streamdown } from "streamdown";
import { splitAudioBlob, blobToBase64, needsSplitting } from "@/lib/audioSplitter";
import { KARTE_FORMATS, DEFAULT_KARTE_FORMAT_ID } from "../../../../shared/karteFormats";

// フロントエンドでチャンク数を推定（バックエンドと同じ8000文字単位）
const CHUNK_SIZE = 8000;
function estimateChunkCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHUNK_SIZE));
}

function getSpeakerColor(speakerName: string): string {
  const colors = [
    "speaker-color-1",
    "speaker-color-2",
    "speaker-color-3",
    "speaker-color-4",
    "speaker-color-5",
  ];
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getSpeakerIconColor(speakerName: string): string {
  const colors = [
    "speaker-icon-1",
    "speaker-icon-2",
    "speaker-icon-3",
    "speaker-icon-4",
    "speaker-icon-5",
  ];
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getSpeakerNumber(speakerName: string): number {
  // 話者名から番号を抽出（例: "話者1" -> 1, "Speaker 2" -> 2）
  const match = speakerName.match(/(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }
  // 番号がない場合はハッシュで決定
  let hash = 0;
  for (let i = 0; i < speakerName.length; i++) {
    hash = speakerName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (Math.abs(hash) % 5) + 1;
}

interface TranscriptionSegment {
  speaker: string;
  text: string;
}

function parseTranscription(text: string): TranscriptionSegment[] {
  const lines = text.split("\n");
  const segments: TranscriptionSegment[] = [];
  const speakerRegex = /^\[([^\]]+)\]:\s*(.*)$/;

  let currentSpeaker = "";
  let currentText = "";

  for (const line of lines) {
    const match = line.match(speakerRegex);
    if (match) {
      if (currentSpeaker && currentText) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
      }
      currentSpeaker = match[1];
      currentText = match[2];
    } else if (currentSpeaker) {
      currentText += "\n" + line;
    }
  }

  if (currentSpeaker && currentText) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  return segments;
}

function extractSpeakers(text: string): string[] {
  const speakerRegex = /\[([^\]]+)\]:/g;
  const speakers = new Set<string>();
  let match;
  while ((match = speakerRegex.exec(text)) !== null) {
    speakers.add(match[1]);
  }
  return Array.from(speakers);
}

export default function ProjectDetail() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { isLoading: subLoading } = useSubscriptionGuard();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [savedAudioUrl, setSavedAudioUrl] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTranscription, setEditedTranscription] = useState("");
  const [speakerCount, setSpeakerCount] = useState<string>("auto");
  const [showSpeakerRenameDialog, setShowSpeakerRenameDialog] = useState(false);
  const [speakerRenames, setSpeakerRenames] = useState<Record<string, string>>({});
  const [minutesTemplate, setMinutesTemplate] = useState<"business" | "medical" | "weekly">("business");
  const [minutesMetadata, setMinutesMetadata] = useState({
    meetingName: "",
    date: "",
    participants: "",
    location: "",
  });
  const [kartePatientInfo, setKartePatientInfo] = useState({
    patientId: "",
    patientName: "",
    age: "",
    gender: "",
  });
  const [karteFormatId, setKarteFormatId] = useState(DEFAULT_KARTE_FORMAT_ID);

  // 進捗表示用 state
  const [processingProgress, setProcessingProgress] = useState<string | null>(null);

  // チャンク書き起こし再開確認ダイアログ用 state
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [pendingProgress, setPendingProgress] = useState<TranscriptionProgress | null>(null);

  // エラー報告用 state
  const [errorReportInfo, setErrorReportInfo] = useState<{
    operation: string;
    errorMessage: string;
    context?: string;
  } | null>(null);
  const [errorUserComment, setErrorUserComment] = useState("");
  const [autoSaved, setAutoSaved] = useState(false);
  const reportMutation = trpc.report.submit.useMutation();
  const minutesRef = useRef<HTMLDivElement>(null);
  const karteRef = useRef<HTMLDivElement>(null);

  const handleExportMinutes = useCallback(async (type: "png" | "pdf") => {
    if (!minutesRef.current) return;
    const name = `${project?.name || "議事録"}_議事録`;
    try {
      if (type === "png") {
        await downloadAsPng(minutesRef.current, name);
        toast.success("議事録をPNGで保存しました");
      } else {
        await downloadAsPdf(minutesRef.current, name);
        toast.success("印刷ダイアログが開きました。「PDFとして保存」を選択してください。", { duration: 5000 });
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("保存に失敗しました。コピー機能をお使いください。");
    }
  }, [project?.name]);

  const handleExportKarte = useCallback(async (type: "png" | "pdf") => {
    if (!karteRef.current) return;
    const name = `${project?.name || "カルテ"}_カルテ`;
    try {
      if (type === "png") {
        await downloadAsPng(karteRef.current, name);
        toast.success("カルテをPNGで保存しました");
      } else {
        await downloadAsPdf(karteRef.current, name);
        toast.success("印刷ダイアログが開きました。「PDFとして保存」を選択してください。", { duration: 5000 });
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("保存に失敗しました。コピー機能をお使いください。");
    }
  }, [project?.name]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    error: recordingError,
  } = useAudioRecorder();

  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const transcribeChunkMutation = trpc.voice.transcribeChunk.useMutation();
  const summarizeMutation = trpc.voice.summarize.useMutation();
  const minutesMutation = trpc.voice.generateMinutes.useMutation();
  const karteMutation = trpc.voice.generateKarte.useMutation();

  useEffect(() => {
    if (projectId) {
      const p = getProject(projectId);
      if (p) {
        setProject(p);
        setEditedTranscription(p.transcription || "");
        setSpeakerCount(p.speakerCount?.toString() || "auto");
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && project?.status !== "created") {
      getAudio(projectId).then((blob) => {
        if (blob) {
          setSavedAudioUrl(URL.createObjectURL(blob));
        }
      });
    }
  }, [projectId, project?.status]);

  // ページ読み込み時に中断した書き起こし進捗がないか確認
  useEffect(() => {
    if (!projectId) return;
    // 書き起こし未完了のプロジェクトのみチェック
    if (project?.transcription) return;
    getTranscriptionProgress(projectId).then((saved) => {
      if (saved && saved.completedChunks.length > 0) {
        setPendingProgress(saved);
        setResumeDialogOpen(true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (audioBlob && projectId) {
      saveAudio(projectId, audioBlob).then(() => {
        const updated = updateProject(projectId, {
          status: "recorded",
          recordingDuration: duration,
        });
        if (updated) setProject(updated);
      });
    }
  }, [audioBlob, projectId, duration]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    return () => {
      if (savedAudioUrl) {
        URL.revokeObjectURL(savedAudioUrl);
      }
    };
  }, [savedAudioUrl]);

  // エラー発生時に即座にDBに自動保存し、ダイアログを開く
  const openErrorReport = useCallback(async (operation: string, errorMessage: string, context?: string) => {
    setErrorReportInfo({ operation, errorMessage, context });
    setErrorUserComment("");
    setAutoSaved(false);
    // エラー発生時点で自動的にDBに保存
    try {
      await reportMutation.mutateAsync({
        appName: "voice",
        operation,
        errorMessage,
        context,
        userComment: undefined,
      });
      setAutoSaved(true);
    } catch {
      // 自動保存失敗は無視（ユーザーが手動で報告できる）
    }
  }, [reportMutation]);

  // エラーをDBに自動保存（ダイアログを開かずにバックグラウンドで保存）
  const autoSaveError = useCallback(async (operation: string, errorMessage: string, context?: string) => {
    try {
      await reportMutation.mutateAsync({
        appName: "voice",
        operation,
        errorMessage,
        context,
        userComment: undefined,
      });
      console.log(`[ErrorReport] Auto-saved error: ${operation}`);
    } catch (saveErr) {
      console.error("[ErrorReport] Failed to auto-save error:", saveErr);
    }
  }, [reportMutation]);

  // エラー報告にコメントを追記して再送信
  const handleSubmitErrorReport = async () => {
    if (!errorReportInfo) return;
    try {
      await reportMutation.mutateAsync({
        appName: "voice",
        operation: errorReportInfo.operation,
        errorMessage: errorReportInfo.errorMessage,
        context: errorReportInfo.context,
        userComment: errorUserComment || undefined,
      });
      toast.success("コメントを追記しました。ご協力ありがとうございます。");
      setErrorReportInfo(null);
    } catch {
      toast.error("送信に失敗しました");
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob && !savedAudioUrl) {
      toast.error("録音データがありません");
      return;
    }

    try {
      setProcessingProgress("音声データを読み込み中...");
      let blob = audioBlob;
      if (!blob && savedAudioUrl) {
        const response = await fetch(savedAudioUrl);
        blob = await response.blob();
      }
      if (!blob) return;

      const fileSizeMB = blob.size / (1024 * 1024);
      const speakerCountNum = speakerCount === "auto" ? null : parseInt(speakerCount);

      // ─── 15MB超の場合は自動分割して逐次書き起こし ───
      if (needsSplitting(blob)) {
        setProcessingProgress(`音声が大きいため自動分割します... (${fileSizeMB.toFixed(1)}MB)`);

        // 音声を分割
        const chunks = await splitAudioBlob(
          blob,
          12 * 1024 * 1024, // 12MB/チャンク
          600,              // 最大10分/チャンク
          (progress, message) => {
            setProcessingProgress(message);
          },
        );

        const totalChunks = chunks.length;

        // ─ 再開時: 既存の進捗を読み込む ─
        const existingProgress = await getTranscriptionProgress(projectId!);
        const completedChunks: TranscriptionProgress["completedChunks"] =
          existingProgress?.totalChunks === totalChunks
            ? existingProgress.completedChunks
            : [];

        let totalInputTokens = completedChunks.reduce((s, c) => s + c.inputTokens, 0);
        let totalOutputTokens = completedChunks.reduce((s, c) => s + c.outputTokens, 0);

        // 既完了チャンクのインデックスセット
        const completedIndexes = new Set(completedChunks.map((c) => c.index));
        const resumedFrom = completedChunks.length;

        if (resumedFrom > 0) {
          toast.info(`チャンク${resumedFrom + 1}から再開します`);
        }

        for (const chunk of chunks) {
          // 既完了チャンクはスキップ
          if (completedIndexes.has(chunk.index)) {
            setProcessingProgress(
              `チャンク${chunk.index + 1}/${totalChunks}は完了済み—スキップ`,
            );
            continue;
          }

          setProcessingProgress(
            `書き起こし中... (チャンク${chunk.index + 1}/${totalChunks} | ${Math.floor(chunk.startSec / 60)}分〜${Math.floor(chunk.endSec / 60)}分)`,
          );

          const audioBase64 = await blobToBase64(chunk.blob);

          // 前のチャンクの末尾200文字をコンテキストとして渡す
          const prevCompleted = completedChunks
            .filter((c) => c.index < chunk.index)
            .sort((a, b) => a.index - b.index);
          const previousContext =
            prevCompleted.length > 0
              ? prevCompleted[prevCompleted.length - 1].transcription.slice(-200)
              : undefined;

          const result = await transcribeChunkMutation.mutateAsync({
            audioBase64,
            mimeType: "audio/wav",
            speakerCount: speakerCountNum,
            chunkIndex: chunk.index,
            totalChunks,
            previousContext,
          });

          // チャンク結果を追加
          completedChunks.push({
            index: chunk.index,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            transcription: result.transcription,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
          });
          totalInputTokens += result.tokenUsage.input;
          totalOutputTokens += result.tokenUsage.output;

          // チャンク完了ごとにIndexedDBに保存
          await saveTranscriptionProgress({
            id: projectId!,
            completedChunks: [...completedChunks],
            totalChunks,
            speakerCount: speakerCountNum,
            savedAt: Date.now(),
          });
        }

        setProcessingProgress("書き起こし結果を統合中...");

        // index順にソートして結合
        const sortedChunks = [...completedChunks].sort((a, b) => a.index - b.index);
        const fullTranscription = sortedChunks
          .map((c) => {
            const startMin = Math.floor(c.startSec / 60);
            const endMin = Math.floor(c.endSec / 60);
            return `--- [${startMin}分〜${endMin}分] ---\n${c.transcription.trim()}`;
          })
          .join("\n\n");

        // 完了後はIndexedDBの中間進捗を削除
        await clearTranscriptionProgress(projectId!);
        setProcessingProgress(null);

        const updated = updateProject(projectId!, {
          transcription: fullTranscription,
          status: "transcribed",
          tokenUsage: {
            ...project?.tokenUsage,
            transcription: { input: totalInputTokens, output: totalOutputTokens },
          },
          speakerCount: speakerCountNum,
        });
        if (updated) {
          setProject(updated);
          setEditedTranscription(fullTranscription);
        }
        const resumeMsg = resumedFrom > 0 ? `（チャンク${resumedFrom + 1}から再開）` : "";
        toast.success(`書き起こしが完了しました（${totalChunks}チャンク${resumeMsg}）`);
        return;
      }

      // ─── 15MB以下の場合は通常の書き起こし ───
      setProcessingProgress(`書き起こし中... (${fileSizeMB.toFixed(1)}MB)`);

      const audioBase64 = await blobToBase64(blob);

      setProcessingProgress("AIが音声を解析中... (数分かかる場合があります)");

      const result = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        speakerCount: speakerCountNum,
      });

      setProcessingProgress(null);

      const updated = updateProject(projectId!, {
        transcription: result.transcription,
        status: "transcribed",
        tokenUsage: {
          ...project?.tokenUsage,
          transcription: result.tokenUsage,
        },
        speakerCount: speakerCountNum,
      });
      if (updated) {
        setProject(updated);
        setEditedTranscription(result.transcription);
      }
      toast.success("書き起こしが完了しました");
    } catch (error) {
      setProcessingProgress(null);
      console.error("Transcription error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const ctx = JSON.stringify({
        duration: project?.recordingDuration,
        speakerCount,
        mimeType: audioBlob?.type || "unknown",
        userAgent: navigator.userAgent,
      });
      // エラーを自動的にDBに保存
      await autoSaveError("transcribe", errMsg, ctx);
      toast.error(
        <div className="flex flex-col gap-2">
          <span>書き起こしに失敗しました</span>
          <button
            className="text-xs underline text-left text-destructive-foreground/80"
            onClick={() => openErrorReport("transcribe", errMsg, ctx)}
          >
            ▶ 詳細を報告する（自動保存済み）
          </button>
        </div>
      );
    }
  };

  const handleSummarize = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const chunkCount = estimateChunkCount(project.transcription);
      if (chunkCount > 1) {
        setProcessingProgress(`要約中... (チャンク1/${chunkCount}を処理中)`);
        // 進捗を段階的に更新するタイマー
        let currentChunk = 1;
        const progressInterval = setInterval(() => {
          if (currentChunk < chunkCount) {
            currentChunk++;
            setProcessingProgress(`要約中... (チャンク${currentChunk}/${chunkCount}を処理中)`);
          } else {
            setProcessingProgress(`要約中... (最終統合処理中)`);
            clearInterval(progressInterval);
          }
        }, 25000); // 25秒ごとに進捗更新

        try {
          const result = await summarizeMutation.mutateAsync({
            transcription: project.transcription,
          });
          clearInterval(progressInterval);
          setProcessingProgress(null);

          const updated = updateProject(projectId!, {
            summary: result.summary,
            status: "summarized",
            tokenUsage: {
              ...project.tokenUsage,
              summary: result.tokenUsage,
            },
          });
          if (updated) setProject(updated);
          toast.success(`要約が完了しました（${result.chunkCount}チャンクを処理）`);
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      } else {
        setProcessingProgress("要約中...");
        const result = await summarizeMutation.mutateAsync({
          transcription: project.transcription,
        });
        setProcessingProgress(null);

        const updated = updateProject(projectId!, {
          summary: result.summary,
          status: "summarized",
          tokenUsage: {
            ...project.tokenUsage,
            summary: result.tokenUsage,
          },
        });
        if (updated) setProject(updated);
        toast.success("要約が完了しました");
      }
    } catch (error) {
      setProcessingProgress(null);
      console.error("Summary error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const ctx = JSON.stringify({
        transcriptionLength: project?.transcription?.length,
        estimatedChunks: estimateChunkCount(project?.transcription || ""),
        userAgent: navigator.userAgent,
      });
      // エラーを自動的にDBに保存
      await autoSaveError("summarize", errMsg, ctx);
      toast.error(
        <div className="flex flex-col gap-2">
          <span>要約に失敗しました</span>
          <button
            className="text-xs underline text-left text-destructive-foreground/80"
            onClick={() => openErrorReport("summarize", errMsg, ctx)}
          >
            ▶ 詳細を報告する（自動保存済み）
          </button>
        </div>
      );
    }
  };

  const handleGenerateMinutes = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const chunkCount = estimateChunkCount(project.transcription);
      if (chunkCount > 1) {
        setProcessingProgress(`議事録生成中... (チャンク1/${chunkCount}を処理中)`);
        let currentChunk = 1;
        const progressInterval = setInterval(() => {
          if (currentChunk < chunkCount) {
            currentChunk++;
            setProcessingProgress(`議事録生成中... (チャンク${currentChunk}/${chunkCount}を処理中)`);
          } else {
            setProcessingProgress(`議事録生成中... (最終統合処理中)`);
            clearInterval(progressInterval);
          }
        }, 25000);

        try {
          const result = await minutesMutation.mutateAsync({
            transcription: project.transcription,
            template: minutesTemplate,
            metadata: minutesMetadata,
          });
          clearInterval(progressInterval);
          setProcessingProgress(null);

          const updated = updateProject(projectId!, {
            minutes: result.minutes,
            tokenUsage: {
              ...project.tokenUsage,
              minutes: result.tokenUsage,
            },
          });
          if (updated) setProject(updated);
          toast.success(`議事録が生成されました（${result.chunkCount}チャンクを処理）`);
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      } else {
        setProcessingProgress("議事録生成中...");
        const result = await minutesMutation.mutateAsync({
          transcription: project.transcription,
          template: minutesTemplate,
          metadata: minutesMetadata,
        });
        setProcessingProgress(null);

        const updated = updateProject(projectId!, {
          minutes: result.minutes,
          tokenUsage: {
            ...project.tokenUsage,
            minutes: result.tokenUsage,
          },
        });
        if (updated) setProject(updated);
        toast.success("議事録が生成されました");
      }
    } catch (error) {
      setProcessingProgress(null);
      console.error("Minutes error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const ctx = JSON.stringify({
        transcriptionLength: project?.transcription?.length,
        estimatedChunks: estimateChunkCount(project?.transcription || ""),
        template: minutesTemplate,
        userAgent: navigator.userAgent,
      });
      await autoSaveError("generateMinutes", errMsg, ctx);
      toast.error(
        <div className="flex flex-col gap-2">
          <span>議事録の生成に失敗しました</span>
          <button
            className="text-xs underline text-left text-destructive-foreground/80"
            onClick={() => openErrorReport("generateMinutes", errMsg, ctx)}
          >
            ▶ 詳細を報告する（自動保存済み）
          </button>
        </div>
      );
    }
  };

  const handleGenerateKarte = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const chunkCount = estimateChunkCount(project.transcription);
      if (chunkCount > 1) {
        setProcessingProgress(`カルテ生成中... (チャンク1/${chunkCount}を処理中)`);
        let currentChunk = 1;
        const progressInterval = setInterval(() => {
          if (currentChunk < chunkCount) {
            currentChunk++;
            setProcessingProgress(`カルテ生成中... (チャンク${currentChunk}/${chunkCount}を処理中)`);
          } else {
            setProcessingProgress(`カルテ生成中... (最終統合処理中)`);
            clearInterval(progressInterval);
          }
        }, 25000);

        try {
          const result = await karteMutation.mutateAsync({
            transcription: project.transcription,
            formatId: karteFormatId,
            patientInfo: kartePatientInfo,
          });
          clearInterval(progressInterval);
          setProcessingProgress(null);

          const updated = updateProject(projectId!, {
            karte: result.karte,
            tokenUsage: {
              ...project.tokenUsage,
              karte: result.tokenUsage,
            },
          });
          if (updated) setProject(updated);
          const formatName = KARTE_FORMATS.find(f => f.id === karteFormatId)?.name ?? "カルテ";
          toast.success(`${formatName}が生成されました（${result.chunkCount}チャンクを処理）`);
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      } else {
        setProcessingProgress("カルテ生成中...");
        const result = await karteMutation.mutateAsync({
          transcription: project.transcription,
          formatId: karteFormatId,
          patientInfo: kartePatientInfo,
        });
        setProcessingProgress(null);

        const updated = updateProject(projectId!, {
          karte: result.karte,
          tokenUsage: {
            ...project.tokenUsage,
            karte: result.tokenUsage,
          },
        });
        if (updated) setProject(updated);
        const formatName = KARTE_FORMATS.find(f => f.id === karteFormatId)?.name ?? "カルテ";
        toast.success(`${formatName}が生成されました`);
      }
    } catch (error) {
      setProcessingProgress(null);
      console.error("Karte error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      const ctx = JSON.stringify({
        transcriptionLength: project?.transcription?.length,
        estimatedChunks: estimateChunkCount(project?.transcription || ""),
        patientInfo: kartePatientInfo,
        userAgent: navigator.userAgent,
      });
      await autoSaveError("generateKarte", errMsg, ctx);
      toast.error(
        <div className="flex flex-col gap-2">
          <span>カルテの生成に失敗しました</span>
          <button
            className="text-xs underline text-left text-destructive-foreground/80"
            onClick={() => openErrorReport("generateKarte", errMsg, ctx)}
          >
            ▶ 詳細を報告する（自動保存済み）
          </button>
        </div>
      );
    }
  };

  const handleSaveTranscription = () => {
    if (!projectId) return;
    const updated = updateProject(projectId, {
      transcription: editedTranscription,
    });
    if (updated) setProject(updated);
    setIsEditMode(false);
    toast.success("書き起こしを保存しました");
  };

  const handleRenameSpeakers = () => {
    if (!project?.transcription) return;
    
    let newTranscription = project.transcription;
    Object.entries(speakerRenames).forEach(([oldName, newName]) => {
      if (newName.trim()) {
        const regex = new RegExp(`\\[${oldName}\\]:`, "g");
        newTranscription = newTranscription.replace(regex, `[${newName}]:`);
      }
    });

    const updated = updateProject(projectId!, {
      transcription: newTranscription,
    });
    if (updated) {
      setProject(updated);
      setEditedTranscription(newTranscription);
    }
    setShowSpeakerRenameDialog(false);
    setSpeakerRenames({});
    toast.success("話者名を変更しました");
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("クリップボードにコピーしました");
  };

  const handleDownloadWord = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("ダウンロードしました");
  };

  const handleReRecord = () => {
    resetRecording();
    if (savedAudioUrl) {
      URL.revokeObjectURL(savedAudioUrl);
      setSavedAudioUrl(null);
    }
    const updated = updateProject(projectId!, {
      status: "created",
      recordingDuration: 0,
      transcription: null,
      summary: null,
      minutes: null,
      karte: null,
      tokenUsage: {},
    });
    if (updated) {
      setProject(updated);
      setEditedTranscription("");
    }
  };

  const currentAudioUrl = audioUrl || savedAudioUrl;
  const speakers = useMemo(() => {
    return project?.transcription ? extractSpeakers(project.transcription) : [];
  }, [project?.transcription]);
  const transcriptionSegments = useMemo(() => {
    return project?.transcription ? parseTranscription(project.transcription) : [];
  }, [project?.transcription]);
  const tokenTotals = project?.tokenUsage ? getTotalTokens(project.tokenUsage) : { input: 0, output: 0 };
  const tokenCost = project?.tokenUsage ? calculateTokenCost(project.tokenUsage) : 0;

  // 処理中かどうか
  const isProcessing = transcribeMutation.isPending || transcribeChunkMutation.isPending || summarizeMutation.isPending || minutesMutation.isPending || karteMutation.isPending;

  if (authLoading || subLoading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh pb-20 relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-64 h-64 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-48 h-48 bg-blue-400/15 bottom-[20%] left-[-5%]" style={{ animationDelay: '2s' }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { window.location.href = "/app/voice"; }}
              className="glass-button rounded-xl"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Button>
          </div>
          <Badge variant="outline" className="text-xs glass-button px-3 py-1.5 rounded-lg">
            <Coins className="h-3 w-3 mr-1.5" />
            {tokenTotals.input + tokenTotals.output} tokens / ¥{tokenCost}
          </Badge>
        </div>
        <div className="container pb-4">
          <h1 className="text-xl font-bold line-clamp-1">{project.name}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(project.createdAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </header>

      {/* 処理中プログレスバー */}
      {isProcessing && processingProgress && (
        <div className="sticky top-[88px] z-40 bg-primary/10 backdrop-blur-sm border-b border-primary/20">
          <div className="container py-2 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            <span className="text-sm text-primary font-medium">{processingProgress}</span>
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="container py-6 space-y-5 relative z-10">
        {/* 録音セクション */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
              <Mic className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-semibold">録音</h2>
          </div>

          {recordingError && (
            <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-xl text-sm backdrop-blur-sm">
              {recordingError}
            </div>
          )}

          {isRecording ? (
            <div className="text-center py-8">
              <div className="recording-pulse inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-100/80 backdrop-blur-sm mb-5">
                <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                  <Mic className="h-7 w-7 text-white" />
                </div>
              </div>
              <div className="text-5xl font-mono font-bold text-red-600 mb-6">
                {formatDuration(duration)}
              </div>
              <div className="flex justify-center gap-3">
                {isPaused ? (
                  <Button onClick={resumeRecording} className="glass-button rounded-xl">
                    <Play className="h-4 w-4 mr-2" />
                    再開
                  </Button>
                ) : (
                  <Button onClick={pauseRecording} className="glass-button rounded-xl">
                    <Pause className="h-4 w-4 mr-2" />
                    一時停止
                  </Button>
                )}
                <Button onClick={stopRecording} variant="destructive" className="rounded-xl">
                  <Square className="h-4 w-4 mr-2" />
                  停止
                </Button>
              </div>
            </div>
          ) : currentAudioUrl ? (
            <div className="space-y-4">
              <audio 
                ref={audioRef} 
                src={currentAudioUrl} 
                controls 
                className="w-full rounded-xl"
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  録音時間: {formatDuration(project.recordingDuration)}
                </span>
                <Button variant="outline" size="sm" onClick={handleReRecord} className="glass-button rounded-xl">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  録音し直す
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Button onClick={startRecording} size="lg" className="btn-gradient text-white border-0 px-8 py-6 rounded-xl">
                <Mic className="h-5 w-5 mr-2" />
                録音を開始
              </Button>
            </div>
          )}
        </div>

        {/* 書き起こしセクション */}
        {currentAudioUrl && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 backdrop-blur-sm">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <h2 className="font-semibold">書き起こし</h2>
              </div>
              {project.transcription && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditMode(!isEditMode)}
                    className="glass-button rounded-lg"
                  >
                    {isEditMode ? (
                      <>
                        <Eye className="h-4 w-4 mr-1" />
                        閲覧
                      </>
                    ) : (
                      <>
                        <Edit3 className="h-4 w-4 mr-1" />
                        編集
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const renames: Record<string, string> = {};
                      speakers.forEach(s => { renames[s] = ""; });
                      setSpeakerRenames(renames);
                      setShowSpeakerRenameDialog(true);
                    }}
                    className="glass-button rounded-lg"
                  >
                    <Users className="h-4 w-4 mr-1" />
                    話者名変更
                  </Button>
                </div>
              )}
            </div>

            {!project.transcription ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label className="text-sm font-medium">話者数</Label>
                  <Select value={speakerCount} onValueChange={setSpeakerCount}>
                    <SelectTrigger className="w-32 glass-input rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自動</SelectItem>
                      <SelectItem value="1">1人</SelectItem>
                      <SelectItem value="2">2人</SelectItem>
                      <SelectItem value="3">3人</SelectItem>
                      <SelectItem value="4">4人</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {project.recordingDuration > 1800 && (
                  <div className="p-3 rounded-xl bg-blue-50/80 backdrop-blur-sm border border-blue-200/50 text-sm text-blue-800">
                    <strong>長時間音声:</strong> 30分以上の音声は自動的に分割して逐次書き起こしします。
                    処理中はページを閉じないでください。
                  </div>
                )}
                <Button 
                  onClick={handleTranscribe}
                  disabled={transcribeMutation.isPending || transcribeChunkMutation.isPending}
                  className="w-full btn-gradient text-white border-0 h-12 rounded-xl"
                >
                  {(transcribeMutation.isPending || transcribeChunkMutation.isPending) ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {processingProgress || "書き起こし中..."}
                    </>
                  ) : (
                    "書き起こしを開始"
                  )}
                </Button>
              </div>
            ) : isEditMode ? (
              <div className="space-y-4">
                <Textarea
                  value={editedTranscription}
                  onChange={(e) => setEditedTranscription(e.target.value)}
                  className="min-h-[300px] font-mono text-sm glass-input rounded-xl"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                    setEditedTranscription(project.transcription || "");
                    setIsEditMode(false);
                  }} className="glass-button rounded-xl">
                    キャンセル
                  </Button>
                  <Button onClick={handleSaveTranscription} className="btn-gradient text-white border-0 rounded-xl">
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {transcriptionSegments.map((segment, index) => (
                    <div key={index} className={`flex gap-3 p-3 rounded-xl ${getSpeakerColor(segment.speaker)}`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${getSpeakerIconColor(segment.speaker)}`}>
                          {getSpeakerNumber(segment.speaker)}
                        </div>
                        <div className="text-xs text-center mt-1 font-medium text-muted-foreground">
                          {segment.speaker}
                        </div>
                      </div>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed pl-9">{segment.text}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyToClipboard(project.transcription!)}
                    className="glass-button rounded-xl"
                  >
                    <Clipboard className="h-4 w-4 mr-2" />
                    コピー
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadWord(project.transcription!, `${project.name}_書き起こし`)}
                    className="glass-button rounded-xl"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Word
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 要約/議事録/カルテ タブ */}
        {project.transcription && (
          <div className="glass-card p-6">
            <Tabs defaultValue="summary">
              <TabsList className="grid w-full grid-cols-3 bg-white/30 backdrop-blur-sm rounded-xl p-1">
                <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-white/70">要約</TabsTrigger>
                <TabsTrigger value="minutes" className="rounded-lg data-[state=active]:bg-white/70">議事録</TabsTrigger>
                <TabsTrigger value="karte" className="rounded-lg data-[state=active]:bg-white/70">カルテ</TabsTrigger>
              </TabsList>

              {/* 要約タブ */}
              <TabsContent value="summary" className="mt-5">
                {!project.summary ? (
                  <div className="space-y-3">
                    {estimateChunkCount(project.transcription) > 1 && (
                      <div className="p-3 rounded-xl bg-blue-50/80 backdrop-blur-sm border border-blue-200/50 text-sm text-blue-800">
                        <strong>長文テキスト検出:</strong> 書き起こしが長いため、
                        {estimateChunkCount(project.transcription)}チャンクに分割して処理します。
                        数分かかる場合があります。
                      </div>
                    )}
                    <Button 
                      onClick={handleSummarize}
                      disabled={summarizeMutation.isPending}
                      className="w-full btn-gradient text-white border-0 h-12 rounded-xl"
                    >
                      {summarizeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {processingProgress || "要約中..."}
                        </>
                      ) : (
                        "要約を生成"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="prose prose-sm max-w-none p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                      <Streamdown>{project.summary}</Streamdown>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyToClipboard(project.summary!)}
                        className="glass-button rounded-xl"
                      >
                        <Clipboard className="h-4 w-4 mr-2" />
                        コピー
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadWord(project.summary!, `${project.name}_要約`)}
                        className="glass-button rounded-xl"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Word
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = updateProject(projectId!, { summary: null });
                          if (updated) setProject(updated);
                        }}
                        className="glass-button rounded-xl"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        再生成
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* 議事録タブ */}
              <TabsContent value="minutes" className="mt-5 space-y-4">
                {!project.minutes ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm font-medium">テンプレート</Label>
                        <Select value={minutesTemplate} onValueChange={(v) => setMinutesTemplate(v as "business" | "medical" | "weekly")}>
                          <SelectTrigger className="mt-2 glass-input rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="business">ビジネス会議</SelectItem>
                            <SelectItem value="medical">医療カンファレンス</SelectItem>
                            <SelectItem value="weekly">週間報告</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">会議名</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={minutesMetadata.meetingName}
                          onChange={(e) => setMinutesMetadata(prev => ({ ...prev, meetingName: e.target.value }))}
                          placeholder="例: 定例ミーティング"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">日時</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={minutesMetadata.date}
                          onChange={(e) => setMinutesMetadata(prev => ({ ...prev, date: e.target.value }))}
                          placeholder="例: 2025年1月12日 10:00"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">参加者</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={minutesMetadata.participants}
                          onChange={(e) => setMinutesMetadata(prev => ({ ...prev, participants: e.target.value }))}
                          placeholder="例: 田中、佐藤、鈴木"
                        />
                      </div>
                    </div>
                    {minutesTemplate === "medical" && (
                      <div className="p-4 rounded-xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 text-sm text-amber-800">
                        <strong>注意:</strong> 医療カンファレンス用テンプレートでは、AIによる情報の捏造を防ぐため、
                        書き起こしテキストに明示的に記載されている情報のみが使用されます。
                      </div>
                    )}
                    {estimateChunkCount(project.transcription) > 1 && (
                      <div className="p-3 rounded-xl bg-blue-50/80 backdrop-blur-sm border border-blue-200/50 text-sm text-blue-800">
                        <strong>長文テキスト検出:</strong> {estimateChunkCount(project.transcription)}チャンクに分割して処理します。数分かかる場合があります。
                      </div>
                    )}
                    <Button 
                      onClick={handleGenerateMinutes}
                      disabled={minutesMutation.isPending}
                      className="w-full btn-gradient text-white border-0 h-12 rounded-xl"
                    >
                      {minutesMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {processingProgress || "生成中..."}
                        </>
                      ) : (
                        "議事録を生成"
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div ref={minutesRef} className="prose prose-sm max-w-none p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                      <Streamdown>{project.minutes}</Streamdown>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyToClipboard(project.minutes!)}
                        className="glass-button rounded-xl"
                      >
                        <Clipboard className="h-4 w-4 mr-2" />
                        コピー
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadWord(project.minutes!, `${project.name}_議事録`)}
                        className="glass-button rounded-xl"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Word
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportMinutes("png")}
                        className="glass-button rounded-xl"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        PNG
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportMinutes("pdf")}
                        className="glass-button rounded-xl"
                      >
                        <FileDown className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = updateProject(projectId!, { minutes: null });
                          if (updated) setProject(updated);
                        }}
                        className="glass-button rounded-xl"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        再生成
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* カルテタブ */}
              <TabsContent value="karte" className="mt-5 space-y-4">
                {!project.karte ? (
                  <>
                    {/* フォーマット選択 */}
                    <div>
                      <Label className="text-sm font-medium">カルテフォーマット</Label>
                      <Select value={karteFormatId} onValueChange={setKarteFormatId}>
                        <SelectTrigger className="mt-2 glass-input rounded-xl">
                          <SelectValue placeholder="フォーマットを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(
                            KARTE_FORMATS.reduce((acc, f) => {
                              if (!acc[f.category]) acc[f.category] = [];
                              acc[f.category].push(f);
                              return acc;
                            }, {} as Record<string, typeof KARTE_FORMATS>)
                          ).map(([category, formats]) => (
                            <div key={category}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{category}</div>
                              {formats.map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  <div className="flex flex-col">
                                    <span>{f.name}</span>
                                    <span className="text-xs text-muted-foreground">{f.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-sm font-medium">患者ID</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={kartePatientInfo.patientId}
                          onChange={(e) => setKartePatientInfo(prev => ({ ...prev, patientId: e.target.value }))}
                          placeholder="例: P12345"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">患者氏名</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={kartePatientInfo.patientName}
                          onChange={(e) => setKartePatientInfo(prev => ({ ...prev, patientName: e.target.value }))}
                          placeholder="例: 山田太郎"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">年齢</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={kartePatientInfo.age}
                          onChange={(e) => setKartePatientInfo(prev => ({ ...prev, age: e.target.value }))}
                          placeholder="例: 45歳"
                        />
                      </div>
                      <div>
                        <Label className="text-sm font-medium">性別</Label>
                        <Input
                          className="mt-2 glass-input rounded-xl"
                          value={kartePatientInfo.gender}
                          onChange={(e) => setKartePatientInfo(prev => ({ ...prev, gender: e.target.value }))}
                          placeholder="例: 男性"
                        />
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 text-sm text-amber-800">
                      <strong>注意:</strong> このカルテはAIによる自動生成です。
                      内容の正確性については必ず医師が確認してください。
                    </div>
                    {estimateChunkCount(project.transcription) > 1 && (
                      <div className="p-3 rounded-xl bg-blue-50/80 backdrop-blur-sm border border-blue-200/50 text-sm text-blue-800">
                        <strong>長文テキスト検出:</strong> {estimateChunkCount(project.transcription)}チャンクに分割して処理します。数分かかる場合があります。
                      </div>
                    )}
                    <Button 
                      onClick={handleGenerateKarte}
                      disabled={karteMutation.isPending}
                      className="w-full btn-gradient text-white border-0 h-12 rounded-xl"
                    >
                      {karteMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {processingProgress || "生成中..."}
                        </>
                      ) : (
                        `${KARTE_FORMATS.find(f => f.id === karteFormatId)?.name ?? "カルテ"}を生成`
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div ref={karteRef} className="prose prose-sm max-w-none p-4 rounded-xl bg-white/30 backdrop-blur-sm">
                      <Streamdown>{project.karte}</Streamdown>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyToClipboard(project.karte!)}
                        className="glass-button rounded-xl"
                      >
                        <Clipboard className="h-4 w-4 mr-2" />
                        コピー
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadWord(project.karte!, `${project.name}_カルテ`)}
                        className="glass-button rounded-xl"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Word
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportKarte("png")}
                        className="glass-button rounded-xl"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        PNG
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportKarte("pdf")}
                        className="glass-button rounded-xl"
                      >
                        <FileDown className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = updateProject(projectId!, { karte: null });
                          if (updated) setProject(updated);
                        }}
                        className="glass-button rounded-xl"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        再生成
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {/* エラー報告ダイアログ */}
      <Dialog open={!!errorReportInfo} onOpenChange={(open) => { if (!open) setErrorReportInfo(null); }}>
        <DialogContent className="glass-card border-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              エラー報告
              {autoSaved && (
                <span className="ml-auto text-xs text-green-500 font-normal flex items-center gap-1">
                  <Check className="h-3 w-3" />自動保存済み
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {autoSaved
                ? "エラー情報は自動的に保存されました。追加のコメントがあれば入力して送信してください。"
                : "エラーの内容を送信します。状況をご記入いただけると改善に役立ちます。"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-destructive/10 text-sm text-destructive font-mono break-all">
              {errorReportInfo?.errorMessage}
            </div>
            <div>
              <Label className="text-sm font-medium">コメント（任意）</Label>
              <Textarea
                className="mt-2 glass-input rounded-xl"
                placeholder="例: 60分の音声を書き起こしした際に発生しました"
                value={errorUserComment}
                onChange={(e) => setErrorUserComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setErrorReportInfo(null)}
              className="glass-button rounded-xl"
            >
              閉じる
            </Button>
            <Button
              onClick={handleSubmitErrorReport}
              disabled={reportMutation.isPending || !errorUserComment.trim()}
              className="btn-gradient text-white border-0 rounded-xl"
            >
              {reportMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />送信中...</>
              ) : (
                "コメントを追加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 書き起こし再開確認ダイアログ */}
      <Dialog open={resumeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // ダイアログを閉じるだけ（進捗は保持）
          setResumeDialogOpen(false);
        }
      }}>
        <DialogContent className="glass-card border-0">
          <DialogHeader>
            <DialogTitle>書き起こしを再開しますか？</DialogTitle>
            <DialogDescription>
              前回の書き起こしが途中で中断されています。
            </DialogDescription>
          </DialogHeader>
          {pendingProgress && (
            <div className="py-4 space-y-3">
              <div className="p-3 rounded-xl bg-primary/10 text-sm space-y-1">
                <p>完了済み: <strong>{pendingProgress.completedChunks.length} / {pendingProgress.totalChunks} チャンク</strong></p>
                <p>保存日時: {new Date(pendingProgress.savedAt).toLocaleString("ja-JP")}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                「再開」を選ぶと、完了済みのチャンクをスキップして続きから処理します。
                「最初から」を選ぶと、保存された進捗を削除して全チャンクを再処理します。
              </p>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                // 進捗を削除して最初から再実行
                if (projectId) await clearTranscriptionProgress(projectId);
                setPendingProgress(null);
                setResumeDialogOpen(false);
                handleTranscribe();
              }}
              className="glass-button rounded-xl"
            >
              最初から
            </Button>
            <Button
              onClick={() => {
                // 進捗を保持したまま再開
                setPendingProgress(null);
                setResumeDialogOpen(false);
                handleTranscribe();
              }}
              className="btn-gradient text-white border-0 rounded-xl"
            >
              再開
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 話者名変更ダイアログ */}
      <Dialog open={showSpeakerRenameDialog} onOpenChange={setShowSpeakerRenameDialog}>
        <DialogContent className="glass-card border-0">
          <DialogHeader>
            <DialogTitle>話者名の一括変更</DialogTitle>
            <DialogDescription>
              各話者の名前を入力してください（空欄の場合は変更されません）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {speakers.map((speaker) => (
              <div key={speaker} className="flex items-center gap-4">
                <Label className="w-24 flex-shrink-0 font-medium">[{speaker}]</Label>
                <span className="text-muted-foreground">→</span>
                <Input
                  value={speakerRenames[speaker] || ""}
                  onChange={(e) => setSpeakerRenames(prev => ({
                    ...prev,
                    [speaker]: e.target.value,
                  }))}
                  placeholder={`新しい名前（例: 田中）`}
                  className="glass-input rounded-xl"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpeakerRenameDialog(false)} className="glass-button rounded-xl">
              キャンセル
            </Button>
            <Button onClick={handleRenameSpeakers} className="btn-gradient text-white border-0 rounded-xl">
              変更を適用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
