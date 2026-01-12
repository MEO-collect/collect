/**
 * IndexedDB utility for storing audio blobs
 */

const DB_NAME = "btob-ai-platform";
const DB_VERSION = 1;
const AUDIO_STORE = "audio-recordings";

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
