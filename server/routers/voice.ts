import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

const SPEAKER_LABELS = ["話者1", "話者2", "話者3", "話者4"];

function getSpeakerPrompt(speakerCount: number | null): string {
  if (speakerCount === null || speakerCount === 0) {
    return `話者の数は自動で判断してください。`;
  }
  return `話者は${speakerCount}人です。[話者1]から[話者${speakerCount}]までのラベルを使用してください。`;
}

export const voiceRouter = router({
  transcribe: protectedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/webm"),
      speakerCount: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const { audioBase64, mimeType, speakerCount } = input;

      const systemPrompt = `あなたは高精度な音声書き起こしの専門家です。以下のルールに厳密に従って書き起こしを行ってください：

1. 話者のラベル付けルール：
   - ${getSpeakerPrompt(speakerCount)}
   - 必ず「[話者1]:」「[話者2]:」のような形式を使用してください
   - 「話1」「Aさん」「Speaker1」などの表記は絶対に使用しないでください
   - 話者が変わるたびに改行し、新しい話者ラベルを付けてください

2. 書き起こしの品質：
   - 聞き取れた内容を正確に文字起こししてください
   - 句読点を適切に使用してください
   - 聞き取れない部分は「（聞き取れず）」と記載してください

3. 出力形式：
   [話者1]: 発言内容
   [話者2]: 発言内容
   ...

音声を書き起こしてください。`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "file_url",
                file_url: {
                  url: `data:${mimeType};base64,${audioBase64}`,
                  mime_type: mimeType as "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4",
                },
              },
              {
                type: "text",
                text: "この音声を書き起こしてください。",
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const transcription = typeof content === "string" ? content : "";
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        transcription,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),

  summarize: protectedProcedure
    .input(z.object({
      transcription: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { transcription } = input;

      const systemPrompt = `あなたは優秀なビジネスアナリストです。以下の書き起こしテキストを分析し、構造化された要約を作成してください。

出力形式：
## 概要
（会話の全体的な内容を2-3文で要約）

## 重要ポイント
- ポイント1
- ポイント2
- ポイント3
（重要な議論点や決定事項を箇条書きで）

## ToDo・アクションアイテム
- [ ] タスク1（担当者がわかれば記載）
- [ ] タスク2
（会話中で言及されたタスクや次のステップ）

## その他メモ
（補足情報や注意点があれば）`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `以下の書き起こしテキストを要約してください：\n\n${transcription}` },
        ],
      });

      const summaryContent = response.choices[0]?.message?.content;
      const summary = typeof summaryContent === "string" ? summaryContent : "";
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        summary,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),

  generateMinutes: protectedProcedure
    .input(z.object({
      transcription: z.string(),
      template: z.enum(["business", "medical"]),
      metadata: z.object({
        meetingName: z.string().optional(),
        date: z.string().optional(),
        participants: z.string().optional(),
        location: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { transcription, template, metadata } = input;

      let systemPrompt = "";

      if (template === "business") {
        systemPrompt = `あなたは優秀な秘書です。以下の書き起こしテキストから、ビジネス会議の議事録を作成してください。

出力形式：
# 議事録

## 基本情報
- 会議名: ${metadata?.meetingName || "（書き起こしから推測）"}
- 日時: ${metadata?.date || "（書き起こしから推測）"}
- 場所: ${metadata?.location || "（書き起こしから推測）"}
- 参加者: ${metadata?.participants || "（書き起こしから推測）"}

## 議題
（議論された主な議題を箇条書きで）

## 議論内容
（各議題についての議論の要点）

## 決定事項
（会議で決定された事項）

## アクションアイテム
| 担当者 | タスク | 期限 |
|--------|--------|------|
| - | - | - |

## 次回予定
（次回の会議予定があれば）

## 備考
（その他の補足事項）`;
      } else {
        systemPrompt = `あなたは医療事務の専門家です。以下の書き起こしテキストから、医療カンファレンスの議事録を作成してください。

【重要な注意事項】
- 書き起こしテキストに明示的に記載されている情報のみを使用してください
- 推測や捏造は絶対に行わないでください
- 不明な情報は「記載なし」または「確認が必要」と明記してください

出力形式：
# 医療カンファレンス議事録

## 基本情報
- 会議名: ${metadata?.meetingName || "（記載なし）"}
- 日時: ${metadata?.date || "（記載なし）"}
- 参加者: ${metadata?.participants || "（記載なし）"}

## 症例検討
（検討された症例の概要）

## 議論内容
（医学的な議論の要点）

## 決定事項・治療方針
（決定された治療方針や対応）

## フォローアップ事項
（今後の経過観察や確認事項）

## 備考
（その他の補足事項）

---
※ この議事録はAIによる自動生成です。内容の正確性については必ず確認してください。`;
      }

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `以下の書き起こしテキストから議事録を作成してください：\n\n${transcription}` },
        ],
      });

      const minutesContent = response.choices[0]?.message?.content;
      const minutes = typeof minutesContent === "string" ? minutesContent : "";
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        minutes,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),

  generateKarte: protectedProcedure
    .input(z.object({
      transcription: z.string(),
      patientInfo: z.object({
        patientId: z.string().optional(),
        patientName: z.string().optional(),
        age: z.string().optional(),
        gender: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { transcription, patientInfo } = input;

      const systemPrompt = `あなたは経験豊富な医療従事者です。以下の書き起こしテキストから、SOAP形式のカルテを作成してください。

【重要な注意事項】
- 書き起こしテキストに明示的に記載されている情報のみを使用してください
- 推測や捏造は絶対に行わないでください
- 不明な情報は「情報なし」と明記してください
- 医学的判断は必ず医師が確認してください

出力形式：
# カルテ（SOAP形式）

## 患者情報
- 患者ID: ${patientInfo?.patientId || "（情報なし）"}
- 氏名: ${patientInfo?.patientName || "（情報なし）"}
- 年齢: ${patientInfo?.age || "（情報なし）"}
- 性別: ${patientInfo?.gender || "（情報なし）"}

## S（Subjective：主観的情報）
（患者の訴え、症状、病歴など患者から得られた情報）

## O（Objective：客観的情報）
（検査結果、バイタルサイン、身体所見など客観的なデータ）

## A（Assessment：評価）
（診断、問題点の評価）

## P（Plan：計画）
（治療計画、処方、検査予定、フォローアップ計画）

---
※ このカルテはAIによる自動生成です。内容の正確性については必ず医師が確認してください。`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `以下の書き起こしテキストからSOAP形式のカルテを作成してください：\n\n${transcription}` },
        ],
      });

      const karteContent = response.choices[0]?.message?.content;
      const karte = typeof karteContent === "string" ? karteContent : "";
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        karte,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),
});
