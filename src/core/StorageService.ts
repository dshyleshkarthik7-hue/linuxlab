const DB_NAME = 'LinuxLab_IDB';
const DB_VERSION = 2;

type WorkspaceRecord = { key: 'workspace'; state: unknown; timestamp: number };
type FileRecord = { filename: string; content: string; timestamp: number };
type ProgressRecord = { labId: string; score: number; passed: boolean; status?: string; logs?: string[]; timestamp: number };

export class StorageService {
  private static dbPromise: Promise<IDBDatabase> | null = null;
  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'filename' });
        if (!db.objectStoreNames.contains('workspaceState')) db.createObjectStore('workspaceState', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'labId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { this.dbPromise = null; reject(request.error ?? new Error('IndexedDB open failed')); };
    });
    return this.dbPromise;
  }
  private static async transaction<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let request: IDBRequest | void;
      try { request = work(tx.objectStore(storeName)); } catch (e) { reject(e); return; }
      if (request) { request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(request.error); }
      tx.oncomplete = () => { if (!request) resolve(undefined); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }
  static async saveFile(filename: string, content: string): Promise<void> { await this.transaction<FileRecord>('workspace', 'readwrite', s => s.put({ filename, content, timestamp: Date.now() })); }
  static async getFile(filename: string): Promise<string | null> { const r = await this.transaction<FileRecord>('workspace', 'readonly', s => s.get(filename)); return r?.content ?? null; }
  static async listFiles(): Promise<FileRecord[]> { return (await this.transaction<FileRecord[]>('workspace', 'readonly', s => s.getAll())) ?? []; }
  static async clearWorkspace(): Promise<void> { await this.transaction('workspace', 'readwrite', s => s.clear()); await this.transaction('workspaceState', 'readwrite', s => s.clear()); }
  static async saveWorkspaceState(state: unknown): Promise<void> { await this.transaction<WorkspaceRecord>('workspaceState', 'readwrite', s => s.put({ key: 'workspace', state, timestamp: Date.now() })); }
  static async getWorkspaceState<T>(): Promise<T | null> { const r = await this.transaction<WorkspaceRecord>('workspaceState', 'readonly', s => s.get('workspace')); return (r?.state as T) ?? null; }
  static async saveProgress(labId: string, score: number, passed: boolean, status = passed ? 'passed' : 'failed', logs: string[] = []): Promise<void> { await this.transaction<ProgressRecord>('progress', 'readwrite', s => s.put({ labId, score, passed, status, logs, timestamp: Date.now() })); }
  static async getProgress(labId: string): Promise<{ score: number; passed: boolean; status?: string; logs?: string[] } | null> { const r = await this.transaction<ProgressRecord>('progress', 'readonly', s => s.get(labId)); return r ? { score: r.score, passed: r.passed, status: r.status, logs: r.logs } : null; }
}
