import { z } from "zod";
import { subscribedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { calculateCostYen } from "@shared/shozai-types";
import type { AnalysisResult, DiagnosisResult, TokenUsage } from "@shared/shozai-types";

// ============ 分析エンドポイント ============
const analyzeSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      base64: z.string(),
    })
  ).min(1, "ファイルを1つ以上アップロードしてください"),
  profile: z.object({
    industry: z.string(),
    address: z.string(),
    url: z.string(),
  }),
});

// ============ 診断エンドポイント ============
const diagnoseSchema = z.object({
  analysis: z.object({
    serviceSummary: z.string(),
    pricingAndContract: z.string(),
    contractPeriod: z.string(),
    optionsAndBenefits: z.string(),
    salesTactics: z.string(),
    concerns: z.string(),
  }),
  profile: z.object({
    industry: z.string(),
    address: z.string(),
    url: z.string(),
  }),
});

export const shozaiRouter = router({
  // フェーズ3: 資料分析
  analyze: subscribedProcedure
    .input(analyzeSchema)
    .mutation(async ({ input }) => {
      const { files, profile } = input;

      // Build multimodal content for LLM
      const contentParts: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
      > = [];

      contentParts.push({
        type: "text",
        text: `あなたは商材分析の専門家です。以下のアップロードされた資料（営業資料・見積書・提案書等）を詳細に分析し、構造化データとして抽出してください。

ユーザー情報:
- 業種: ${profile.industry}
- 住所: ${profile.address || "未入力"}
- URL: ${profile.url || "未入力"}

以下の項目を日本語で詳しく抽出してください:
1. サービス概要: 提案されているサービスや商品の概要
2. 料金体系と契約内容: 料金、支払い条件、含まれるサービス範囲
3. 契約期間: 最低契約期間、自動更新の有無、解約条件
4. オプションや特典: 追加オプション、キャンペーン、特典
5. 営業トークの特徴: 煽り文句、限定感の演出、過度な約束など
6. 懸念点: 不自然な箇所、隠れたコスト、注意すべき条項

資料が読み取れない場合や不明な項目は「情報なし」と記載してください。`,
      });

      // Add file content
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: file.base64,
              detail: "high",
            },
          });
        } else if (file.type === "application/pdf") {
          // For PDF, send as image_url with data URI (Gemini supports PDF via data URI)
          contentParts.push({
            type: "image_url",
            image_url: {
              url: file.base64,
              detail: "high",
            },
          });
        }
      }

      const result = await invokeLLM({
        messages: [
          {
            role: "user",
            content: contentParts,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "analysis_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                serviceSummary: { type: "string", description: "サービス概要" },
                pricingAndContract: { type: "string", description: "料金体系と契約内容" },
                contractPeriod: { type: "string", description: "契約期間" },
                optionsAndBenefits: { type: "string", description: "オプションや特典" },
                salesTactics: { type: "string", description: "営業トークの特徴" },
                concerns: { type: "string", description: "懸念点" },
              },
              required: [
                "serviceSummary",
                "pricingAndContract",
                "contractPeriod",
                "optionsAndBenefits",
                "salesTactics",
                "concerns",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = result.choices[0]?.message?.content;
      const textContent = typeof content === "string" ? content : "";
      const analysis: AnalysisResult = JSON.parse(textContent);

      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
        estimatedCostYen: calculateCostYen(
          result.usage?.prompt_tokens ?? 0,
          result.usage?.completion_tokens ?? 0
        ),
      };

      return { analysis, tokenUsage };
    }),

  // フェーズ4: AI診断
  diagnose: subscribedProcedure
    .input(diagnoseSchema)
    .mutation(async ({ input }) => {
      const { analysis, profile } = input;

      const prompt = `あなたは中小企業向けの経営コンサルタント「商材ドクター」です。
以下の情報をもとに、この商材の契約について専門的な診断を行ってください。

【ユーザー属性】
- 業種: ${profile.industry}
- 所在地: ${profile.address || "未入力"}
- URL: ${profile.url || "未入力"}

【資料分析結果】
- サービス概要: ${analysis.serviceSummary}
- 料金体系と契約内容: ${analysis.pricingAndContract}
- 契約期間: ${analysis.contractPeriod}
- オプションや特典: ${analysis.optionsAndBenefits}
- 営業トークの特徴: ${analysis.salesTactics}
- 懸念点: ${analysis.concerns}

以下の観点で診断してください:
1. 妥当性チェック: 料金や内容の整合性を評価
2. 相場比較: ユーザーの業種・地域における一般的な相場との乖離を分析
3. メリット: この商材を契約するメリット（箇条書き）
4. デメリット: この商材を契約するデメリット（箇条書き）
5. 過剰請求や無駄な項目の指摘: 不要なオプションや過剰な料金設定があれば警告
6. 契約前の注意点: 契約前に確認すべき事項
7. 総合判定: 「おすすめ」「要検討」「おすすめしない」の3段階で判定
8. 判定理由: 総合判定の理由を簡潔に要約

厳格かつ公正に、ユーザーの利益を最優先に判断してください。`;

      const result = await invokeLLM({
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "diagnosis_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                validityCheck: { type: "string", description: "妥当性チェック" },
                marketComparison: { type: "string", description: "相場比較" },
                merits: {
                  type: "array",
                  items: { type: "string" },
                  description: "メリット一覧",
                },
                demerits: {
                  type: "array",
                  items: { type: "string" },
                  description: "デメリット一覧",
                },
                overchargeWarnings: {
                  type: "array",
                  items: { type: "string" },
                  description: "過剰請求・無駄な項目の警告",
                },
                preContractNotes: {
                  type: "array",
                  items: { type: "string" },
                  description: "契約前の注意点",
                },
                verdict: {
                  type: "string",
                  enum: ["おすすめ", "要検討", "おすすめしない"],
                  description: "総合判定",
                },
                verdictReason: { type: "string", description: "判定理由の要約" },
              },
              required: [
                "validityCheck",
                "marketComparison",
                "merits",
                "demerits",
                "overchargeWarnings",
                "preContractNotes",
                "verdict",
                "verdictReason",
              ],
              additionalProperties: false,
            },
          },
        },
      });

      const content = result.choices[0]?.message?.content;
      const textContent = typeof content === "string" ? content : "";
      const diagnosis: DiagnosisResult = JSON.parse(textContent);

      const tokenUsage: TokenUsage = {
        promptTokens: result.usage?.prompt_tokens ?? 0,
        completionTokens: result.usage?.completion_tokens ?? 0,
        totalTokens: result.usage?.total_tokens ?? 0,
        estimatedCostYen: calculateCostYen(
          result.usage?.prompt_tokens ?? 0,
          result.usage?.completion_tokens ?? 0
        ),
      };

      return { diagnosis, tokenUsage };
    }),
});
