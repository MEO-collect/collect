import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Wand2,
  Loader2,
  Download,
  Sun,
  Contrast,
  Palette,
  Sparkles,
  Camera,
  Maximize2,
  X,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  ClipboardPaste,
} from "lucide-react";
import { useLocation } from "wouter";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

type EditParams = {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  enhanceQuality: boolean;
  backgroundBlur: boolean;
  backgroundType: string;
  styleTransform: string;
  angleChange: string;
  locationChange: string;
  removeWires: boolean;
  removePeople: boolean;
  customPrompt: string;
  numberOfImages: number;
};

const defaultParams: EditParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  enhanceQuality: false,
  backgroundBlur: false,
  backgroundType: "",
  styleTransform: "",
  angleChange: "",
  locationChange: "",
  removeWires: false,
  removePeople: false,
  customPrompt: "",
  numberOfImages: 1,
};

const styleOptions = [
  { value: "", label: "なし" },
  { value: "monochrome", label: "モノクロ" },
  { value: "film", label: "フィルム風" },
  { value: "cheki", label: "チェキ風" },
  { value: "slr", label: "一眼レフ風" },
  { value: "cinematic", label: "シネマティック" },
  { value: "anime", label: "アニメ風" },
  { value: "watercolor", label: "水彩画風" },
  { value: "oilPainting", label: "油絵風" },
];

const bgOptions = [
  { value: "", label: "なし" },
  { value: "white", label: "白背景" },
  { value: "black", label: "黒背景" },
  { value: "strongBlur", label: "強力ぼかし" },
];

