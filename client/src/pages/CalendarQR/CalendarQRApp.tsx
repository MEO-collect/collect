import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Calendar,
  CalendarPlus,
  Clock,
  Download,
  MapPin,
  Plus,
  QrCode,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";

// ============ Types ============
interface ScheduleItem {
  id: string;
  name: string;
  calendarTitle: string;
  daysFromToday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  memo: string;
  location: string;
}

// ============ Default Data ============
const DEFAULT_SCHEDULES: ScheduleItem[] = [
  {
    id: "default-1",
    name: "トリミング",
    calendarTitle: "ペットのトリミング予約",
    daysFromToday: 30,
    startHour: 10,
    startMinute: 0,
    endHour: 11,
    endMinute: 0,
    memo: "シャンプー＆カットコース",
    location: "ペットサロン ABC",
  },
  {
    id: "default-2",
    name: "ワクチン接種",
    calendarTitle: "ワクチン接種",
    daysFromToday: 90,
    startHour: 14,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    memo: "混合ワクチン（年1回）",
    location: "○○動物病院",
  },
  {
    id: "default-3",
    name: "定期検診",
    calendarTitle: "定期健康診断",
    daysFromToday: 180,
    startHour: 9,
    startMinute: 30,
    endHour: 11,
    endMinute: 0,
    memo: "血液検査・レントゲン",
    location: "○○動物病院",
  },
  {
    id: "default-4",
    name: "フィラリア予防",
    calendarTitle: "フィラリア予防薬投与",
    daysFromToday: 30,
    startHour: 10,
    startMinute: 0,
    endHour: 10,
    endMinute: 30,
    memo: "毎月1回投与",
    location: "",
  },
  {
    id: "default-5",
    name: "歯科クリーニング",
    calendarTitle: "ペット歯科クリーニング",
    daysFromToday: 365,
    startHour: 13,
    startMinute: 0,
    endHour: 15,
    endMinute: 0,
    memo: "年1回の歯石除去",
    location: "○○動物病院",
  },
];

const STORAGE_KEY = "calendar-qr-schedules";

// ============ Helpers ============
function generateId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Get target date with specified time in JST (Asia/Tokyo) */
function getTargetDateJST(
  daysFromToday: number,
  hour: number,
  minute: number
): { year: number; month: number; day: number; hour: number; minute: number } {
  // Calculate the target date in JST
  const now = new Date();
  // Get current JST date components
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  jstNow.setDate(jstNow.getDate() + daysFromToday);

  return {
    year: jstNow.getFullYear(),
    month: jstNow.getMonth() + 1,
    day: jstNow.getDate(),
    hour,
    minute,
  };
}

