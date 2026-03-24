import { z } from "zod";
import { subscribedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getKarteFormat, DEFAULT_KARTE_FORMAT_ID } from "../../shared/karteFormats";

const SPEAKER_LABELS = ["話者1", "話者2", "話者3", "話者4"];

/**
 * 書き起こし結果のハルシネーションループを検出・除去する
 *
 * Whisper系モデルは無音・低品質音声で同じ短いフレーズを
 * 何十回も繰り返す「ハルシネーションループ」を起こすことがある。
 * このユーティリティは連続する重複セグメントを検出して除去する。
 *
 * アルゴリズム:
 * 1. 行ごとに分割
 * 2. 連続する同一テキスト（話者ラベルを除いた発言内容）が
 *    MAX_REPEAT回以上続いたら、最初の1回だけ残して後続を削除
 * 3. 削除した場合は末尾に注記を追加
 */
export function removeHallucinationLoop(
  text: string,
  maxRepeat: number = 3,
): { cleaned: string; hadLoop: boolean } {
  if (!text) return { cleaned: text, hadLoop: false };

  const lines = text.split("\n");
  const result: string[] = [];
  let hadLoop = false;

  // 直近のN行の「発言内容」（話者ラベルを除いた部分）を追跡
  const recentContents: string[] = [];
  let consecutiveCount = 0;
  let lastContent = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
      continue;
    }

    // 話者ラベルを除いた発言内容を抽出
    const speakerMatch = trimmed.match(/^\[([^\]]+)\]:\s*(.*)$/);
    const content = speakerMatch ? speakerMatch[2].trim() : trimmed;

    // 空の発言はスキップしない
    if (!content) {
      result.push(line);
      continue;
    }

    // 直前と同じ内容かチェック
    if (content === lastContent) {
      consecutiveCount++;
      if (consecutiveCount >= maxRepeat) {
        // maxRepeat回以上連続したらスキップ
        hadLoop = true;
        continue;
      }
    } else {
      consecutiveCount = 1;
      lastContent = content;
    }

    result.push(line);
    recentContents.push(content);
  }

  // さらにN-gram単位でのループも検出（例：「ああ、はい。」「ああ、はい。」が交互に繰り返す場合）
  // 最終的な行リストに対してウィンドウスライドで重複ブロックを検出
  const finalLines = result;
  const dedupedLines: string[] = [];
  let i = 0;

  while (i < finalLines.length) {
    const line = finalLines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      dedupedLines.push(line);
      i++;
      continue;
    }

    // 現在行から始まるパターンが直後に繰り返されるか確認（パターン長1〜5行）
    let foundRepeat = false;
    for (let patLen = 1; patLen <= 5 && i + patLen * 2 <= finalLines.length; patLen++) {
      const pattern = finalLines.slice(i, i + patLen).map(l => l.trim()).join("|");
      let repeatCount = 0;
      let j = i + patLen;
      while (j + patLen <= finalLines.length) {
        const next = finalLines.slice(j, j + patLen).map(l => l.trim()).join("|");
        if (next === pattern) {
          repeatCount++;
          j += patLen;
        } else {
          break;
        }
      }
      if (repeatCount >= 2) {
        // パターンが3回以上繰り返されたら最初の1回だけ残す
        for (let k = 0; k < patLen; k++) {
          dedupedLines.push(finalLines[i + k]);
        }
        i = j; // 繰り返し部分をスキップ
        hadLoop = true;
        foundRepeat = true;
        break;
      }
    }

    if (!foundRepeat) {
      dedupedLines.push(line);
      i++;
    }
  }

  const cleaned = dedupedLines.join("\n");
  return { cleaned, hadLoop };
}

// 約100分の会話に相当するトークン数（日本語1文字≒1.5トークン、100分≒15000文字）
// 安全マージンを取り、8000文字ごとに分割
const CHUNK_SIZE = 8000;

function getSpeakerPrompt(speakerCount: number | null): string {
  if (speakerCount === null || speakerCount === 0) {
    return `話者の数は自動で判断してください。`;
  }
  return `話者は${speakerCount}人です。[話者1]から[話者${speakerCount}]までのラベルを使用してください。`;
}

/**
 * 長いテキストを意味のある区切り（改行）でチャンク分割する
 * 話者の発言途中で切れないよう、改行で区切る
 */
export function splitTranscriptionIntoChunks(text: string, chunkSize: number = CHUNK_SIZE): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= chunkSize) {
      chunks.push(remaining);
      break;
    }

    // chunkSize付近で改行を探す（話者の発言途中で切れないように）
    let cutPoint = chunkSize;
    const searchStart = Math.max(0, chunkSize - 500);
    const searchEnd = Math.min(remaining.length, chunkSize + 500);
    const searchArea = remaining.substring(searchStart, searchEnd);

    // 改行を後ろから探す
    const lastNewline = searchArea.lastIndexOf("\n");
    if (lastNewline !== -1) {
      cutPoint = searchStart + lastNewline + 1;
    }

    chunks.push(remaining.substring(0, cutPoint));
    remaining = remaining.substring(cutPoint);
  }

  return chunks;
}

