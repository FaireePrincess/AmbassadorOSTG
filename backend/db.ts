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
  const endpoint = getEnvVar('EXPO_PUBLIC_RORK_DB_ENDPOINT');
  const namespace = getEnvVar('EXPO_PUBLIC_RORK_DB_NAMESPACE');
  const token = getEnvVar('EXPO_PUBLIC_RORK_DB_TOKEN');
  
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

interface DbRecord {
  id: string;
}

// In-memory fallback storage when DB is not configured.
// Optionally persisted to disk when filesystem is available.
const memoryStore: Record<string, Record<string, unknown>> = {};
let fileStoreLoaded = false;
let fsAvailable = true;

const DATA_DIR = getEnvVar('DATA_DIR') || './data';
const DATA_FILE = `${DATA_DIR}/db.json`;

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
  fileStoreLoaded = true;

  const fs = await getFs();
  if (!fs) return;

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      Object.assign(memoryStore, parsed);
    }
  } catch (error) {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch {
    }
  }
}

async function persistFileStore(): Promise<void> {
  const fs = await getFs();
  if (!fs) return;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(memoryStore, null, 2), 'utf8');
  } catch {
  }
}

async function getMemoryCollection(collection: string): Promise<unknown[]> {
  await ensureFileStoreLoaded();
  if (!memoryStore[collection]) {
    memoryStore[collection] = {};
  }
  return Object.values(memoryStore[collection]);
}

async function setMemoryItem(collection: string, id: string, data: unknown): Promise<void> {
  await ensureFileStoreLoaded();
  if (!memoryStore[collection]) {
    memoryStore[collection] = {};
  }
  memoryStore[collection][id] = data;
  await persistFileStore();
}

async function deleteMemoryItem(collection: string, id: string): Promise<void> {
  await ensureFileStoreLoaded();
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

  const url = `${config.endpoint}/${config.namespace}${path}`;
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
  const result = await makeRequest(`/${collection}`, "GET");
  if (result && Array.isArray(result)) {
    return result as T[];
  }
  if (result && result.data && Array.isArray(result.data)) {
    return result.data as T[];
  }
  // Fallback to memory
  return (await getMemoryCollection(collection)) as T[];
}

export async function getById<T extends DbRecord>(collection: string, id: string): Promise<T | null> {
  const result = await makeRequest(`/${collection}/${id}`, "GET");
  if (result && result.id) {
    return result as T;
  }
  if (result && result.data) {
    return result.data as T;
  }
  // Fallback to memory
  const items = (await getMemoryCollection(collection)) as T[];
  return items.find(item => item.id === id) || null;
}

export async function create<T extends DbRecord>(collection: string, data: T): Promise<T> {
  const result = await makeRequest(`/${collection}`, "POST", data);
  if (!result) {
    // Use memory fallback
    await setMemoryItem(collection, data.id, data);
    console.log(`[DB] Created ${collection} (memory):`, data.id);
    return data;
  }
  console.log(`[DB] Created ${collection}:`, data.id);
  return result?.data || result || data;
}

export async function update<T extends DbRecord>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
  const result = await makeRequest(`/${collection}/${id}`, "PUT", data);
  if (!result) {
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
  const result = await makeRequest(`/${collection}/${id}`, "DELETE");
  if (!result) {
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
