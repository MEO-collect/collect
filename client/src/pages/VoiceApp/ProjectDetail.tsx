import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  MicOff,
  Pause,
  Play,
  RefreshCw,
  Square,
  Users,
  Coins
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
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
import { saveAudio, getAudio } from "@/lib/indexedDB";
import { useAudioRecorder, formatDuration } from "@/hooks/useAudioRecorder";
import { Streamdown } from "streamdown";

// Speaker color mapping
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

// Parse transcription into speaker segments
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

// Extract unique speakers from transcription
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
  const [minutesTemplate, setMinutesTemplate] = useState<"business" | "medical">("business");
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

  // tRPC mutations
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const summarizeMutation = trpc.voice.summarize.useMutation();
  const minutesMutation = trpc.voice.generateMinutes.useMutation();
  const karteMutation = trpc.voice.generateKarte.useMutation();

  // Load project
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

  // Load saved audio
  useEffect(() => {
    if (projectId && project?.status !== "created") {
      getAudio(projectId).then((blob) => {
        if (blob) {
          setSavedAudioUrl(URL.createObjectURL(blob));
        }
      });
    }
  }, [projectId, project?.status]);

  // Save audio when recording stops
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

  // Auth check
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (savedAudioUrl) {
        URL.revokeObjectURL(savedAudioUrl);
      }
    };
  }, [savedAudioUrl]);

  const handleTranscribe = async () => {
    if (!audioBlob && !savedAudioUrl) {
      toast.error("録音データがありません");
      return;
    }

    try {
      let blob = audioBlob;
      if (!blob && savedAudioUrl) {
        const response = await fetch(savedAudioUrl);
        blob = await response.blob();
      }
      if (!blob) return;

      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(blob);
      const audioBase64 = await base64Promise;

      const result = await transcribeMutation.mutateAsync({
        audioBase64,
        mimeType: blob.type || "audio/webm",
        speakerCount: speakerCount === "auto" ? null : parseInt(speakerCount),
      });

      const updated = updateProject(projectId!, {
        transcription: result.transcription,
        status: "transcribed",
        tokenUsage: {
          ...project?.tokenUsage,
          transcription: result.tokenUsage,
        },
        speakerCount: speakerCount === "auto" ? null : parseInt(speakerCount),
      });
      if (updated) {
        setProject(updated);
        setEditedTranscription(result.transcription);
      }
      toast.success("書き起こしが完了しました");
    } catch (error) {
      console.error("Transcription error:", error);
      toast.error("書き起こしに失敗しました");
    }
  };

  const handleSummarize = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const result = await summarizeMutation.mutateAsync({
        transcription: project.transcription,
      });

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
    } catch (error) {
      console.error("Summary error:", error);
      toast.error("要約に失敗しました");
    }
  };

  const handleGenerateMinutes = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const result = await minutesMutation.mutateAsync({
        transcription: project.transcription,
        template: minutesTemplate,
        metadata: minutesMetadata,
      });

      const updated = updateProject(projectId!, {
        minutes: result.minutes,
        tokenUsage: {
          ...project.tokenUsage,
          minutes: result.tokenUsage,
        },
      });
      if (updated) setProject(updated);
      toast.success("議事録が生成されました");
    } catch (error) {
      console.error("Minutes error:", error);
      toast.error("議事録の生成に失敗しました");
    }
  };

  const handleGenerateKarte = async () => {
    if (!project?.transcription) {
      toast.error("書き起こしテキストがありません");
      return;
    }

    try {
      const result = await karteMutation.mutateAsync({
        transcription: project.transcription,
        patientInfo: kartePatientInfo,
      });

      const updated = updateProject(projectId!, {
        karte: result.karte,
        tokenUsage: {
          ...project.tokenUsage,
          karte: result.tokenUsage,
        },
      });
      if (updated) setProject(updated);
      toast.success("カルテが生成されました");
    } catch (error) {
      console.error("Karte error:", error);
      toast.error("カルテの生成に失敗しました");
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

  // Computed values
  const currentAudioUrl = audioUrl || savedAudioUrl;
  const speakers = useMemo(() => {
    return project?.transcription ? extractSpeakers(project.transcription) : [];
  }, [project?.transcription]);
  const transcriptionSegments = useMemo(() => {
    return project?.transcription ? parseTranscription(project.transcription) : [];
  }, [project?.transcription]);
  const tokenTotals = project?.tokenUsage ? getTotalTokens(project.tokenUsage) : { input: 0, output: 0 };
  const tokenCost = project?.tokenUsage ? calculateTokenCost(project.tokenUsage) : 0;

  if (authLoading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/app/voice")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Coins className="h-3 w-3 mr-1" />
              {tokenTotals.input + tokenTotals.output} tokens / ¥{tokenCost}
            </Badge>
          </div>
        </div>
        <div className="container pb-3">
          <h1 className="text-lg font-semibold line-clamp-1">{project.name}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(project.createdAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-4 space-y-4">
        {/* Recording Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4" />
              録音
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recordingError && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {recordingError}
              </div>
            )}

            {isRecording ? (
              <div className="text-center py-6">
                <div className="recording-pulse inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 mb-4">
                  <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                    <Mic className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="text-4xl font-mono font-bold text-red-600 mb-4">
                  {formatDuration(duration)}
                </div>
                <div className="flex justify-center gap-3">
                  {isPaused ? (
                    <Button onClick={resumeRecording} variant="outline">
                      <Play className="h-4 w-4 mr-2" />
                      再開
                    </Button>
                  ) : (
                    <Button onClick={pauseRecording} variant="outline">
                      <Pause className="h-4 w-4 mr-2" />
                      一時停止
                    </Button>
                  )}
                  <Button onClick={stopRecording} variant="destructive">
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
                  className="w-full"
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    録音時間: {formatDuration(project.recordingDuration)}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleReRecord}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    録音し直す
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Button onClick={startRecording} size="lg">
                  <Mic className="h-5 w-5 mr-2" />
                  録音を開始
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transcription Section */}
        {currentAudioUrl && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  書き起こし
                </CardTitle>
                {project.transcription && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditMode(!isEditMode)}
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
                    >
                      <Users className="h-4 w-4 mr-1" />
                      話者名変更
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!project.transcription ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>話者数</Label>
                    <Select value={speakerCount} onValueChange={setSpeakerCount}>
                      <SelectTrigger className="w-32">
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
                  <Button 
                    onClick={handleTranscribe}
                    disabled={transcribeMutation.isPending}
                    className="w-full"
                  >
                    {transcribeMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        書き起こし中...
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
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setEditedTranscription(project.transcription || "");
                      setIsEditMode(false);
                    }}>
                      キャンセル
                    </Button>
                    <Button onClick={handleSaveTranscription}>
                      <Check className="h-4 w-4 mr-2" />
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {transcriptionSegments.map((segment, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border-l-4 ${getSpeakerColor(segment.speaker)}`}
                      >
                        <div className="font-medium text-sm mb-1">[{segment.speaker}]</div>
                        <div className="text-sm whitespace-pre-wrap">{segment.text}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyToClipboard(project.transcription!)}
                    >
                      <Clipboard className="h-4 w-4 mr-2" />
                      コピー
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadWord(project.transcription!, `${project.name}_書き起こし`)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Word
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Summary/Minutes/Karte Tabs */}
        {project.transcription && (
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">要約</TabsTrigger>
                  <TabsTrigger value="minutes">議事録</TabsTrigger>
                  <TabsTrigger value="karte">カルテ</TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-4">
                  {!project.summary ? (
                    <Button 
                      onClick={handleSummarize}
                      disabled={summarizeMutation.isPending}
                      className="w-full"
                    >
                      {summarizeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          要約中...
                        </>
                      ) : (
                        "要約を生成"
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-4">
                      <div className="prose prose-sm max-w-none">
                        <Streamdown>{project.summary}</Streamdown>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyToClipboard(project.summary!)}
                        >
                          <Clipboard className="h-4 w-4 mr-2" />
                          コピー
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadWord(project.summary!, `${project.name}_要約`)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Word
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Minutes Tab */}
                <TabsContent value="minutes" className="mt-4 space-y-4">
                  {!project.minutes ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>テンプレート</Label>
                          <Select value={minutesTemplate} onValueChange={(v) => setMinutesTemplate(v as "business" | "medical")}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="business">ビジネス会議</SelectItem>
                              <SelectItem value="medical">医療カンファレンス</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>会議名</Label>
                          <Input
                            className="mt-1"
                            value={minutesMetadata.meetingName}
                            onChange={(e) => setMinutesMetadata(prev => ({ ...prev, meetingName: e.target.value }))}
                            placeholder="例: 定例ミーティング"
                          />
                        </div>
                        <div>
                          <Label>日時</Label>
                          <Input
                            className="mt-1"
                            value={minutesMetadata.date}
                            onChange={(e) => setMinutesMetadata(prev => ({ ...prev, date: e.target.value }))}
                            placeholder="例: 2025年1月12日 10:00"
                          />
                        </div>
                        <div>
                          <Label>参加者</Label>
                          <Input
                            className="mt-1"
                            value={minutesMetadata.participants}
                            onChange={(e) => setMinutesMetadata(prev => ({ ...prev, participants: e.target.value }))}
                            placeholder="例: 田中、佐藤、鈴木"
                          />
                        </div>
                      </div>
                      {minutesTemplate === "medical" && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                          <strong>注意:</strong> 医療カンファレンス用テンプレートでは、AIによる情報の捏造を防ぐため、
                          書き起こしテキストに明示的に記載されている情報のみが使用されます。
                        </div>
                      )}
                      <Button 
                        onClick={handleGenerateMinutes}
                        disabled={minutesMutation.isPending}
                        className="w-full"
                      >
                        {minutesMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          "議事録を生成"
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="prose prose-sm max-w-none">
                        <Streamdown>{project.minutes}</Streamdown>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyToClipboard(project.minutes!)}
                        >
                          <Clipboard className="h-4 w-4 mr-2" />
                          コピー
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadWord(project.minutes!, `${project.name}_議事録`)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Word
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = updateProject(projectId!, { minutes: null });
                            if (updated) setProject(updated);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          再生成
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Karte Tab */}
                <TabsContent value="karte" className="mt-4 space-y-4">
                  {!project.karte ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label>患者ID</Label>
                          <Input
                            className="mt-1"
                            value={kartePatientInfo.patientId}
                            onChange={(e) => setKartePatientInfo(prev => ({ ...prev, patientId: e.target.value }))}
                            placeholder="例: P12345"
                          />
                        </div>
                        <div>
                          <Label>患者氏名</Label>
                          <Input
                            className="mt-1"
                            value={kartePatientInfo.patientName}
                            onChange={(e) => setKartePatientInfo(prev => ({ ...prev, patientName: e.target.value }))}
                            placeholder="例: 山田太郎"
                          />
                        </div>
                        <div>
                          <Label>年齢</Label>
                          <Input
                            className="mt-1"
                            value={kartePatientInfo.age}
                            onChange={(e) => setKartePatientInfo(prev => ({ ...prev, age: e.target.value }))}
                            placeholder="例: 45歳"
                          />
                        </div>
                        <div>
                          <Label>性別</Label>
                          <Input
                            className="mt-1"
                            value={kartePatientInfo.gender}
                            onChange={(e) => setKartePatientInfo(prev => ({ ...prev, gender: e.target.value }))}
                            placeholder="例: 男性"
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        <strong>注意:</strong> このカルテはAIによる自動生成です。
                        内容の正確性については必ず医師が確認してください。
                      </div>
                      <Button 
                        onClick={handleGenerateKarte}
                        disabled={karteMutation.isPending}
                        className="w-full"
                      >
                        {karteMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          "カルテを生成（SOAP形式）"
                        )}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="prose prose-sm max-w-none">
                        <Streamdown>{project.karte}</Streamdown>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyToClipboard(project.karte!)}
                        >
                          <Clipboard className="h-4 w-4 mr-2" />
                          コピー
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadWord(project.karte!, `${project.name}_カルテ`)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Word
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = updateProject(projectId!, { karte: null });
                            if (updated) setProject(updated);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          再生成
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Speaker Rename Dialog */}
      <Dialog open={showSpeakerRenameDialog} onOpenChange={setShowSpeakerRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>話者名の一括変更</DialogTitle>
            <DialogDescription>
              各話者の名前を入力してください（空欄の場合は変更されません）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {speakers.map((speaker) => (
              <div key={speaker} className="flex items-center gap-4">
                <Label className="w-24 flex-shrink-0">[{speaker}]</Label>
                <span className="text-muted-foreground">→</span>
                <Input
                  value={speakerRenames[speaker] || ""}
                  onChange={(e) => setSpeakerRenames(prev => ({
                    ...prev,
                    [speaker]: e.target.value,
                  }))}
                  placeholder={`新しい名前（例: 田中）`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpeakerRenameDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleRenameSpeakers}>
              変更を適用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
