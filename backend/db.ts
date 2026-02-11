declare const Deno: { env: { get: (key: string) => string | undefined } } | undefined;

function getEnvVar(key: string): string | undefined {
  try {
    if (typeof Deno !== 'undefined' && Deno?.env?.get) {
      const val = Deno.env.get(key);
      if (val) return val;
    }
  } catch {
  }
  
  try {
    if (typeof process !== 'undefined' && process?.env) {
      const val = (process.env as Record<string, string | undefined>)[key];
      if (val) return val;
    }
  } catch {
  }
  
  try {
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as Record<string, unknown>;
      if (typeof g[key] === 'string') return g[key] as string;
    }
  } catch {
  }
  
  return undefined;
}

function getDbConfig() {
  const endpoint =
    getEnvVar('EXPO_PUBLIC_RORK_DB_ENDPOINT') ||
    getEnvVar('RORK_DB_ENDPOINT');
  const namespace =
    getEnvVar('EXPO_PUBLIC_RORK_DB_NAMESPACE') ||
    getEnvVar('RORK_DB_NAMESPACE');
  const token =
    getEnvVar('EXPO_PUBLIC_RORK_DB_TOKEN') ||
    getEnvVar('RORK_DB_TOKEN');
  
  console.log('[DB] Config check - endpoint:', endpoint ? 'SET' : 'MISSING', 'namespace:', namespace || 'MISSING', 'token:', token ? 'SET' : 'MISSING');
  
  return { endpoint, namespace, token };
}

let dbConfig: { endpoint?: string; namespace?: string; token?: string } | null = null;
let dbConfigAttempts = 0;

function getConfig() {
  if (!dbConfig || (!dbConfig.endpoint && dbConfigAttempts < 5)) {
    dbConfigAttempts++;
    dbConfig = getDbConfig();
  }
  return dbConfig;
}

function hasRemoteDbConfig() {
  const config = getConfig();
  return !!(config.endpoint && config.token);
}

interface DbRecord {
  id: string;
}

// In-memory fallback storage when DB is not configured.
// Optionally persisted to disk when filesystem is available.
const memoryStore: Record<string, Record<string, unknown>> = {};
let fileStoreLoaded = false;
let fsAvailable = true;
let fileStoreLoadPromise: Promise<void> | null = null;
let fileStoreWriteQueue: Promise<void> = Promise.resolve();

const DATA_DIR = getEnvVar('DATA_DIR') || './data';
const DATA_FILE = `${DATA_DIR}/db.json`;
const DATA_FILE_TMP = `${DATA_DIR}/db.json.tmp`;
const DATA_FILE_BAK = `${DATA_DIR}/db.json.bak`;
let fileStoreLoadError: string | null = null;
let fileStorePersistError: string | null = null;
const INLINE_MEDIA_MAX_LENGTH = 300_000;
let prunedInlineMediaCount = 0;

function isOversizedInlineMedia(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("data:") &&
    value.length > INLINE_MEDIA_MAX_LENGTH
  );
}

function pruneOversizedInlineMedia(store: Record<string, Record<string, unknown>>): number {
  let pruned = 0;
  const collections = Object.values(store);

  for (const col of collections) {
    for (const rawItem of Object.values(col)) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;

      if (isOversizedInlineMedia(item.avatar)) {
        item.avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop";
        pruned++;
      }
      if (isOversizedInlineMedia(item.thumbnail)) {
        item.thumbnail = "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop";
        pruned++;
      }
      if (isOversizedInlineMedia(item.url)) {
        item.url = "";
        pruned++;
      }
      if (isOversizedInlineMedia(item.screenshotUrl)) {
        delete item.screenshotUrl;
        pruned++;
      }
    }
  }

  return pruned;
}

async function getFs() {
  if (!fsAvailable) return null;
  try {
    const fs = await import('fs/promises');
    return fs;
  } catch {
    fsAvailable = false;
    return null;
  }
}

async function ensureFileStoreLoaded(): Promise<void> {
  if (fileStoreLoaded) return;

  if (!fileStoreLoadPromise) {
    fileStoreLoadPromise = (async () => {
      const fs = await getFs();
      if (!fs) return;

      try {
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.assign(memoryStore, parsed);
          const prunedCount = pruneOversizedInlineMedia(memoryStore);
          if (prunedCount > 0) {
            prunedInlineMediaCount = prunedCount;
            console.log(`[DB] Pruned ${prunedCount} oversized inline media fields`);
            await persistFileStore();
          } else {
            prunedInlineMediaCount = 0;
          }
        }
      } catch (error: unknown) {
        const err = error as { code?: string; message?: string };
        const missingFile = err?.code === 'ENOENT';
        if (missingFile) {
          try {
            await fs.mkdir(DATA_DIR, { recursive: true });
          } catch {
          }
          return;
        }

        // If primary file is corrupted, try backup before declaring failure.
        try {
          const backupRaw = await fs.readFile(DATA_FILE_BAK, 'utf8');
          const backupParsed = JSON.parse(backupRaw);
          if (backupParsed && typeof backupParsed === 'object') {
            Object.assign(memoryStore, backupParsed);
            console.log('[DB] Recovered data from backup file');
            return;
          }
        } catch {
        }

        fileStoreLoadError = err?.message || 'Failed to load file store';
        console.log('[DB] ERROR: Failed to load file store, refusing silent reset:', fileStoreLoadError);
      }
    })();
  }

  try {
    await fileStoreLoadPromise;
  } finally {
    if (fileStoreLoadPromise) {
      fileStoreLoaded = true;
      fileStoreLoadPromise = null;
    }
  }
}