function formatDateFromJST(jst: { year: number; month: number; day: number }): string {
  // Create a date string for display
  const d = new Date(jst.year, jst.month - 1, jst.day);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateCompactFromJST(jst: { month: number; day: number }): string {
  const d = new Date(2026, jst.month - 1, jst.day);
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTime(hour: number, minute: number): string {
  return `${padTwo(hour)}:${padTwo(minute)}`;
}

/** Format JST date/time as YYYYMMDDTHHMMSS (no Z suffix = local time) */
function fmtJST(jst: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string {
  return `${jst.year}${padTwo(jst.month)}${padTwo(jst.day)}T${padTwo(jst.hour)}${padTwo(jst.minute)}00`;
}

function toGoogleCalendarUrl(item: ScheduleItem): string {
  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);
  const endJST = getTargetDateJST(item.daysFromToday, item.endHour, item.endMinute);

  // Use local time format (no Z) with ctz parameter
  // This tells Google Calendar "these times are in the specified timezone"
  const dates = `${fmtJST(startJST)}/${fmtJST(endJST)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.calendarTitle,
    dates,
    details: item.memo,
    location: item.location,
    ctz: "Asia/Tokyo",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toICalendarData(item: ScheduleItem): string {
  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);
  const endJST = getTargetDateJST(item.daysFromToday, item.endHour, item.endMinute);

  const now = new Date();
  const nowJST = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const stampJST = {
    year: nowJST.getFullYear(),
    month: nowJST.getMonth() + 1,
    day: nowJST.getDate(),
    hour: nowJST.getHours(),
    minute: nowJST.getMinutes(),
  };

  const uid = `${Date.now()}@calendar-qr`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CalendarQR//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Asia/Tokyo:${fmtJST(startJST)}`,
    `DTEND;TZID=Asia/Tokyo:${fmtJST(endJST)}`,
    `DTSTAMP:${fmtJST(stampJST)}Z`,
    `UID:${uid}`,
    `SUMMARY:${item.calendarTitle}`,
    item.memo ? `DESCRIPTION:${item.memo.replace(/\n/g, "\\n")}` : "",
    item.location ? `LOCATION:${item.location}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return lines;
}

// ============ Time Picker Component ============
function TimePicker({
  label,
  hour,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  label: string;
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <select
          value={hour}
          onChange={(e) => onHourChange(Number(e.target.value))}
          className="flex-1 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {padTwo(i)}
            </option>
          ))}
        </select>
        <span className="text-sm font-medium">:</span>
        <select
          value={minute}
          onChange={(e) => onMinuteChange(Number(e.target.value))}
          className="flex-1 h-9 rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {[0, 15, 30, 45].map((m) => (
            <option key={m} value={m}>
              {padTwo(m)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ============ Sub-components ============

function ScheduleCard({
  item,
  onSelect,
  onDelete,
}: {
  item: ScheduleItem;
  onSelect: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
}) {
  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);

  return (
    <div
      className="glass-card group relative overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
      onClick={() => onSelect(item)}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="h-4.5 w-4.5 text-primary" />
              </div>
              <h3 className="font-semibold text-base truncate">{item.name}</h3>
            </div>
            <div className="ml-11 space-y-1.5">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{item.daysFromToday}日後</span>
                <span className="mx-1.5 text-border">|</span>
                {formatDateCompactFromJST(startJST)}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                {formatTime(item.startHour, item.startMinute)} 〜 {formatTime(item.endHour, item.endMinute)}
              </p>
              {item.location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.location}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="shrink-0 p-2 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            aria-label={`${item.name}を削除`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function AddScheduleForm({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: Omit<ScheduleItem, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [calendarTitle, setCalendarTitle] = useState("");
  const [daysFromToday, setDaysFromToday] = useState(30);
  const [startHour, setStartHour] = useState(10);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(11);
  const [endMinute, setEndMinute] = useState(0);
  const [memo, setMemo] = useState("");
  const [location, setLocation] = useState("");

  const previewJST = getTargetDateJST(daysFromToday, startHour, startMinute);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("予定名を入力してください");
      return;
    }
    if (daysFromToday < 0) {
      toast.error("日数は0以上を入力してください");
      return;
    }
    // Validate end time is after start time
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) {
      toast.error("終了時間は開始時間より後にしてください");
      return;
    }
    onAdd({
      name: name.trim(),
      calendarTitle: calendarTitle.trim() || name.trim(),
      daysFromToday,
      startHour,
      startMinute,
      endHour,
      endMinute,
      memo: memo.trim(),
      location: location.trim(),
    });
    setName("");
    setCalendarTitle("");
    setDaysFromToday(30);
    setStartHour(10);
    setStartMinute(0);
    setEndHour(11);
    setEndMinute(0);
    setMemo("");
    setLocation("");
    onClose();
    toast.success("予定を追加しました");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            新しい予定を追加
          </DialogTitle>
          <DialogDescription>
            定期的な予定を登録して、QRコードを生成できます
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">予定名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              placeholder="例：トリミング"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="calendarTitle">カレンダー件名</Label>
            <Input
              id="calendarTitle"
              placeholder="空欄の場合は予定名が使われます"
              value={calendarTitle}
              onChange={(e) => setCalendarTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="days">日数（今日から何日後）</Label>
            <Input
              id="days"
              type="number"
              min={0}
              value={daysFromToday}
              onChange={(e) => setDaysFromToday(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              予定日: {formatDateFromJST(previewJST)}
            </p>
          </div>

          {/* 時間指定 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              時間
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <TimePicker
                label="開始"
                hour={startHour}
                minute={startMinute}
                onHourChange={setStartHour}
                onMinuteChange={setStartMinute}
              />
              <TimePicker
                label="終了"
                hour={endHour}
                minute={endMinute}
                onHourChange={setEndHour}
                onMinuteChange={setEndMinute}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatTime(startHour, startMinute)} 〜 {formatTime(endHour, endMinute)}（日本時間）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">場所</Label>
            <Input
              id="location"
              placeholder="例：○○動物病院"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="memo">詳細メモ</Label>
            <Textarea
              id="memo"
              placeholder="例：シャンプー＆カットコース"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} className="btn-gradient text-white border-0">
            追加する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QRCodeDisplay({
  item,
  open,
  onClose,
}: {
  item: ScheduleItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"google" | "iphone">("google");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateQR = useCallback(async () => {
    if (!item) return;
    setIsGenerating(true);
    try {
      const data =
        mode === "google" ? toGoogleCalendarUrl(item) : toICalendarData(item);

      const url = await QRCode.toDataURL(data, {
        width: 300,
        margin: 2,
        color: {
          dark: "#1a1a2e",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error("QR generation error:", err);
      toast.error("QRコードの生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  }, [item, mode]);

  useEffect(() => {
    if (open && item) {
      generateQR();
    }
  }, [open, item, generateQR]);

  const handleDownload = () => {
    if (!qrDataUrl || !item) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `${item.name}-${mode === "google" ? "google" : "iphone"}-calendar-qr.png`;
    a.click();
    toast.success("QRコード画像をダウンロードしました");
  };

  if (!item) return null;

  const startJST = getTargetDateJST(item.daysFromToday, item.startHour, item.startMinute);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {item.name}
          </DialogTitle>
          <DialogDescription>
            QRコードをスキャンしてカレンダーに登録
          </DialogDescription>
        </DialogHeader>

        {/* 予定情報 */}
        <div className="rounded-xl bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">予定日</span>
            <span className="font-medium">{formatDateFromJST(startJST)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">時間</span>
            <span className="font-medium">
              {formatTime(item.startHour, item.startMinute)} 〜 {formatTime(item.endHour, item.endMinute)}
            </span>
          </div>
          {item.location && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">場所</span>
              <span className="font-medium">{item.location}</span>
            </div>
          )}
          {item.memo && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">メモ</span>
              <span className="font-medium text-right max-w-[60%]">{item.memo}</span>
            </div>
          )}
        </div>

        {/* カレンダー形式切り替え */}
        <div className="flex rounded-xl bg-muted/50 p-1 gap-1">
          <button
            onClick={() => setMode("google")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === "google"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Google
          </button>
          <button
            onClick={() => setMode("iphone")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === "iphone"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="h-4 w-4" />
            iPhone
          </button>
        </div>

        {/* QRコード表示 */}
        <div className="flex flex-col items-center py-4">
          {isGenerating ? (
            <div className="w-[300px] h-[300px] rounded-2xl bg-muted/30 animate-pulse flex items-center justify-center">
              <QrCode className="h-12 w-12 text-muted-foreground/30" />
            </div>
          ) : qrDataUrl ? (
            <div className="relative">
              <div className="rounded-2xl border-2 border-border/50 p-3 bg-white">
                <img
                  src={qrDataUrl}
                  alt={`${item.name}のQRコード`}
                  className="w-[280px] h-[280px]"
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground mt-3 text-center">
            {mode === "google"
              ? "スキャンするとGoogleカレンダーが開きます"
              : "iPhoneのカメラでスキャンするとカレンダーに追加できます"}
          </p>
        </div>

        {/* アクションボタン */}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="sm:flex-1">
            閉じる
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="btn-gradient text-white border-0 sm:flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            QRコードを保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Main Component ============
export default function CalendarQRApp() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleItem | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load from LocalStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migrate old data without time fields
          const migrated = parsed.map((item: any) => ({
            ...item,
            startHour: item.startHour ?? 10,
            startMinute: item.startMinute ?? 0,
            endHour: item.endHour ?? 11,
            endMinute: item.endMinute ?? 0,
          }));
          setSchedules(migrated);
        } else {
          setSchedules(DEFAULT_SCHEDULES);
        }
      } else {
        setSchedules(DEFAULT_SCHEDULES);
      }
    } catch {
      setSchedules(DEFAULT_SCHEDULES);
    }
    setInitialized(true);
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if (initialized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
    }
  }, [schedules, initialized]);

  const handleAdd = (item: Omit<ScheduleItem, "id">) => {
    setSchedules((prev) => [...prev, { ...item, id: generateId() }]);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("予定を削除しました");
  };

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* 装飾用のフローティングオーブ */}
      <div
        className="floating-orb w-72 h-72 bg-primary/15 top-[-5%] right-[-10%]"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="floating-orb w-56 h-56 bg-blue-400/15 bottom-[10%] left-[-5%]"
        style={{ animationDelay: "3s" }}
      />

      {/* ヘッダー */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="container flex h-14 items-center gap-3">
          <button
            onClick={() => (window.location.href = "/home")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">ホーム</span>
          </button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <QrCode className="h-4 w-4 text-primary" />
            </div>
            <h1 className="font-semibold text-base">カレンダーQR</h1>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="btn-gradient text-white border-0 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">予定を追加</span>
          </Button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="container py-6 relative z-10">
        {/* 説明セクション */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold mb-2">
            カレンダー登録用QRコード
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            予定をタップしてQRコードを生成。スキャンするだけでGoogleカレンダーやiPhoneカレンダーに予定を登録できます。
          </p>
        </div>

        {/* 予定一覧 */}
        {schedules.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mx-auto mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">予定がありません</h3>
            <p className="text-sm text-muted-foreground mb-6">
              「予定を追加」ボタンから新しい予定を作成してください
            </p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="btn-gradient text-white border-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              最初の予定を追加
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((item) => (
              <ScheduleCard
                key={item.id}
                item={item}
                onSelect={setSelectedItem}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </main>

      {/* 新規追加フォーム */}
      <AddScheduleForm
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onAdd={handleAdd}
      />

      {/* QRコード表示 */}
      <QRCodeDisplay
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {/* 削除確認ダイアログ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予定を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name}」を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