export default function PhotoEditor() {
  const [, navigate] = useLocation();
  const { isLoading: subLoading } = useSubscriptionGuard();

  if (subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-mesh">
        <div className="glass-card p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalMimeType, setOriginalMimeType] = useState("image/jpeg");
  const [params, setParams] = useState<EditParams>(defaultParams);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    background: false,
    style: false,
    advanced: false,
    custom: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resize image to max dimension and compress as JPEG
  const resizeImage = useCallback((dataUrl: string, maxDim: number = 1536): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas context failed")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ base64: compressed.split(",")[1], mimeType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = dataUrl;
    });
  }, []);

  const editMutation = trpc.image.editPhoto.useMutation({
    onSuccess: (data) => {
      setGeneratedImages(data.images);
      toast.success(`${data.images.length}枚の画像を生成しました`);
    },
    onError: (err) => {
      toast.error(err.message || "画像の生成に失敗しました");
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("ファイルサイズは20MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setOriginalImage(dataUrl);
      setOriginalMimeType(file.type);
      setGeneratedImages([]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    },
    [handleFileSelect]
  );

  const handleGenerate = async () => {
    if (!originalImage) {
      toast.error("画像をアップロードしてください");
      return;
    }
    try {
      // Resize and compress image before sending
      const { base64, mimeType } = await resizeImage(originalImage);
      editMutation.mutate({
        imageBase64: base64,
        imageMimeType: mimeType,
        ...params,
      });
    } catch {
      toast.error("画像の処理に失敗しました");
    }
  };

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `edited-image-${index + 1}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("ダウンロードに失敗しました");
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateParam = <K extends keyof EditParams>(key: K, value: EditParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const isProcessing = editMutation.isPending;

  return (
    <div className="min-h-screen gradient-mesh relative" onPaste={handlePaste}>
      {/* Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-14 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/app/image")}
            className="glass-button h-9 w-9 rounded-xl shrink-0"
            aria-label="戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <Wand2 className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold">フォトエディター</h1>
          </div>
        </div>
      </header>

      {/* Main Content - 2 column on desktop */}
      <main className="container py-6 relative z-10">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Image Preview Area */}
          <div className="flex-1 min-w-0">
            {/* Upload / Preview */}
            {!originalImage ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="glass-card p-8 flex flex-col items-center justify-center min-h-[300px] lg:min-h-[500px] cursor-pointer hover-lift"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
                <p className="text-base font-medium mb-2">画像をアップロード</p>
                <p className="text-sm text-muted-foreground text-center">
                  クリック、ドラッグ&ドロップ、またはCtrl+Vで貼り付け
                </p>
                <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>クリップボードから貼り付け可能</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Original Image */}
                <div className="glass-card p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-medium text-muted-foreground">元の画像</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOriginalImage(null);
                        setGeneratedImages([]);
                      }}
                      className="h-7 text-xs"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      変更
                    </Button>
                  </div>
                  <img
                    src={originalImage}
                    alt="元の画像"
                    className="w-full rounded-lg object-contain max-h-[400px] bg-black/5"
                  />
                </div>

                {/* Generated Images */}
                {generatedImages.length > 0 && (
                  <div className="glass-card p-3">
                    <span className="text-xs font-medium text-muted-foreground px-1 mb-2 block">
                      生成結果 ({generatedImages.length}枚)
                    </span>
                    <div className={`grid gap-3 ${generatedImages.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {generatedImages.map((url, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={url}
                            alt={`生成画像 ${i + 1}`}
                            className="w-full rounded-lg object-contain max-h-[350px] bg-black/5 cursor-pointer"
                            onClick={() => setPreviewImage(url)}
                          />
                          <div className="absolute bottom-2 right-2 flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setPreviewImage(url)}
                              className="h-8 w-8 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                              aria-label="拡大表示"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDownload(url, i)}
                              className="h-8 w-8 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                              aria-label="ダウンロード"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Processing indicator */}
                {isProcessing && (
                  <div className="glass-card p-8 flex flex-col items-center justify-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                    <p className="text-sm font-medium">AIが画像を生成中...</p>
                    <p className="text-xs text-muted-foreground mt-1">処理には数秒〜数十秒かかります</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Controls Panel */}
          <div className="w-full lg:w-[380px] shrink-0 space-y-3">
            {/* Basic Adjustments */}
            <CollapsibleSection
              title="基本調整"
              icon={<Sun className="h-4 w-4" />}
              expanded={expandedSections.basic}
              onToggle={() => toggleSection("basic")}
            >
              <div className="space-y-4">
                <SliderControl
                  label="明るさ"
                  value={params.brightness}
                  onChange={(v) => updateParam("brightness", v)}
                  min={-5}
                  max={5}
                />
                <SliderControl
                  label="コントラスト"
                  value={params.contrast}
                  onChange={(v) => updateParam("contrast", v)}
                  min={-5}
                  max={5}
                />
                <SliderControl
                  label="彩度"
                  value={params.saturation}
                  onChange={(v) => updateParam("saturation", v)}
                  min={-5}
                  max={5}
                />
                <SliderControl
                  label="シャープネス"
                  value={params.sharpness}
                  onChange={(v) => updateParam("sharpness", v)}
                  min={-5}
                  max={5}
                />
                <div className="flex items-center justify-between">
                  <Label className="text-sm">画質向上</Label>
                  <Switch
                    checked={params.enhanceQuality}
                    onCheckedChange={(v) => updateParam("enhanceQuality", v)}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Background Processing */}
            <CollapsibleSection
              title="背景処理"
              icon={<Camera className="h-4 w-4" />}
              expanded={expandedSections.background}
              onToggle={() => toggleSection("background")}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">ポートレート風ぼかし</Label>
                  <Switch
                    checked={params.backgroundBlur}
                    onCheckedChange={(v) => updateParam("backgroundBlur", v)}
                  />
                </div>
                <div>
                  <Label className="text-sm mb-2 block">背景変更</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {bgOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateParam("backgroundType", opt.value)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          params.backgroundType === opt.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "glass-button"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">電線・電柱を消去</Label>
                  <Switch
                    checked={params.removeWires}
                    onCheckedChange={(v) => updateParam("removeWires", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">不要な人物を消去</Label>
                  <Switch
                    checked={params.removePeople}
                    onCheckedChange={(v) => updateParam("removePeople", v)}
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Style Transform */}
            <CollapsibleSection
              title="スタイル変換"
              icon={<Palette className="h-4 w-4" />}
              expanded={expandedSections.style}
              onToggle={() => toggleSection("style")}
            >
              <div className="grid grid-cols-3 gap-2">
                {styleOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateParam("styleTransform", opt.value)}
                    className={`px-2 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      params.styleTransform === opt.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "glass-button"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CollapsibleSection>

            {/* Advanced */}
            <CollapsibleSection
              title="アングル・ロケーション"
              icon={<Contrast className="h-4 w-4" />}
              expanded={expandedSections.advanced}
              onToggle={() => toggleSection("advanced")}
            >
              <div className="space-y-3">
                <div>
                  <Label className="text-sm mb-1.5 block">アングル変更</Label>
                  <input
                    type="text"
                    placeholder="例: 俯瞰、ローアングル、正面"
                    value={params.angleChange}
                    onChange={(e) => updateParam("angleChange", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm glass-input"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">ロケーション変更</Label>
                  <input
                    type="text"
                    placeholder="例: 海辺、森の中、都会のビル街"
                    value={params.locationChange}
                    onChange={(e) => updateParam("locationChange", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm glass-input"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Custom Prompt */}
            <CollapsibleSection
              title="カスタム指示"
              icon={<Sparkles className="h-4 w-4" />}
              expanded={expandedSections.custom}
              onToggle={() => toggleSection("custom")}
            >
              <Textarea
                placeholder="AIへの自由な指示を入力してください。例: 空をもっと青くして、全体的に温かみのある色調にしてください"
                value={params.customPrompt}
                onChange={(e) => updateParam("customPrompt", e.target.value)}
                className="glass-input min-h-[80px] text-sm"
              />
            </CollapsibleSection>

            {/* Output Settings & Generate */}
            <div className="glass-card p-4 space-y-4">
              <div>
                <Label className="text-sm mb-2 block">
                  <ImageIcon className="h-3.5 w-3.5 inline mr-1.5" />
                  生成枚数: {params.numberOfImages}枚
                </Label>
                <Slider
                  value={[params.numberOfImages]}
                  onValueChange={([v]) => updateParam("numberOfImages", v)}
                  min={1}
                  max={4}
                  step={1}
                  className="w-full"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!originalImage || isProcessing}
                className="w-full btn-gradient text-white border-0 py-5 text-sm font-semibold shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    画像を生成
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Fullscreen Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setPreviewImage(null)}
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewImage}
            alt="プレビュー"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute bottom-6 right-6 h-10 px-4 rounded-lg bg-white/10 text-white flex items-center gap-2 hover:bg-white/20 transition-colors text-sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(previewImage, 0);
            }}
          >
            <Download className="h-4 w-4" />
            ダウンロード
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function SliderControl({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground w-8 text-right">
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={1}
        className="w-full"
      />
    </div>
  );
}
