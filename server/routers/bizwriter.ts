import { z } from "zod";
import { subscribedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { makeRequest, type PlaceDetailsResult, type PlacesSearchResult } from "../_core/map";
import type { StoreProfile, GeneratedContent, OutputFormat, Tone, Templates } from "@shared/bizwriter-types";
import { FORMAT_CHAR_LIMITS } from "@shared/bizwriter-types";

// ============ Gemini Service Functions ============

function buildComplianceRules(industry: string): string {
  if (industry === "クリニック") {
    return `【医療広告ガイドライン厳守】
- 「絶対治る」「100%効果がある」「No.1」「最高」等の誇大表現は禁止
- 体験談を治療効果の証拠として使用しない
- ビフォーアフター写真の言及は避ける
- 未承認の治療法を推奨しない
- 「他院より優れている」等の比較広告は禁止`;
  }
  if (industry === "工務店") {
    return `【景品表示法・公正競争規約遵守】
- 根拠のない「最安値」「業界最安」「完全」「絶対」等の表現は禁止
- 「地域No.1」等の根拠のない優良誤認表示は禁止
- 実際と異なる施工実績や資格の記載は禁止
- 二重価格表示（不当な値引き表示）は禁止`;
  }
  return `【一般的な広告ガイドライン遵守】
- 誇大表現や虚偽の記載は避ける
- 根拠のない「No.1」「最高」等の表現は禁止`;
}

function buildFormatInstructions(format: OutputFormat, targetLength: string, customLength?: number): string {
  const hardLimit = FORMAT_CHAR_LIMITS[format];
  let lengthInstruction = "";

  if (targetLength === "カスタム" && customLength) {
    const effectiveLength = Math.min(customLength, hardLimit);
    lengthInstruction = `目安文字数: ${effectiveLength}文字`;
  } else if (targetLength === "短め") {
    lengthInstruction = `目安文字数: ${Math.min(Math.floor(hardLimit * 0.3), 200)}文字程度（簡潔に）`;
  } else if (targetLength === "標準") {
    lengthInstruction = `目安文字数: ${Math.min(Math.floor(hardLimit * 0.6), 800)}文字程度`;
  } else {
    // 推奨
    lengthInstruction = `媒体に最適な文字数で生成`;
  }

  let formatSpecific = "";
  switch (format) {
    case "Instagram投稿文":
      formatSpecific = `- Instagram向けの親しみやすい投稿文を作成
- 適切な改行で読みやすく
- 関連するハッシュタグを5個まで提案
- 絵文字を適度に使用`;
      break;
    case "公式LINE配信文":
      formatSpecific = `- LINE公式アカウントの配信メッセージとして作成
- 冒頭で読者の関心を引く
- 簡潔で読みやすい文章
- CTAを含める`;
      break;
    case "SEOブログ記事":
      formatSpecific = `- SEOを意識した構成（見出し付き）
- H2, H3の見出しをMarkdown形式で含める
- 読者に価値のある情報を提供
- 自然なキーワード配置`;
      break;
    case "GBP最新情報":
      formatSpecific = `- Googleビジネスプロフィールの「最新情報」投稿として作成
- 本文に電話番号やURLを記載しない（Googleポリシー違反）
- 簡潔で情報量のある文章
- 来店・問い合わせを促す内容`;
      break;
  }

  return `【${format}】
${formatSpecific}
- ${lengthInstruction}
- ハードリミット: 絶対に${hardLimit}文字を超えないこと`;
}

function buildSystemPrompt(
  profile: StoreProfile,
  formats: OutputFormat[],
  tone: Tone,
  targetLength: string,
  customLength: number | undefined,
  useOnlySiteInfo: boolean,
  templates: Templates | null,
  useTemplates: boolean,
  avoidRepetition: boolean
): string {
  const complianceRules = buildComplianceRules(profile.industry);

  const formatInstructions = formats
    .map((f) => buildFormatInstructions(f, targetLength, customLength))
    .join("\n\n");

  let templateInstructions = "";
  if (useTemplates && templates) {
    const templateParts = formats
      .map((f) => {
        const t = templates[f];
        if (!t || (!t.opening && !t.closing)) return null;
        return `${f}の定型文:
${t.opening ? `冒頭: 「${t.opening}」` : ""}
${t.closing ? `締め: 「${t.closing}」` : ""}`;
      })
      .filter(Boolean);
    if (templateParts.length > 0) {
      templateInstructions = `\n【定型文の適用】\n${templateParts.join("\n")}`;
    }
  }

  const siteInfoRestriction = useOnlySiteInfo
    ? `\n【重要制約】提供されたURLの情報のみを使用してください。外部知識やハルシネーション（事実でない情報の生成）を絶対に含めないでください。URLから取得できない情報については「情報なし」と明記してください。`
    : "";

  const repetitionAvoidance = avoidRepetition
    ? `\n【バリエーション生成】過去の投稿が提供されている場合、以下のルールを守ってください:
- 過去の投稿と同じ表現、フレーズ、文章構成を避ける
- 店舗情報（営業時間、サービス内容、住所等）に矛盾が生じないよう一貫性を保つ
- 新しい角度、切り口、表現で同じテーマを伝える
- 過去の投稿で使われたハッシュタグとは異なるものを選ぶ（関連性は保つ）`
    : "";

  return `あなたはSNS・ブログ・MEO投稿のプロフェッショナルライターです。
以下の店舗情報とルールに基づき、高品質な投稿文を生成してください。

【店舗情報】
- 店舗名: ${profile.storeName || "未設定"}
- 業種: ${profile.industry}
- 住所: ${profile.address || "未設定"}
- 公式サイト: ${profile.websiteUrl || "なし"}
- 参照URL: ${profile.referenceUrl || "なし"}
- 提供サービス: ${profile.services || "未設定"}
- ターゲット層: ${profile.targetAudience || "未設定"}
- キーワード: ${profile.keywords || "なし"}
- NGワード: ${profile.ngWords || "なし"}

【トーン】${tone}

${complianceRules}

【出力形式ごとの指示】
${formatInstructions}
${templateInstructions}
${siteInfoRestriction}
${repetitionAvoidance}

【出力フォーマット】
必ず以下のJSON配列形式で出力してください。他のテキストは一切含めないでください。
[
  {
    "format": "媒体名",
    "content": "生成した本文",
    "hashtags": ["ハッシュタグ1", "ハッシュタグ2"],
    "suggestions": ["改善提案1"],
    "warnings": ["ガイドライン上の注意点"]
  }
]

- hashtagsはInstagram投稿文の場合のみ含めてください。他の媒体では空配列にしてください。
- warningsにはコンプライアンス上の注意点があれば記載してください。
- suggestionsには投稿をより効果的にするための提案を記載してください。`;
}

/**
 * Resolve short URL to full URL by following redirects
 */
async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  try {
    console.log("[BizWriter] Resolving short URL:", shortUrl);
    const response = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
    });
    const resolvedUrl = response.url;
    console.log("[BizWriter] Resolved to:", resolvedUrl);
    return resolvedUrl;
  } catch (error) {
    console.error("[BizWriter] resolveShortUrl error:", error);
    return null;
  }
}

