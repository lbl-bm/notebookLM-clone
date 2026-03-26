/**
 * P1.3: Query Embedding 内存缓存
 *
 * 目标：避免同一查询重复调用 Embedding API，降低成本 40-50%
 *
 * 设计：
 * - Key: SHA-256(text) 前 16 字节（hex），碰撞率极低，节省内存
 * - Value: Float32Array（比 number[] 省 ~4x 内存）
 * - TTL: 24h（查询 embedding 短时间内不会变）
 * - 容量上限: 500 条（约 500 * 1024 * 4 = ~2MB）
 * - 淘汰策略: LRU（超过上限时删除最久未使用的）
 * - HMR 安全: 挂载在 globalThis，防止 Next.js 热重载重复创建
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_MAX_SIZE = 500;

interface CacheEntry {
  embedding: Float32Array;
  expiresAt: number;
  lastUsed: number;
}

interface EmbeddingCacheStore {
  map: Map<string, CacheEntry>;
  hits: number;
  misses: number;
}

// HMR 安全：挂载在 globalThis
const g = globalThis as unknown as { __embeddingCache?: EmbeddingCacheStore };
if (!g.__embeddingCache) {
  g.__embeddingCache = { map: new Map(), hits: 0, misses: 0 };
}
const store = g.__embeddingCache;

/**
 * SHA-256 哈希（仅取前 16 字节 hex = 32 chars）
 * 在 Node.js 和 Edge Runtime 均可用
 */
async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer).slice(0, 16);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * O(1) LRU 淘汰：利用 Map 的插入顺序特性
 * Map 天然保证迭代顺序 = 插入顺序，第一个 key 就是最久未使用的
 * （配合 getCachedEmbedding 里的"删除再重插"操作实现 O(1) LRU）
 */
function evictLRU(): void {
  const firstKey = store.map.keys().next().value;
  if (firstKey !== undefined) {
    store.map.delete(firstKey);
  }
}

/**
 * 从缓存获取 embedding，未命中返回 null
 * 命中时删除再重插，将条目移到 Map 末尾（= 标记为最近使用，实现 O(1) LRU）
 */
export async function getCachedEmbedding(
  text: string
): Promise<number[] | null> {
  const key = await hashText(text);
  const entry = store.map.get(key);

  if (!entry) {
    store.misses++;
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    store.map.delete(key);
    store.misses++;
    return null;
  }

  // 删除再重插 = 移到 Map 末尾 = 标记为最近使用
  store.map.delete(key);
  entry.lastUsed = Date.now();
  store.map.set(key, entry);

  store.hits++;
  return Array.from(entry.embedding);
}

/**
 * 写入缓存
 */
export async function setCachedEmbedding(
  text: string,
  embedding: number[]
): Promise<void> {
  // 容量检查：超过上限则 LRU 淘汰
  if (store.map.size >= CACHE_MAX_SIZE) {
    evictLRU();
  }

  const key = await hashText(text);
  store.map.set(key, {
    embedding: new Float32Array(embedding), // 省内存
    expiresAt: Date.now() + CACHE_TTL_MS,
    lastUsed: Date.now(),
  });
}

/**
 * 缓存统计（用于监控和调试）
 */
export function getEmbeddingCacheStats(): {
  size: number;
  hits: number;
  misses: number;
  hitRate: string;
} {
  const total = store.hits + store.misses;
  return {
    size: store.map.size,
    hits: store.hits,
    misses: store.misses,
    hitRate: total === 0 ? "0%" : `${((store.hits / total) * 100).toFixed(1)}%`,
  };
}

/**
 * 清空缓存（测试用）
 */
export function clearEmbeddingCache(): void {
  store.map.clear();
  store.hits = 0;
  store.misses = 0;
}
