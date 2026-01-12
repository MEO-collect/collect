import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  FileText
} from "lucide-react";
import { useState, useEffect } from "react";
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
    color: "bg-slate-100 text-slate-700",
    icon: <Clock className="h-3 w-3" />
  },
  recorded: { 
    label: "録音済", 
    color: "bg-blue-100 text-blue-700",
    icon: <Mic className="h-3 w-3" />
  },
  transcribed: { 
    label: "書き起こし済", 
    color: "bg-amber-100 text-amber-700",
    icon: <FileText className="h-3 w-3" />
  },
  summarized: { 
    label: "完了", 
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="h-3 w-3" />
  },
};

export default function ProjectList() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const handleCreateProject = () => {
    const project = createProject(newProjectName);
    setProjects(getProjects());
    setShowCreateDialog(false);
    setNewProjectName("");
    setLocation(`/app/voice/${project.id}`);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    // Delete audio from IndexedDB
    await deleteAudio(projectToDelete.id);
    
    // Delete project from LocalStorage
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/home")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <span className="ml-4 font-semibold">音声録音＆書き起こし＆要約</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">プロジェクト一覧</h1>
            <p className="text-muted-foreground text-sm mt-1">
              音声録音・書き起こしプロジェクトを管理します
            </p>
          </div>
        </div>

        {/* Project Grid */}
        {projects.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Mic className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">プロジェクトがありません</h3>
              <p className="text-muted-foreground mb-4">
                新しいプロジェクトを作成して、音声の録音を始めましょう
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新規プロジェクト
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const status = statusConfig[project.status];
              return (
                <Card 
                  key={project.id}
                  className="cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
                  onClick={() => setLocation(`/app/voice/${project.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base line-clamp-1">
                        {project.name}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 -mr-2 -mt-1 text-muted-foreground hover:text-destructive"
                        onClick={(e) => openDeleteDialog(e, project)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription className="text-xs">
                      {new Date(project.createdAt).toLocaleString("ja-JP")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.icon}
                        {status.label}
                      </span>
                      {project.recordingDuration > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(project.recordingDuration)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* FAB */}
        <Button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </main>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規プロジェクト</DialogTitle>
            <DialogDescription>
              プロジェクト名を入力してください（空欄の場合は現在日時が設定されます）
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="projectName">プロジェクト名</Label>
            <Input
              id="projectName"
              placeholder="例: 2025年1月定例会議"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="mt-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateProject();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreateProject}>
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>プロジェクトを削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{projectToDelete?.name}」を削除しますか？
              この操作は取り消せません。録音データも削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
