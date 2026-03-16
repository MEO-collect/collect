/**
 * IndexedDB utility for storing audio blobs
 */

const DB_NAME = "btob-ai-platform";
const DB_VERSION = 2;
const AUDIO_STORE = "audio-recordings";
const TRANSCRIPTION_PROGRESS_STORE = "transcription-progress";

interface AudioRecord {
  id: string;
  blob: Blob;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TRANSCRIPTION_PROGRESS_STORE)) {
        db.createObjectStore(TRANSCRIPTION_PROGRESS_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveAudio(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE);
    const record: AudioRecord = { id, blob, createdAt: Date.now() };
    const request = store.put(record);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAudio(id: string): Promise<Blob | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readonly");
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const record = request.result as AudioRecord | undefined;
      resolve(record?.blob ?? null);
    };
  });
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ─── チャンク書き起こし中間保存 ───

export interface TranscriptionProgress {
  /** プロジェクトID */
  id: string;
  /** 完了済みチャンクの書き起こし結果（index順） */
  completedChunks: Array<{
    index: number;
    startSec: number;
    endSec: number;
    transcription: string;
    inputTokens: number;
    outputTokens: number;
  }>;
  /** 総チャンク数（分割後に確定） */
  totalChunks: number;
  /** 話者数設定 */
  speakerCount: number | null;
  /** 保存日時 */
  savedAt: number;
}

/**
 * チャンク書き起こしの中間進捗を保存する
 */
export async function saveTranscriptionProgress(
  progress: TranscriptionProgress,
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRANSCRIPTION_PROGRESS_STORE, "readwrite");
    const store = transaction.objectStore(TRANSCRIPTION_PROGRESS_STORE);
    const request = store.put({ ...progress, savedAt: Date.now() });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * チャンク書き起こしの中間進捗を取得する
 */
export async function getTranscriptionProgress(
  projectId: string,
): Promise<TranscriptionProgress | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRANSCRIPTION_PROGRESS_STORE, "readonly");
    const store = transaction.objectStore(TRANSCRIPTION_PROGRESS_STORE);
    const request = store.get(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve((request.result as TranscriptionProgress | undefined) ?? null);
    };
  });
}

/**
 * チャンク書き起こしの中間進捗を削除する（完了・キャンセル時）
 */
export async function clearTranscriptionProgress(projectId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRANSCRIPTION_PROGRESS_STORE, "readwrite");
    const store = transaction.objectStore(TRANSCRIPTION_PROGRESS_STORE);
    const request = store.delete(projectId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllAudioIds(): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readonly");
    const store = transaction.objectStore(AUDIO_STORE);
    const request = store.getAllKeys();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result as string[]);
    };
  });
}
