import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Globe, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { StoreProfile, Industry, Tone } from "@shared/bizwriter-types";
import { INDUSTRIES, TONES } from "@shared/bizwriter-types";

interface ProfileScreenProps {
  profile: StoreProfile;
  onUpdate: (profile: StoreProfile) => void;
}

export default function ProfileScreen({ profile, onUpdate }: ProfileScreenProps) {
  const [mapsUrl, setMapsUrl] = useState("");
  const extractMutation = trpc.bizwriter.extractStoreInfo.useMutation();

  const handleChange = (field: keyof StoreProfile, value: string) => {
    let finalValue = value;
    // http→https自動変換
    if ((field === "websiteUrl" || field === "referenceUrl") && value.startsWith("http://")) {
      finalValue = value.replace("http://", "https://");
    }
    onUpdate({ ...profile, [field]: finalValue });
  };

  const handleExtractFromMaps = async () => {
    if (!mapsUrl.trim()) {
      toast.error("GoogleマップのURLを入力してください");
      return;
    }
    try {
      const result = await extractMutation.mutateAsync({ mapsUrl: mapsUrl.trim() });
      if (result.success && result.data) {
        const data = result.data;
        const updated = { ...profile };
        if (data.storeName) updated.storeName = data.storeName;
        if (data.address) updated.address = data.address;
        if (data.websiteUrl) {
          updated.websiteUrl = data.websiteUrl.startsWith("http://")
            ? data.websiteUrl.replace("http://", "https://")
            : data.websiteUrl;
        }
        onUpdate(updated);
        toast.success("店舗情報を取得しました");
      } else {
        toast.error("店舗情報を取得できませんでした");
      }
    } catch {
      toast.error("情報の取得に失敗しました");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">店舗プロフィール設定</h2>
        <p className="text-sm text-muted-foreground">
          店舗情報を登録すると、より適切な文章が生成されます
        </p>
      </div>

      {/* Googleマップ自動入力 */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Googleマップから自動入力</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          GoogleマップのURLを貼り付けると、店舗名・住所・公式サイトURLを自動取得します
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://maps.google.com/..."
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleExtractFromMaps}
            disabled={extractMutation.isPending}
            className="btn-gradient text-white border-0 shrink-0"
          >
            {extractMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "情報を取得"
            )}
          </Button>
        </div>
      </div>

      {/* 入力フォーム */}
      <div className="glass-card p-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* 業種 */}
          <div className="space-y-2">
            <Label>業種</Label>
            <Select
              value={profile.industry}
              onValueChange={(v) => handleChange("industry", v as Industry)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {ind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 店舗名 */}
          <div className="space-y-2">
            <Label>店舗名</Label>
            <Input
              placeholder="例：○○クリニック"
              value={profile.storeName}
              onChange={(e) => handleChange("storeName", e.target.value)}
            />
          </div>

          {/* 住所 */}
          <div className="space-y-2 md:col-span-2">
            <Label>住所</Label>
            <Input
              placeholder="例：東京都渋谷区..."
              value={profile.address}
              onChange={(e) => handleChange("address", e.target.value)}
            />
          </div>

          {/* 公式サイトURL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              公式サイトURL
            </Label>
            <Input
              placeholder="https://example.com"
              value={profile.websiteUrl}
              onChange={(e) => handleChange("websiteUrl", e.target.value)}
            />
          </div>

          {/* 参照URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              参照URL
            </Label>
            <Input
              placeholder="https://example.com/page"
              value={profile.referenceUrl}
              onChange={(e) => handleChange("referenceUrl", e.target.value)}
            />
          </div>

          {/* 提供サービス */}
          <div className="space-y-2 md:col-span-2">
            <Label>提供サービス</Label>
            <Textarea
              placeholder="例：一般内科、小児科、予防接種、健康診断..."
              value={profile.services}
              onChange={(e) => handleChange("services", e.target.value)}
              rows={3}
            />
          </div>

          {/* ターゲット層 */}
          <div className="space-y-2 md:col-span-2">
            <Label>ターゲット層</Label>
            <Input
              placeholder="例：30〜50代の働く女性、子育て世代..."
              value={profile.targetAudience}
              onChange={(e) => handleChange("targetAudience", e.target.value)}
            />
          </div>

          {/* キーワード */}
          <div className="space-y-2">
            <Label>キーワード（カンマ区切り）</Label>
            <Input
              placeholder="例：健康診断, 予防接種, 内科"
              value={profile.keywords}
              onChange={(e) => handleChange("keywords", e.target.value)}
            />
          </div>

          {/* NGワード */}
          <div className="space-y-2">
            <Label>NGワード（カンマ区切り）</Label>
            <Input
              placeholder="例：最安値, 絶対, No.1"
              value={profile.ngWords}
              onChange={(e) => handleChange("ngWords", e.target.value)}
            />
          </div>

          {/* トーン */}
          <div className="space-y-2">
            <Label>推奨トーン</Label>
            <Select
              value={profile.preferredTone}
              onValueChange={(v) => handleChange("preferredTone", v as Tone)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {tone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>変更は自動保存されます</span>
        </div>
      </div>
    </div>
  );
}
