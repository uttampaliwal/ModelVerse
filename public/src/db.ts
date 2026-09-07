import type { Conversation, Preset, Folder } from './types.js';

type StoredPreset = Preset & { name: string };

const DB_NAME = 'modelverse';
const DB_VERSION = 2;
const STORE_CONVERSATIONS = 'conversations';
const STORE_PRESETS = 'presets';
const STORE_FOLDERS = 'folders';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PRESETS)) {
          db.createObjectStore(STORE_PRESETS, { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open database'));
    });
  }
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_CONVERSATIONS, mode).objectStore(STORE_CONVERSATIONS);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const store = tx(db, 'readonly');
  return reqToPromise(store.getAll() as IDBRequest<Conversation[]>);
}

export async function putConversation(conv: Conversation): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  store.put(conv);
  await txDone(store);
}

export async function putConversations(convs: Conversation[]): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  for (const c of convs) store.put(c);
  await txDone(store);
}

export async function deleteConversationById(id: string): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  store.delete(id);
  await txDone(store);
}

export async function getPresets(): Promise<Record<string, Preset>> {
  const db = await getDB();
  const store = tx(db, 'readonly');
  const arr = await reqToPromise(store.getAll() as IDBRequest<StoredPreset[]>);
  if (arr && arr.length) {
    const map: Record<string, Preset> = {};
    for (const p of arr) map[p.name] = p;
    return map;
  }
  // One-time migration from legacy localStorage store
  try {
    const raw = localStorage.getItem('presets');
    if (raw) {
      const v = JSON.parse(raw);
      const map = (v && typeof v === 'object' ? v : {}) as Record<string, Preset>;
      localStorage.removeItem('presets');
      await putPresets(map);
      return map;
    }
  } catch (e) {
    console.warn('Migration of presets from localStorage failed:', e);
  }
  return {};
}

export async function putPresets(presets: Record<string, Preset>): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  for (const name of Object.keys(presets)) {
    store.put({ name, ...presets[name] });
  }
  await txDone(store);
}

export async function savePreset(name: string, preset: Preset): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  store.put({ name, ...preset });
  await txDone(store);
}

export async function deletePresetByName(name: string): Promise<void> {
  const db = await getDB();
  const store = tx(db, 'readwrite');
  store.delete(name);
  await txDone(store);
}

function txDone(store: IDBObjectStore): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = store.transaction;
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction error'));
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function folderTx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_FOLDERS, mode).objectStore(STORE_FOLDERS);
}

export async function getAllFolders(): Promise<Folder[]> {
  const db = await getDB();
  const store = folderTx(db, 'readonly');
  return reqToPromise(store.getAll() as IDBRequest<Folder[]>);
}

export async function putFolders(folders: Folder[]): Promise<void> {
  const db = await getDB();
  const store = folderTx(db, 'readwrite');
  for (const f of folders) store.put(f);
  await txDone(store);
}

export async function deleteFolderById(id: string): Promise<void> {
  const db = await getDB();
  const store = folderTx(db, 'readwrite');
  store.delete(id);
  await txDone(store);
}

// ---- Full backup / restore --------------------------------------------------

const MAX_BACKUP_CONVERSATIONS = 5000;

export interface DatabaseBackup {
  version: 1;
  app: 'modelverse';
  exportedAt: string;
  conversations: Conversation[];
  presets: Record<string, Preset>;
  folders: Folder[];
}

/** Export every conversation, preset, and folder for backup. */
export async function exportDatabase(): Promise<DatabaseBackup> {
  const [conversations, presets, folders] = await Promise.all([
    getAllConversations(),
    getPresets(),
    getAllFolders(),
  ]);
  return {
    version: 1,
    app: 'modelverse',
    exportedAt: new Date().toISOString(),
    conversations,
    presets,
    folders,
  };
}

function isBackup(value: unknown): value is DatabaseBackup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.app === 'modelverse' &&
    Array.isArray(v.conversations) &&
    v.conversations.length <= MAX_BACKUP_CONVERSATIONS &&
    (v.presets === undefined || typeof v.presets === 'object') &&
    (v.folders === undefined || Array.isArray(v.folders))
  );
}

/**
 * Restore a backup. Conversations/folders merge by id (backup wins);
 * returns counts so the UI can confirm before reloading.
 */
export async function importDatabase(data: unknown): Promise<{
  conversations: number;
  folders: number;
  presets: number;
}> {
  if (!isBackup(data)) throw new Error('Not a ModelVerse backup file');
  const conversations = data.conversations.filter(
    (c): c is Conversation => !!c && typeof c.id === 'string' && Array.isArray(c.messages),
  );
  const folders = (data.folders ?? []).filter(
    (f): f is Folder => !!f && typeof f.id === 'string' && typeof f.name === 'string',
  );
  const presets: Record<string, Preset> =
    data.presets && typeof data.presets === 'object' ? data.presets : {};

  if (conversations.length > 0) await putConversations(conversations);
  if (folders.length > 0) await putFolders(folders);
  const presetNames = Object.keys(presets);
  if (presetNames.length > 0) await putPresets(presets);
  return {
    conversations: conversations.length,
    folders: folders.length,
    presets: presetNames.length,
  };
}
