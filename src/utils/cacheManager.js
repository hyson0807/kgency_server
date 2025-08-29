// src/utils/cacheManager.js
// 메모리 기반 캐시 매니저 (Redis 대신 간단한 구현)

const memoryCache = new Map();

class CacheManager {
  constructor() {
    this.cache = memoryCache;
  }

  async set(key, data, ttlSeconds) {
    try {
      const serializedData = JSON.stringify(data);
      
      // 메모리 캐시에 저장
      this.cache.set(key, {
        data: serializedData,
        expiry: Date.now() + (ttlSeconds * 1000)
      });
      
      // 메모리 사용량 제한 (최대 100개)
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      
      console.log(`캐시 저장: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.warn('캐시 저장 실패:', key, error.message);
    }
  }

  async get(key, allowExpired = false) {
    try {
      const cached = this.cache.get(key);
      
      if (cached) {
        if (allowExpired || cached.expiry > Date.now()) {
          console.log(`캐시 히트: ${key}`);
          return JSON.parse(cached.data);
        } else {
          // 만료된 캐시 삭제
          this.cache.delete(key);
        }
      }
      
      console.log(`캐시 미스: ${key}`);
      return null;
    } catch (error) {
      console.warn('캐시 조회 실패:', key, error.message);
      return null;
    }
  }

  async remove(key) {
    try {
      this.cache.delete(key);
      console.log(`캐시 삭제: ${key}`);
    } catch (error) {
      console.warn('캐시 삭제 실패:', key, error.message);
    }
  }

  async clear(pattern = '*') {
    try {
      if (pattern === '*') {
        this.cache.clear();
      } else {
        // 패턴 매칭 삭제
        for (const key of this.cache.keys()) {
          if (key.includes(pattern.replace('*', ''))) {
            this.cache.delete(key);
          }
        }
      }
      console.log(`캐시 전체 삭제: ${pattern}`);
    } catch (error) {
      console.warn('캐시 전체 삭제 실패:', error.message);
    }
  }

  async getStats() {
    try {
      return {
        type: 'memory',
        size: this.cache.size,
        keys: Array.from(this.cache.keys())
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = new CacheManager();