/**
 * 複数チャンクの部分要約を統合して最終要約を生成する
 */
async function summarizeChunks(
  chunks: string[],
  systemPrompt: string,
  userPromptTemplate: (chunk: string, index: number, total: number) => string,
  finalPromptTemplate: (partialSummaries: string[]) => string,
): Promise<{ result: string; totalInputTokens: number; totalOutputTokens: number }> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  if (chunks.length === 1) {
    // 1チャンクの場合はそのまま処理
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPromptTemplate(chunks[0], 1, 1) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    const result = typeof content === "string" ? content : "";
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
    return {
      result,
      totalInputTokens: usage.prompt_tokens,
      totalOutputTokens: usage.completion_tokens,
    };
  }

  // 複数チャンクの場合: 各チャンクを個別に要約してから統合
  const partialSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPromptTemplate(chunks[i], i + 1, chunks.length) },
      ],
    });
    const content = response.choices[0]?.message?.content;
    const partialSummary = typeof content === "string" ? content : "";
    partialSummaries.push(partialSummary);

    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };
    totalInputTokens += usage.prompt_tokens;
    totalOutputTokens += usage.completion_tokens;
  }

  // 部分要約を統合して最終要約を生成
  const finalResponse = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: finalPromptTemplate(partialSummaries) },
    ],
  });
  const finalContent = finalResponse.choices[0]?.message?.content;
  const result = typeof finalContent === "string" ? finalContent : "";
  const finalUsage = finalResponse.usage || { prompt_tokens: 0, completion_tokens: 0 };
  totalInputTokens += finalUsage.prompt_tokens;
  totalOutputTokens += finalUsage.completion_tokens;

  return { result, totalInputTokens, totalOutputTokens };
}