/**
 * Extract place_id from various Google Maps URL formats
 */
function extractPlaceIdFromUrl(url: string): string | null {
  try {
    // Pattern 1: /place/ URL with data parameter containing place_id
    // Example: /maps/place/.../@...data=!4m2!3m1!1sChIJN1t_tDeuEmsRUsoyG83frY4
    // Note: Hex IDs like 0x0:0xe82d3e4235aebc2f are NOT valid place_ids
    const dataMatch = url.match(/data=.*?1s([^?&:\s]+)/);
    if (dataMatch) {
      const extractedId = dataMatch[1];
      // Check if it's a hex ID (starts with 0x)
      if (extractedId.startsWith("0x")) {
        console.log("[BizWriter] Detected hex ID (not a place_id):", extractedId);
        return null; // Will use search fallback
      }
      return extractedId;
    }

    // Pattern 2: /search URL with place_id in ludocid or ftid
    const ludocidMatch = url.match(/ludocid[=:]([^&?]+)/);
    if (ludocidMatch) {
      // ludocid is a numeric ID, not a place_id
      return null; // Will use search fallback
    }

    // Pattern 3: Direct place_id parameter
    const placeIdMatch = url.match(/place_id=([^&?]+)/);
    if (placeIdMatch) {
      return placeIdMatch[1];
    }

    return null;
  } catch (error) {
    console.error("[BizWriter] extractPlaceIdFromUrl error:", error);
    return null;
  }
}

