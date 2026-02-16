import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Eraser,
  Loader2,
  Download,
  RotateCcw,
  Maximize2,
  X,
  ClipboardPaste,
} from "lucide-react";
import { useLocation } from "wouter";

export default function MagicEraser() {
  const [, navigate] = useLocation();
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalMimeType, setOriginalMimeType] = useState("image/png");
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"mask" | "original" | "result">("mask");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const eraserMutation = trpc.image.magicEraser.useMutation({
    onSuccess: (data) => {
      setGeneratedImages(data.images);
      setViewMode("result");
      toast.success("消去が完了しました");
    },
    onError: (err) => {
      toast.error(err.message || "消去に失敗しました");
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
      setViewMode("mask");
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

  // Initialize canvas when image loads
  useEffect(() => {
    if (!originalImage || !canvasRef.current || !overlayCanvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current!;
      const overlay = overlayCanvasRef.current!;
      const container = containerRef.current!;

      // Calculate display size maintaining aspect ratio
      const containerWidth = container.clientWidth;
      const maxHeight = window.innerHeight * 0.55;
      const scale = Math.min(containerWidth / img.width, maxHeight / img.height, 1);
      const displayWidth = Math.round(img.width * scale);
      const displayHeight = Math.round(img.height * scale);

      // Set canvas to actual image dimensions for quality
      canvas.width = img.width;
      canvas.height = img.height;
      overlay.width = img.width;
      overlay.height = img.height;

      // Set display size
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      overlay.style.width = `${displayWidth}px`;
      overlay.style.height = `${displayHeight}px`;

      // Draw image on base canvas
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      // Clear overlay
      const overlayCtx = overlay.getContext("2d")!;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    };
    img.src = originalImage;
  }, [originalImage]);

  // Get canvas coordinates from event
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return null;

    const rect = overlay.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const drawBrush = (x: number, y: number) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;

    // Scale brush size relative to actual canvas size
    const rect = overlay.getBoundingClientRect();
    const scaleFactor = overlay.width / rect.width;
    const actualBrushSize = brushSize * scaleFactor;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    ctx.beginPath();
    ctx.arc(x, y, actualBrushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (viewMode !== "mask") return;
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCanvasCoords(e);
    if (coords) drawBrush(coords.x, coords.y);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || viewMode !== "mask") return;
    e.preventDefault();
    const coords = getCanvasCoords(e);
    if (coords) drawBrush(coords.x, coords.y);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleReset = () => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    setGeneratedImages([]);
    setViewMode("mask");
  };

  const handleErase = () => {
    if (!canvasRef.current || !overlayCanvasRef.current) return;

    // Merge canvases: draw image + red mask overlay
    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = canvasRef.current.width;
    mergeCanvas.height = canvasRef.current.height;
    const ctx = mergeCanvas.getContext("2d")!;

    // Draw original image
    ctx.drawImage(canvasRef.current, 0, 0);

    // Draw mask overlay (make it more opaque for AI recognition)
    const overlayCtx = overlayCanvasRef.current.getContext("2d")!;
    const overlayData = overlayCtx.getImageData(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);

    // Check if any mask was drawn
    let hasMask = false;
    for (let i = 3; i < overlayData.data.length; i += 4) {
      if (overlayData.data[i] > 0) {
        hasMask = true;
        break;
      }
    }

    if (!hasMask) {
      toast.error("消去したい部分を赤色で塗ってください");
      return;
    }

    // Make mask fully red and opaque where drawn
    for (let i = 0; i < overlayData.data.length; i += 4) {
      if (overlayData.data[i + 3] > 0) {
        overlayData.data[i] = 255;     // R
        overlayData.data[i + 1] = 0;   // G
        overlayData.data[i + 2] = 0;   // B
        overlayData.data[i + 3] = 255; // A
      }
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = overlayCanvasRef.current.width;
    tempCanvas.height = overlayCanvasRef.current.height;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.putImageData(overlayData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0);

    // Convert to base64
    const dataUrl = mergeCanvas.toDataURL("image/png");
    const base64Data = dataUrl.split(",")[1];

    eraserMutation.mutate({
      imageBase64: base64Data,
      imageMimeType: "image/png",
    });
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `erased-image.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("ダウンロードに失敗しました");
    }
  };

  const isProcessing = eraserMutation.isPending;

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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 text-white">
              <Eraser className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold">マジック消しゴム</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 relative z-10">
        {!originalImage ? (
          /* Upload Area */
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="glass-card p-8 flex flex-col items-center justify-center min-h-[400px] cursor-pointer hover-lift max-w-2xl mx-auto"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 mb-4">
              <Upload className="h-8 w-8 text-rose-500" />
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
          <div className="max-w-4xl mx-auto space-y-4">
            {/* View Mode Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("mask")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "mask"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "glass-button"
                }`}
              >
                マスク編集
              </button>
              <button
                onClick={() => setViewMode("original")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === "original"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "glass-button"
                }`}
              >
                元の画像
              </button>
              {generatedImages.length > 0 && (
                <button
                  onClick={() => setViewMode("result")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === "result"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "glass-button"
                  }`}
                >
                  消去結果
                </button>
              )}
            </div>

            {/* Canvas / Preview Area */}
            <div className="glass-card p-3">
              {viewMode === "mask" && (
                <div
                  ref={containerRef}
                  className="relative inline-block w-full"
                  style={{ touchAction: "none" }}
                >
                  <canvas
                    ref={canvasRef}
                    className="rounded-lg bg-black/5 block"
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute top-0 left-0 rounded-lg"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                  />
                </div>
              )}

              {viewMode === "original" && (
                <img
                  src={originalImage}
                  alt="元の画像"
                  className="w-full rounded-lg object-contain max-h-[60vh] bg-black/5"
                />
              )}

              {viewMode === "result" && generatedImages.length > 0 && (
                <div className="relative group">
                  <img
                    src={generatedImages[0]}
                    alt="消去結果"
                    className="w-full rounded-lg object-contain max-h-[60vh] bg-black/5 cursor-pointer"
                    onClick={() => setPreviewImage(generatedImages[0])}
                  />
                  <div className="absolute bottom-2 right-2 flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setPreviewImage(generatedImages[0])}
                      className="h-8 w-8 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      aria-label="拡大表示"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDownload(generatedImages[0])}
                      className="h-8 w-8 rounded-lg bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      aria-label="ダウンロード"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="glass-card p-8 flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-rose-500 mb-3" />
                <p className="text-sm font-medium">AIが消去処理中...</p>
                <p className="text-xs text-muted-foreground mt-1">処理には数秒〜数十秒かかります</p>
              </div>
            )}

            {/* Controls */}
            <div className="glass-card p-4 space-y-4">
              {viewMode === "mask" && (
                <div>
                  <Label className="text-sm mb-2 block">
                    ブラシサイズ: {brushSize}px
                  </Label>
                  <Slider
                    value={[brushSize]}
                    onValueChange={([v]) => setBrushSize(v)}
                    min={5}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
              )}

              <div className="flex gap-2">
                {viewMode === "mask" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleReset}
                      className="flex-1"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      リセット
                    </Button>
                    <Button
                      onClick={handleErase}
                      disabled={isProcessing}
                      className="flex-1 bg-gradient-to-r from-rose-500 to-pink-600 text-white border-0 hover:from-rose-600 hover:to-pink-700"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          処理中...
                        </>
                      ) : (
                        <>
                          <Eraser className="h-4 w-4 mr-2" />
                          消去する
                        </>
                      )}
                    </Button>
                  </>
                )}

                {viewMode === "result" && generatedImages.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setViewMode("mask")}
                      className="flex-1"
                    >
                      もう一度編集
                    </Button>
                    <Button
                      onClick={() => handleDownload(generatedImages[0])}
                      className="flex-1 bg-gradient-to-r from-rose-500 to-pink-600 text-white border-0 hover:from-rose-600 hover:to-pink-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      ダウンロード
                    </Button>
                  </>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOriginalImage(null);
                  setGeneratedImages([]);
                  setViewMode("mask");
                }}
                className="w-full text-xs text-muted-foreground"
              >
                別の画像を選択
              </Button>
            </div>

            {/* Usage Hint */}
            {viewMode === "mask" && (
              <p className="text-xs text-muted-foreground text-center">
                消したい部分を赤色で塗りつぶしてから「消去する」ボタンを押してください
              </p>
            )}
          </div>
        )}
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
              if (previewImage) handleDownload(previewImage);
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
