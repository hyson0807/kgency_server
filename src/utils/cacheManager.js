// src/utils/cacheManager.js
// Redis 기반 캐시 매니저 with 메모리 폴백

const redis = require('redis');

// 메모리 폴백 캐시
const memoryCache = new Map();

class CacheManager {
  constructor() {
    this.redisClient = null;
    this.memoryCache = memoryCache;
    this.isRedisConnected = false;
    this.initRedis();
  }

  async initRedis() {
    try {
      // Railway 환경 감지
      const isRailway = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_GIT_COMMIT_SHA;
      const redisUrl = process.env.REDIS_URL || (isRailway ? null : 'redis://localhost:6379');
      
      // Railway에서 Redis가 설정되지 않은 경우 메모리 캐시만 사용
      if (!redisUrl) {
        console.log('🚀 Railway 환경에서 Redis URL이 없음. 메모리 캐시만 사용합니다.');
        this.isRedisConnected = false;
        return;
      }

      // Redis 연결 설정
      this.redisClient = redis.createClient({
        url: redisUrl,
        retry_strategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        socket: {
          connectTimeout: 10000,
          lazyConnect: true
        }
      });

      // Redis 이벤트 핸들러
      this.redisClient.on('connect', () => {
        console.log('✅ Redis 연결 성공');
        this.isRedisConnected = true;
      });

      this.redisClient.on('error', (error) => {
        console.warn('⚠️  Redis 연결 실패, 메모리 캐시 사용:', error.message);
        this.isRedisConnected = false;
      });

      this.redisClient.on('end', () => {
        console.warn('⚠️  Redis 연결 종료, 메모리 캐시 사용');
        this.isRedisConnected = false;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.warn('⚠️  Redis 초기화 실패, 메모리 캐시 사용:', error.message);
      this.isRedisConnected = false;
    }
  }

  async set(key, data, ttlSeconds) {
    try {
      const serializedData = JSON.stringify(data);
      
      // Redis 우선 시도
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.setEx(key, ttlSeconds, serializedData);
        console.log(`📦 Redis 캐시 저장: ${key} (TTL: ${ttlSeconds}s)`);
      } else {
        // 메모리 캐시 폴백
        this.memoryCache.set(key, {
          data: serializedData,
          expiry: Date.now() + (ttlSeconds * 1000)
        });
        
        // 메모리 사용량 제한 (최대 200개)
        if (this.memoryCache.size > 200) {
          const firstKey = this.memoryCache.keys().next().value;
          this.memoryCache.delete(firstKey);
        }
        
        console.log(`🧠 메모리 캐시 저장: ${key} (TTL: ${ttlSeconds}s)`);
      }
    } catch (error) {
      console.warn('캐시 저장 실패:', key, error.message);
      // Redis 실패 시 메모리 캐시로 폴백
      if (this.isRedisConnected) {
        this.isRedisConnected = false;
        await this.set(key, data, ttlSeconds); // 재귀 호출로 메모리 캐시 사용
      }
    }
  }

  async get(key, allowExpired = false) {
    try {
      // Redis 우선 시도
      if (this.isRedisConnected && this.redisClient) {
        const cached = await this.redisClient.get(key);
        if (cached) {
          console.log(`📦 Redis 캐시 히트: ${key}`);
          return JSON.parse(cached);
        }
      }
      
      // 메모리 캐시 조회 (Redis 실패 시 또는 Redis 없을 때)
      const memoryCached = this.memoryCache.get(key);
      if (memoryCached) {
        if (allowExpired || memoryCached.expiry > Date.now()) {
          console.log(`🧠 메모리 캐시 히트: ${key}`);
          return JSON.parse(memoryCached.data);
        } else {
          // 만료된 캐시 삭제
          this.memoryCache.delete(key);
        }
      }
      
      console.log(`❌ 캐시 미스: ${key}`);
      return null;
    } catch (error) {
      console.warn('캐시 조회 실패:', key, error.message);
      return null;
    }
  }

  async remove(key) {
    try {
      // Redis에서 삭제
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.del(key);
        console.log(`📦 Redis 캐시 삭제: ${key}`);
      }
      
      // 메모리 캐시에서도 삭제
      this.memoryCache.delete(key);
      console.log(`🧠 메모리 캐시 삭제: ${key}`);
    } catch (error) {
      console.warn('캐시 삭제 실패:', key, error.message);
    }
  }

  async clear(pattern = '*') {
    try {
      // Redis 캐시 삭제
      if (this.isRedisConnected && this.redisClient) {
        if (pattern === '*') {
          await this.redisClient.flushDb();
        } else {
          // 패턴 매칭 삭제
          const keys = await this.redisClient.keys(pattern);
          if (keys.length > 0) {
            await this.redisClient.del(keys);
          }
        }
        console.log(`📦 Redis 캐시 삭제: ${pattern}`);
      }
      
      // 메모리 캐시 삭제
      if (pattern === '*') {
        this.memoryCache.clear();
      } else {
        for (const key of this.memoryCache.keys()) {
          if (key.includes(pattern.replace('*', ''))) {
            this.memoryCache.delete(key);
          }
        }
      }
      console.log(`🧠 메모리 캐시 삭제: ${pattern}`);
    } catch (error) {
      console.warn('캐시 전체 삭제 실패:', error.message);
    }
  }

  async getStats() {
    try {
      const stats = {
        redis: {
          connected: this.isRedisConnected,
          size: 0,
          keys: []
        },
        memory: {
          size: this.memoryCache.size,
          keys: Array.from(this.memoryCache.keys())
        }
      };
      
      // Redis 통계 수집
      if (this.isRedisConnected && this.redisClient) {
        try {
          const redisKeys = await this.redisClient.keys('*');
          stats.redis.size = redisKeys.length;
          stats.redis.keys = redisKeys;
        } catch (error) {
          stats.redis.error = error.message;
        }
      }
      
      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }

  // 캐시 무효화 패턴
  async invalidatePattern(pattern) {
    await this.clear(pattern);
  }

  // 건강 상태 체크
  async healthCheck() {
    const health = {
      redis: false,
      memory: true,
      timestamp: new Date().toISOString()
    };
    
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.ping();
        health.redis = true;
      } catch (error) {
        health.redis = false;
        health.redisError = error.message;
      }
    }
    
    return health;
  }
}

// 싱글톤 인스턴스 생성
const cacheManager = new CacheManager();

// 프로세스 종료 시 Redis 연결 정리
process.on('SIGTERM', async () => {
  if (cacheManager.redisClient) {
    await cacheManager.redisClient.quit();
  }
});

process.on('SIGINT', async () => {
  if (cacheManager.redisClient) {
    await cacheManager.redisClient.quit();
  }
});

module.exports = cacheManager;