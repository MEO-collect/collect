import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, ImageIcon, X, ArrowLeft, ArrowRight, AlertCircle, Globe, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import type { UploadedFile } from "@shared/shozai-types";

interface UploadStepProps {
  files: UploadedFile[];
  onComplete: (files: UploadedFile[], companyUrl?: string) => void;
  onBack: () => void;
}

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadStep({ files: initialFiles, onComplete, onBack }: UploadStepProps) {
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [companyUrl, setCompanyUrl] = useState("");

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const validFiles: UploadedFile[] = [];

    for (const file of arr) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: 対応していないファイル形式です（PNG/JPG/PDF のみ）`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: ファイルサイズが30MBを超えています`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        validFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      } catch {
        toast.error(`${file.name}: ファイルの読み込みに失敗しました`);
      }
    }

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const handleRemove = (index: number) => {
    setFiles((prev) => {
      const next = [...prev];
      if (next[index].previewUrl) URL.revokeObjectURL(next[index].previewUrl!);
      next.splice(index, 1);
      return next;
    });
  };

  const handleProceed = () => {
    if (mode === "file") {
      if (files.length === 0) {
        toast.error("ファイルをで1つ以上アップロードしてください");
        return;
      }
      onComplete(files);
    } else {
      if (!companyUrl.trim()) {
        toast.error("URLを入力してください");
        return;
      }
      try {
        new URL(companyUrl.trim());
      } catch {
        toast.error("有効なURLを入力してください");
        return;
      }
      onComplete([], companyUrl.trim());
    }
  };

  return (
    <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Upload className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg text-slate-900 dark:text-white">資料アップロード</CardTitle>
            <CardDescription className="text-xs">
              営業資料・見積書・提案書をアップロード、またはURLで診断
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* モード切り替え */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
          <button
            onClick={() => setMode("file")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${
              mode === "file"
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
            }`}
          >
            <Upload className="h-4 w-4" />
            資料アップロード
          </button>
          <button
            onClick={() => setMode("url")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${
              mode === "url"
                ? "bg-indigo-600 text-white"
                : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600"
            }`}
          >
            <Globe className="h-4 w-4" />
            URLで診断
          </button>
        </div>
        {/* URLモード入力 */}
        {mode === "url" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-indigo-500" />
                会社ホームページURL
              </Label>
              <Input
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://example.com"
                className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600"
              />
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                会社ホームページのURLを入力すると、AIがページ内容を取得して商材・サービス内容を診断します。
              </p>
            </div>
          </div>
        )}

        {/* Drop Zone - ファイルモードのみ表示 */}
        {mode === "file" && (
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              dragActive
                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30"
                : "border-slate-300 dark:border-slate-600 hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/20"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) processFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-100 to-indigo-100 dark:from-teal-900/50 dark:to-indigo-900/50 flex items-center justify-center">
                <Upload className="h-7 w-7 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  ファイルをドラッグ＆ドロップ
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  またはクリックして選択（PNG/JPG/PDF・30MB以下）
                </p>
              </div>
            </div>
          </div>
        )}

        {/* File List - ファイルモードのみ */}
        {mode === "file" && files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              アップロード済み（{files.length}件）
            </p>
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600"
              >
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-600"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-slate-400 hover:text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(i);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            アップロードされた資料はAI分析のみに使用され、サーバーに保存されません。
          </p>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 h-12 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <Button
            onClick={handleProceed}
            disabled={files.length === 0}
            className="flex-1 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white shadow-lg shadow-teal-500/20 h-12 text-base font-semibold"
          >
            分析開始
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