export const voiceRouter = router({
  transcribe: subscribedProcedure
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
      const rawTranscription = typeof content === "string" ? content : "";
      const { cleaned: transcription, hadLoop } = removeHallucinationLoop(rawTranscription);
      if (hadLoop) {
        console.warn("[transcribe] Hallucination loop detected and removed from transcription");
      }
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        transcription,
        hadLoop,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),

  transcribeChunk: subscribedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/wav"),
      speakerCount: z.number().nullable(),
      chunkIndex: z.number(),
      totalChunks: z.number(),
      previousContext: z.string().optional(), // 前のチャンクの末尾部分（話者の継続性のため）
    }))
    .mutation(async ({ input }) => {
      const { audioBase64, mimeType, speakerCount, chunkIndex, totalChunks, previousContext } = input;

      const contextNote = previousContext
        ? `\n\n前のチャンクの末尾部分（話者の継続性のための参考）:\n${previousContext}`
        : "";

      const systemPrompt = `あなたは高精度な音声書き起こしの専門家です。以下のルールに厳密に従って書き起こしを行ってください：

1. 話者のラベル付けルール：
   - ${getSpeakerPrompt(speakerCount)}
   - 必ず「[話者1]」「[話者2]」のような形式を使用してください
   - 「話１」「Aさん」「Speaker1」などの表記は絶対に使用しないでください
   - 話者が変わるたびに改行し、新しい話者ラベルを付けてください

2. 書き起こしの品質：
   - 聴き取れた内容を正確に文字起こししてください
   - 句読点を適切に使用してください
   - 聴き取れない部分は「（聴き取れず）」と記載してください

3. チャンク情報：
   - これは全${totalChunks}チャンクの第${chunkIndex + 1}チャンクです
   - 前のチャンクと話者ラベルを統一してください${contextNote}

4. 出力形式：
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
                text: `この音声（全${totalChunks}チャンクの第${chunkIndex + 1}チャンク）を書き起こしてください。`,
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      const rawTranscription = typeof content === "string" ? content : "";
      const { cleaned: transcription, hadLoop } = removeHallucinationLoop(rawTranscription);
      if (hadLoop) {
        console.warn(`[transcribeChunk] Hallucination loop detected in chunk ${chunkIndex + 1}/${totalChunks} and removed`);
      }
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0 };

      return {
        transcription,
        hadLoop,
        tokenUsage: {
          input: usage.prompt_tokens,
          output: usage.completion_tokens,
        },
      };
    }),

  summarize: subscribedProcedure
    .input(z.object({
      transcription: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { transcription } = input;

      const systemPrompt = `あなたは優秀なビジネスアナリストです。書き起こしテキストを分析し、構造化された要約を作成してください。`;

      const chunks = splitTranscriptionIntoChunks(transcription);

      const { result: summary, totalInputTokens, totalOutputTokens } = await summarizeChunks(
        chunks,
        systemPrompt,
        (chunk, index, total) => {
          if (total === 1) {
            return `以下の書き起こしテキストを要約してください。

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
（補足情報や注意点があれば）

書き起こしテキスト：
${chunk}`;
          }
          return `以下は長い会話の書き起こしテキストの第${index}部（全${total}部）です。この部分の要点を簡潔にまとめてください。重要な発言、決定事項、アクションアイテムを中心に抽出してください。

書き起こしテキスト（第${index}部/全${total}部）：
${chunk}`;
        },
        (partialSummaries) => {
          const combinedSummaries = partialSummaries
            .map((s, i) => `【第${i + 1}部の要点】\n${s}`)
            .join("\n\n");
          return `以下は長い会話を複数のパートに分けて要約したものです。これらを統合して、会話全体の最終的な要約を作成してください。

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
（補足情報や注意点があれば）

各パートの要点：
${combinedSummaries}`;
        },
      );

      return {
        summary,
        chunkCount: chunks.length,
        tokenUsage: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
      };
    }),

  generateMinutes: subscribedProcedure
    .input(z.object({
      transcription: z.string(),
      template: z.enum(["business", "medical", "weekly"]),
      metadata: z.object({
        meetingName: z.string().optional(),
        date: z.string().optional(),
        participants: z.string().optional(),
        location: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { transcription, template, metadata } = input;

      const chunks = splitTranscriptionIntoChunks(transcription);

      let systemPrompt = "";
      let finalOutputFormat = "";

      if (template === "weekly") {
        systemPrompt = `あなたは優秀なビジネスアナリストです。書き起こしテキストから週間報告を作成してください。`;
        finalOutputFormat = `# 週間報告

## 基本情報
- 報告者: ${metadata?.participants || "（書き起こしから推測）"}
- 報告期間: ${metadata?.date || "（書き起こしから推測）"}

## 1. 成果と目標進捗
### 今週の成果
（今週達成したこと、完了したタスクを箇条書きで）

### 目標進捗状況
（設定した目標に対する進捗状況を記載）

## 2. 振り返り・課題
### うまくいったこと
（成功した点、良かった点）

### 課題・改善点
（直面した問題、改善が必要な点）

### 学び・気づき
（今週得られた学びや気づき）

## 3. 来週の目標・計画
### 目標
（来週達成したい目標）

### 計画・タスク
| タスク | 優先度 | 予定日 |
|--------|--------|--------|
| - | - | - |

### 必要なサポート・リソース
（目標達成に必要な支援があれば）

## 備考
（その他の補足事項）`;
      } else if (template === "business") {
        systemPrompt = `あなたは優秀な秘書です。書き起こしテキストからビジネス会議の議事録を作成してください。`;
        finalOutputFormat = `# 議事録

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
        systemPrompt = `あなたは医療事務の専門家です。書き起こしテキストから医療カンファレンスの議事録を作成してください。書き起こしテキストに明示的に記載されている情報のみを使用し、推測や捏造は絶対に行わないでください。`;
        finalOutputFormat = `# 医療カンファレンス議事録

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

      const { result: minutes, totalInputTokens, totalOutputTokens } = await summarizeChunks(
        chunks,
        systemPrompt,
        (chunk, index, total) => {
          if (total === 1) {
            return `以下の書き起こしテキストから${template === "weekly" ? "週間報告" : template === "business" ? "議事録" : "医療カンファレンス議事録"}を作成してください。

出力形式：
${finalOutputFormat}

書き起こしテキスト：
${chunk}`;
          }
          return `以下は長い会話の書き起こしテキストの第${index}部（全${total}部）です。この部分の重要な情報（発言内容、決定事項、アクションアイテム等）を箇条書きで抽出してください。

書き起こしテキスト（第${index}部/全${total}部）：
${chunk}`;
        },
        (partialSummaries) => {
          const combinedSummaries = partialSummaries
            .map((s, i) => `【第${i + 1}部の抽出情報】\n${s}`)
            .join("\n\n");
          return `以下は長い会話を複数のパートに分けて情報抽出したものです。これらを統合して、最終的な${template === "weekly" ? "週間報告" : template === "business" ? "議事録" : "医療カンファレンス議事録"}を作成してください。

出力形式：
${finalOutputFormat}

各パートの抽出情報：
${combinedSummaries}`;
        },
      );

      return {
        minutes,
        chunkCount: chunks.length,
        tokenUsage: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
      };
    }),

  generateKarte: subscribedProcedure
    .input(z.object({
      transcription: z.string(),
      formatId: z.string().optional(),
      patientInfo: z.object({
        patientId: z.string().optional(),
        patientName: z.string().optional(),
        age: z.string().optional(),
        gender: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { transcription, patientInfo, formatId } = input;

      const format = getKarteFormat(formatId ?? DEFAULT_KARTE_FORMAT_ID);
      const systemPrompt = format.systemPrompt;

      const finalOutputFormat = format.outputTemplate(patientInfo);

      const chunks = splitTranscriptionIntoChunks(transcription);

      const { result: karte, totalInputTokens, totalOutputTokens } = await summarizeChunks(
        chunks,
        systemPrompt,
        (chunk, index, total) => format.chunkPrompt(chunk, index, total, finalOutputFormat),
        (partialSummaries) => format.mergePrompt(partialSummaries, finalOutputFormat),
      );

      return {
        karte,
        chunkCount: chunks.length,
        tokenUsage: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
      };
    }),
});
