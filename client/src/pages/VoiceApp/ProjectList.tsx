import { useAuth } from "@/_core/hooks/useAuth";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  Mic, 
  Plus, 
  Trash2,
  FileText,
  ArrowUpDown,
  Filter
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { 
  getProjects, 
  createProject, 
  deleteProject, 
  Project, 
  ProjectStatus 
} from "@/lib/projectStorage";
import { deleteAudio } from "@/lib/indexedDB";
import { formatDuration } from "@/hooks/useAudioRecorder";

const statusConfig: Record<ProjectStatus, { label: string; color: string; icon: React.ReactNode }> = {
  created: { 
    label: "新規", 
    color: "bg-slate-100/80 text-slate-700 backdrop-blur-sm",
    icon: <Clock className="h-3 w-3" />
  },
  recorded: { 
    label: "録音済", 
    color: "bg-blue-100/80 text-blue-700 backdrop-blur-sm",
    icon: <Mic className="h-3 w-3" />
  },
  transcribed: { 
    label: "書き起こし済", 
    color: "bg-amber-100/80 text-amber-700 backdrop-blur-sm",
    icon: <FileText className="h-3 w-3" />
  },
  summarized: { 
    label: "完了", 
    color: "bg-emerald-100/80 text-emerald-700 backdrop-blur-sm",
    icon: <CheckCircle2 className="h-3 w-3" />
  },
};

export default function ProjectList() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const { isLoading: subLoading } = useSubscriptionGuard();
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | ProjectStatus>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const filteredProjects = useMemo(() => {
    let list = filterStatus === "all" ? projects : projects.filter(p => p.status === filterStatus);
    list = [...list].sort((a, b) =>
      sortOrder === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
    );
    return list;
  }, [projects, filterStatus, sortOrder]);

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/";
    }
  }, [authLoading, isAuthenticated]);

  const handleCreateProject = () => {
    const project = createProject(newProjectName);
    setProjects(getProjects());
    setShowCreateDialog(false);
    setNewProjectName("");
    window.location.href = `/app/voice/${project.id}`;
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    await deleteAudio(projectToDelete.id);
    deleteProject(projectToDelete.id);
    setProjects(getProjects());
    setShowDeleteDialog(false);
    setProjectToDelete(null);
  };

  const openDeleteDialog = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setShowDeleteDialog(true);
  };

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div className="floating-orb w-72 h-72 bg-primary/15 top-[-5%] right-[-5%]" style={{ animationDelay: '0s' }} />
      <div className="floating-orb w-56 h-56 bg-blue-400/15 bottom-[10%] left-[-5%]" style={{ animationDelay: '2s' }} />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-16 items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => { window.location.href = "/home"; }}
            className="glass-button rounded-xl"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <span className="ml-4 font-semibold text-lg">音声録音＆書き起こし＆要約</span>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container py-8 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">プロジェクト一覧</h1>
            <p className="text-muted-foreground mt-2">
              音声録音・書き起こしプロジェクトを管理します
            </p>
          </div>
        </div>

        {/* フィルター・並び替えバー */}
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* ステータスフィルター */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {(["all", "created", "recorded", "transcribed", "summarized"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filterStatus === s
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-white/40 text-muted-foreground hover:bg-white/60 backdrop-blur-sm"
                  }`}
                >
                  {s === "all" ? "すべて" : statusConfig[s].label}
                </button>
              ))}
            </div>
            {/* 並び替え */}
            <button
              onClick={() => setSortOrder(o => o === "newest" ? "oldest" : "newest")}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/40 hover:bg-white/60 backdrop-blur-sm text-muted-foreground transition-all"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortOrder === "newest" ? "新しい順" : "古い順"}
            </button>
          </div>
        )}

        {/* プロジェクトグリッド */}
        {projects.length === 0 ? (
          <div className="glass-card text-center py-16 px-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm mx-auto mb-6">
              <Mic className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-3">プロジェクトがありません</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              新しいプロジェクトを作成して、音声の録音を始めましょう
            </p>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="btn-gradient text-white border-0 px-6 py-5 rounded-xl"
            >
              <Plus className="h-5 w-5 mr-2" />
              新規プロジェクト
            </Button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="glass-card text-center py-12 px-8">
            <p className="text-muted-foreground">該当するプロジェクトがありません</p>
            <button onClick={() => setFilterStatus("all")} className="mt-3 text-sm text-primary hover:underline">フィルターをリセット</button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => {
              const status = statusConfig[project.status];
              return (
                <div 
                  key={project.id}
                  className="glass-card p-5 cursor-pointer hover-lift"
                  onClick={() => { window.location.href = `/app/voice/${project.id}`; }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold line-clamp-1 flex-1 mr-2">
                      {project.name}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 -mr-2 -mt-1 text-muted-foreground hover:text-destructive rounded-lg"
                      onClick={(e) => openDeleteDialog(e, project)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    {new Date(project.createdAt).toLocaleString("ja-JP")}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${status.color}`}>
                      {status.icon}
                      {status.label}
                    </span>
                    {project.recordingDuration > 0 && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {formatDuration(project.recordingDuration)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* FAB */}
        <Button
          className="fixed bottom-8 right-8 h-16 w-16 rounded-2xl shadow-xl btn-gradient text-white border-0"
          size="icon"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-7 w-7" />
        </Button>
      </main>

      {/* 新規プロジェクトダイアログ */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="glass-card border-0">
          <DialogHeader>
            <DialogTitle>新規プロジェクト</DialogTitle>
            <DialogDescription>
              プロジェクト名を入力してください（空欄の場合は現在日時が設定されます）
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="projectName" className="text-sm font-medium">プロジェクト名</Label>
            <Input
              id="projectName"
              placeholder="例: 2025年1月定例会議"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="mt-2 glass-input h-12 rounded-xl"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateProject();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowCreateDialog(false)}
              className="glass-button rounded-xl"
            >
              キャンセル
            </Button>
            <Button 
              onClick={handleCreateProject}
              className="btn-gradient text-white border-0 rounded-xl"
            >
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="glass-card border-0">
          <AlertDialogHeader>
            <AlertDialogTitle>プロジェクトを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{projectToDelete?.name}」を削除しますか？
              この操作は取り消せません。録音データも削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="glass-button rounded-xl">キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
