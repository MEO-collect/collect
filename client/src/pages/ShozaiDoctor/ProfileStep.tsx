import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, MapPin, Globe, ArrowRight } from "lucide-react";
import type { UserProfile, Industry } from "@shared/shozai-types";
import { INDUSTRIES } from "@shared/shozai-types";

interface ProfileStepProps {
  profile: UserProfile;
  onSubmit: (profile: UserProfile) => void;
}

export function ProfileStep({ profile, onSubmit }: ProfileStepProps) {
  const [form, setForm] = useState<UserProfile>({ ...profile });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.industry) newErrors.industry = "業種を選択してください";
    if (!form.address.trim()) newErrors.address = "住所を入力してください";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(form);
    }
  };

  return (
    <Card className="border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <User className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg text-slate-900 dark:text-white">基本設定</CardTitle>
            <CardDescription className="text-xs">
              診断精度向上のため、事業情報を入力してください
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 業種 */}
        <div className="space-y-2">
          <Label htmlFor="industry" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span className="text-teal-500">*</span> 業種
          </Label>
          <Select
            value={form.industry}
            onValueChange={(v) => setForm((f) => ({ ...f, industry: v as Industry }))}
          >
            <SelectTrigger id="industry" className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600">
              <SelectValue placeholder="業種を選択" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.industry && (
            <p className="text-xs text-red-500">{errors.industry}</p>
          )}
        </div>

        {/* 住所 */}
        <div className="space-y-2">
          <Label htmlFor="address" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-teal-500" />
            <span className="text-teal-500">*</span> 住所
          </Label>
          <Input
            id="address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="例：東京都渋谷区..."
            className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 placeholder:text-slate-400"
          />
          {errors.address && (
            <p className="text-xs text-red-500">{errors.address}</p>
          )}
        </div>

        {/* URL */}
        <div className="space-y-2">
          <Label htmlFor="url" className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-teal-500" />
            URL（任意）
          </Label>
          <Input
            id="url"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://example.com"
            className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600 placeholder:text-slate-400"
          />
        </div>

        <Button
          onClick={handleSubmit}
          className="w-full bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white shadow-lg shadow-teal-500/20 h-12 text-base font-semibold"
        >
          次へ進む
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