async function enqueuePersist(work: () => Promise<void>): Promise<void> {
  fileStoreWriteQueue = fileStoreWriteQueue.then(work);
  return fileStoreWriteQueue;
}

async function persistFileStore(): Promise<void> {
  return enqueuePersist(async () => {
    const fs = await getFs();
    if (!fs) return;

    try {
      try {
        await fs.mkdir(DATA_DIR, { recursive: true });
      } catch {
      }
      const payload = JSON.stringify(memoryStore, null, 2);
      await fs.writeFile(DATA_FILE_TMP, payload, 'utf8');

      try {
        const current = await fs.readFile(DATA_FILE, 'utf8');
        await fs.writeFile(DATA_FILE_BAK, current, 'utf8');
      } catch {
      }

      await fs.rename(DATA_FILE_TMP, DATA_FILE);
      fileStorePersistError = null;
    } catch (error: unknown) {
      const err = error as { message?: string };
      fileStorePersistError = err?.message || 'Failed to persist file store';
      console.log('[DB] ERROR: Failed to persist file store:', fileStorePersistError);
      throw new Error(fileStorePersistError);
    }
  });
}

async function getMemoryCollection(collection: string): Promise<unknown[]> {
  await ensureFileStoreLoaded();
  if (fileStoreLoadError) {
    throw new Error(`File store unavailable: ${fileStoreLoadError}`);
  }
  if (fileStorePersistError) {
    throw new Error(`File store persist error: ${fileStorePersistError}`);
  }
  if (!memoryStore[collection]) {
    memoryStore[collection] = {};
  }
  return Object.values(memoryStore[collection]);
}

async function setMemoryItem(collection: string, id: string, data: unknown): Promise<void> {
  await ensureFileStoreLoaded();
  if (fileStoreLoadError) {
    throw new Error(`File store unavailable: ${fileStoreLoadError}`);
  }
  if (fileStorePersistError) {
    throw new Error(`File store persist error: ${fileStorePersistError}`);
  }
  if (!memoryStore[collection]) {
    memoryStore[collection] = {};
  }
  memoryStore[collection][id] = data;
  await persistFileStore();
}

async function deleteMemoryItem(collection: string, id: string): Promise<void> {
  await ensureFileStoreLoaded();
  if (fileStoreLoadError) {
    throw new Error(`File store unavailable: ${fileStoreLoadError}`);
  }
  if (fileStorePersistError) {
    throw new Error(`File store persist error: ${fileStorePersistError}`);
  }
  if (memoryStore[collection]) {
    delete memoryStore[collection][id];
    await persistFileStore();
  }
}