/**
 * Extract store name from Google Maps URL for search fallback
 */
function extractStoreNameFromUrl(url: string): string | null {
  try {
    // Pattern 1: /place/店舗名/
    const placeMatch = url.match(/\/place\/([^/@?]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }

    // Pattern 2: /search?q=店舗名
    const searchMatch = url.match(/[?&]q=([^&]+)/);
    if (searchMatch) {
      return decodeURIComponent(searchMatch[1].replace(/\+/g, " "));
    }

    return null;
  } catch (error) {
    console.error("[BizWriter] extractStoreNameFromUrl error:", error);
    return null;
  }
}

/**
 * Extract store information from Google Maps URL using Google Maps API
 */
async function extractStoreInfoFromMaps(mapsUrl: string): Promise<{
  storeName: string;
  address: string;
  websiteUrl: string;
} | null> {
  try {
    console.log("[BizWriter] Extracting store info from URL:", mapsUrl);

    let workingUrl = mapsUrl;

    // Step 0: If short URL, resolve it first
    if (mapsUrl.includes("maps.app.goo.gl") || mapsUrl.includes("goo.gl")) {
      const resolved = await resolveShortUrl(mapsUrl);
      if (!resolved) {
        console.error("[BizWriter] Could not resolve short URL");
        return null;
      }
      workingUrl = resolved;
    }

    // Step 1: Try to extract place_id directly from URL
    let placeId = extractPlaceIdFromUrl(workingUrl);

    // Step 2: If no place_id found, try to extract store name and search
    if (!placeId) {
      const storeName = extractStoreNameFromUrl(workingUrl);
      if (!storeName) {
        console.error("[BizWriter] Could not extract place_id or store name from URL");
        return null;
      }

      console.log("[BizWriter] Searching for place:", storeName);

      // Use Place Search API to find the place
      const searchResult = await makeRequest<PlacesSearchResult>(
        "/maps/api/place/textsearch/json",
        {
          query: storeName,
          language: "ja",
        }
      );

      if (searchResult.status !== "OK" || !searchResult.results || searchResult.results.length === 0) {
        console.error("[BizWriter] Place search failed:", searchResult.status);
        return null;
      }

      placeId = searchResult.results[0].place_id;
      console.log("[BizWriter] Found place_id via search:", placeId);
    }

    // Step 3: Get detailed information using Place Details API
    console.log("[BizWriter] Fetching place details for:", placeId);
    const detailsResult = await makeRequest<PlaceDetailsResult>(
      "/maps/api/place/details/json",
      {
        place_id: placeId,
        fields: "name,formatted_address,website,formatted_phone_number",
        language: "ja",
      }
    );

    if (detailsResult.status !== "OK" || !detailsResult.result) {
      console.error("[BizWriter] Place details failed:", detailsResult.status);
      return null;
    }

    const place = detailsResult.result;
    console.log("[BizWriter] Successfully retrieved place details:", {
      name: place.name,
      address: place.formatted_address,
      website: place.website,
    });

    return {
      storeName: place.name || "",
      address: place.formatted_address || "",
      websiteUrl: place.website || "",
    };
  } catch (error) {
    console.error("[BizWriter] extractStoreInfoFromMaps error:", error);
    return null;
  }
}

async function generateContent(
  profile: StoreProfile,
  topic: string,
  formats: OutputFormat[],
  tone: Tone,
  targetLength: string,
  customLength: number | undefined,
  useOnlySiteInfo: boolean,
  templates: Templates | null,
  useTemplates: boolean,
  history: string[],
  avoidRepetition: boolean
): Promise<GeneratedContent[]> {
  const systemPrompt = buildSystemPrompt(
    profile,
    formats,
    tone,
    targetLength,
    customLength,
    useOnlySiteInfo,
    templates,
    useTemplates,
    avoidRepetition
  );

  let userMessage = `以下のお題で、${formats.join("、")}の投稿文を生成してください。\n\nお題: ${topic}`;

  if (history.length > 0) {
    userMessage += `\n\n【過去の投稿（一貫性を保つために参照）】\n${history.slice(0, 3).join("\n---\n")}`;
  }

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const content =
    typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "";

  // Markdown記法を除去してJSONをパース
  const cleaned = content
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as GeneratedContent[];
    // 文字数ハードリミットの最終チェック
    return parsed.map((item) => {
      const limit = FORMAT_CHAR_LIMITS[item.format as OutputFormat];
      if (limit && item.content.length > limit) {
        item.content = item.content.slice(0, limit);
        item.warnings = [
          ...(item.warnings || []),
          `文字数が上限(${limit}文字)を超えたため切り詰めました`,
        ];
      }
      return {
        format: item.format,
        content: item.content || "",
        hashtags: item.hashtags || [],
        suggestions: item.suggestions || [],
        warnings: item.warnings || [],
      };
    });
  } catch (error) {
    console.error("[BizWriter] JSON parse error:", error, "Raw:", cleaned);
    throw new Error("AIの応答を解析できませんでした。もう一度お試しください。");
  }
}

// ============ tRPC Router ============

export const bizwriterRouter = router({
  extractStoreInfo: subscribedProcedure
    .input(
      z.object({
        mapsUrl: z.string().url("有効なURLを入力してください"),
      })
    )
    .mutation(async ({ input }) => {
      const result = await extractStoreInfoFromMaps(input.mapsUrl);
      if (!result) {
        return { success: false as const, error: "店舗情報を取得できませんでした。GoogleマップのURLが正しいか確認してください。" };
      }
      // http→https自動変換
      if (result.websiteUrl && result.websiteUrl.startsWith("http://")) {
        result.websiteUrl = result.websiteUrl.replace("http://", "https://");
      }
      return { success: true as const, data: result };
    }),

  generate: subscribedProcedure
    .input(
      z.object({
        profile: z.object({
          storeName: z.string(),
          address: z.string(),
          industry: z.string(),
          websiteUrl: z.string(),
          referenceUrl: z.string(),
          services: z.string(),
          targetAudience: z.string(),
          keywords: z.string(),
          ngWords: z.string(),
          preferredTone: z.string(),
        }),
        topic: z.string().min(1, "お題を入力してください"),
        formats: z.array(z.string()).min(1, "出力形式を1つ以上選択してください"),
        tone: z.string(),
        targetLength: z.string(),
        customLength: z.number().optional(),
        useOnlySiteInfo: z.boolean().default(false),
        templates: z
          .record(
            z.string(),
            z.object({ opening: z.string(), closing: z.string() })
          )
          .nullable()
          .default(null),
        useTemplates: z.boolean().default(false),
        history: z.array(z.string()).default([]),
        avoidRepetition: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // avoidRepetitionがtrueの場合、過去の生成履歴を自動取得
      let historyToUse = input.history;
      if (input.avoidRepetition && input.formats.length > 0) {
        const crypto = await import("crypto");
        const storeProfileHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(input.profile))
          .digest("hex");
        
        const { getRecentGeneratedContents } = await import("../db");
        const recentContents = await getRecentGeneratedContents(
          ctx.user.id,
          storeProfileHash,
          input.formats[0],
          5
        );
        
        historyToUse = recentContents.map((c) => c.generatedText);
      }

      const results = await generateContent(
        input.profile as StoreProfile,
        input.topic,
        input.formats as OutputFormat[],
        input.tone as Tone,
        input.targetLength,
        input.customLength,
        input.useOnlySiteInfo,
        input.templates as Templates | null,
        input.useTemplates,
        historyToUse,
        input.avoidRepetition
      );

      // 生成成功時にDBに保存
      if (input.avoidRepetition && results.length > 0) {
        const crypto = await import("crypto");
        const storeProfileHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(input.profile))
          .digest("hex");
        
        const { saveGeneratedContent } = await import("../db");
        for (const result of results) {
          await saveGeneratedContent({
            userId: ctx.user.id,
            storeProfileHash,
            format: result.format,
            generatedText: result.content,
            charCount: result.content.length,
          });
        }
      }

      return { results };
    }),
});