async function makeRequest(path: string, method: string, body?: unknown) {
  const config = getConfig();
  
  if (!config.endpoint || !config.token) {
    console.log("[DB] WARN: Missing database configuration (endpoint:", config.endpoint ? 'SET' : 'MISSING', "token:", config.token ? 'SET' : 'MISSING', "), using memory fallback");
    return null;
  }

  const endpoint = config.endpoint.replace(/\/+$/, "");
  const namespace = (config.namespace || "").trim().replace(/^\/+|\/+$/g, "");
  const namespacePrefix = namespace ? `/${namespace}` : "";
  const url = `${endpoint}${namespacePrefix}${path}`;
  console.log(`[DB] ${method} ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`[DB] Error: ${response.status} - ${text.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    console.log(`[DB] ${method} ${path} - success`);
    return data;
  } catch (error) {
    console.log("[DB] Request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function getCollection<T extends DbRecord>(collection: string): Promise<T[]> {
  const remoteConfigured = hasRemoteDbConfig();
  const result = await makeRequest(`/${collection}`, "GET");
  if (result && Array.isArray(result)) {
    return result as T[];
  }
  if (result && result.data && Array.isArray(result.data)) {
    return result.data as T[];
  }
  if (remoteConfigured) {
    throw new Error(`Failed to read ${collection} from configured database`);
  }
  // Fallback to memory
  return (await getMemoryCollection(collection)) as T[];
}

export async function getById<T extends DbRecord>(collection: string, id: string): Promise<T | null> {
  const remoteConfigured = hasRemoteDbConfig();
  const result = await makeRequest(`/${collection}/${id}`, "GET");
  if (result && result.id) {
    return result as T;
  }
  if (result && result.data) {
    return result.data as T;
  }
  if (remoteConfigured) {
    throw new Error(`Failed to read ${collection}/${id} from configured database`);
  }
  // Fallback to memory
  const items = (await getMemoryCollection(collection)) as T[];
  return items.find(item => item.id === id) || null;
}

export async function create<T extends DbRecord>(collection: string, data: T): Promise<T> {
  const remoteConfigured = hasRemoteDbConfig();
  const result = await makeRequest(`/${collection}`, "POST", data);
  if (!result) {
    if (remoteConfigured) {
      throw new Error(`Failed to create ${collection}/${data.id} in configured database`);
    }
    // Use memory fallback
    await setMemoryItem(collection, data.id, data);
    console.log(`[DB] Created ${collection} (memory):`, data.id);
    return data;
  }
  console.log(`[DB] Created ${collection}:`, data.id);
  return result?.data || result || data;
}

export async function update<T extends DbRecord>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
  const remoteConfigured = hasRemoteDbConfig();
  const result = await makeRequest(`/${collection}/${id}`, "PUT", data);
  if (!result) {
    if (remoteConfigured) {
      throw new Error(`Failed to update ${collection}/${id} in configured database`);
    }
    // Use memory fallback
    const existing = (await getMemoryCollection(collection) as T[]).find(item => item.id === id);
    if (existing) {
      const updated = { ...existing, ...data } as T;
      await setMemoryItem(collection, id, updated);
      console.log(`[DB] Updated ${collection} (memory):`, id);
      return updated;
    }
    return null;
  }
  console.log(`[DB] Updated ${collection}:`, id);
  return result?.data || result;
}

export async function remove(collection: string, id: string): Promise<boolean> {
  const remoteConfigured = hasRemoteDbConfig();
  const result = await makeRequest(`/${collection}/${id}`, "DELETE");
  if (!result) {
    if (remoteConfigured) {
      throw new Error(`Failed to delete ${collection}/${id} in configured database`);
    }
    // Use memory fallback
    await deleteMemoryItem(collection, id);
    console.log(`[DB] Deleted ${collection} (memory):`, id);
  } else {
    console.log(`[DB] Deleted ${collection}:`, id);
  }
  return true;
}

export async function upsert<T extends DbRecord>(collection: string, data: T): Promise<T> {
  const existing = await getById<T>(collection, data.id);
  if (existing) {
    const result = await update<T>(collection, data.id, data);
    return result || data;
  }
  return create(collection, data);
}

export async function initializeCollection<T extends DbRecord>(collection: string, defaultData: T[]): Promise<T[]> {
  const existing = await getCollection<T>(collection);
  if (existing.length > 0) {
    console.log(`[DB] Collection ${collection} already has ${existing.length} items`);
    return existing;
  }
  
  console.log(`[DB] Initializing ${collection} with ${defaultData.length} default items`);
  for (const item of defaultData) {
    await create(collection, item);
  }
  return defaultData;
}

export const db = {
  getCollection,
  getById,
  create,
  update,
  remove,
  upsert,
  initializeCollection,
};

export async function getStorageDiagnostics() {
  const config = getConfig();
  const remoteDbConfigured = hasRemoteDbConfig();
  const fs = await getFs();

  let canWriteDataDir = false;
  let dataFileExists = false;
  let dataFileSizeBytes = 0;

  if (fs) {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const probePath = `${DATA_DIR}/.write-test`;
      await fs.writeFile(probePath, String(Date.now()), "utf8");
      await fs.unlink(probePath);
      canWriteDataDir = true;
    } catch {
      canWriteDataDir = false;
    }

    try {
      const stat = await fs.stat(DATA_FILE);
      dataFileExists = true;
      dataFileSizeBytes = Number(stat.size || 0);
    } catch {
      dataFileExists = false;
      dataFileSizeBytes = 0;
    }
  }

  return {
    mode: remoteDbConfigured ? "remote-db" : "file-or-memory",
    remoteDbConfigured,
    endpointConfigured: !!config?.endpoint,
    namespaceConfigured: !!config?.namespace,
    tokenConfigured: !!config?.token,
    dataDir: DATA_DIR,
    dataFile: DATA_FILE,
    fsAvailable,
    canWriteDataDir,
    dataFileExists,
    dataFileSizeBytes,
    fileStoreLoaded,
    fileStoreLoadError,
    fileStorePersistError,
    inlineMediaMaxLength: INLINE_MEDIA_MAX_LENGTH,
    prunedInlineMediaCount,
  };
}
