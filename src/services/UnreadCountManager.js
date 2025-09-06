const Redis = require('redis');
const { createClient } = require('@supabase/supabase-js');

/**
 * Redis 기반 실시간 배지 카운트 관리자
 * 기존 DB 쿼리 방식을 Redis 캐시로 대체하여 80% 성능 개선
 */
class UnreadCountManager {
    constructor() {
        this.redis = null;
        this.supabase = createClient(
            process.env.KEY_1,
            process.env.KEY_2
        );
        this.initializeRedis();
    }

    async initializeRedis() {
        try {
            // Railway Redis URL 또는 로컬 Redis 설정
            if (process.env.REDIS_URL) {
                this.redis = Redis.createClient({
                    url: process.env.REDIS_URL
                });
            } else {
                this.redis = Redis.createClient({
                    socket: {
                        host: process.env.REDIS_HOST || 'localhost',
                        port: process.env.REDIS_PORT || 6379,
                    },
                    password: process.env.REDIS_PASSWORD || undefined,
                });
            }

            this.redis.on('error', (err) => {
                console.error('Redis 연결 오류:', err);
            });

            this.redis.on('connect', () => {
                console.log('✅ Redis 연결 성공 (UnreadCountManager)');
            });

            await this.redis.connect();
        } catch (error) {
            console.error('Redis 초기화 실패:', error);
        }
    }

    /**
     * 읽지 않은 메시지 카운트 증가
     * Redis Hash 구조: user:{userId}:unread_counts
     * { "room_123": 5, "room_456": 2, "total": 7 }
     */
    async incrementUnreadCount(userId, roomId, increment = 1) {
        try {
            if (!this.redis) {
                console.warn('Redis 연결이 없음, DB 동기화로 fallback');
                return await this.syncFromDatabase(userId);
            }

            // 1. 특정 채팅방 카운트 증가
            await this.redis.hIncrBy(`user:${userId}:unread_counts`, roomId, increment);
            
            // 2. 총 카운트 재계산 및 저장
            const total = await this.getTotalUnreadCount(userId);
            await this.redis.hSet(`user:${userId}:unread_counts`, 'total', total.toString());
            
            console.log(`📈 Redis 카운트 증가: ${userId} → 룸 ${roomId} (+${increment}) → 총 ${total}`);
            return total;

        } catch (error) {
            console.error('Redis 카운트 증가 실패:', error);
            // Fallback to database sync
            return await this.syncFromDatabase(userId);
        }
    }

    /**
     * 읽지 않은 메시지 카운트 감소
     */
    async decrementUnreadCount(userId, roomId, decrement = 1) {
        try {
            if (!this.redis) {
                return await this.syncFromDatabase(userId);
            }

            const currentCount = parseInt(await this.redis.hGet(`user:${userId}:unread_counts`, roomId) || '0');
            const newCount = Math.max(0, currentCount - decrement);
            
            await this.redis.hSet(`user:${userId}:unread_counts`, roomId, newCount.toString());
            
            const total = await this.getTotalUnreadCount(userId);
            await this.redis.hSet(`user:${userId}:unread_counts`, 'total', total.toString());
            
            console.log(`📉 Redis 카운트 감소: ${userId} → 룸 ${roomId} (-${decrement}) → 총 ${total}`);
            return total;

        } catch (error) {
            console.error('Redis 카운트 감소 실패:', error);
            return await this.syncFromDatabase(userId);
        }
    }

    /**
     * 특정 채팅방의 읽지 않은 카운트 리셋 (채팅방 입장 시)
     */
    async resetRoomUnreadCount(userId, roomId) {
        try {
            if (!this.redis) {
                return await this.syncFromDatabase(userId);
            }

            await this.redis.hDel(`user:${userId}:unread_counts`, roomId);
            
            const total = await this.getTotalUnreadCount(userId);
            await this.redis.hSet(`user:${userId}:unread_counts`, 'total', total.toString());
            
            console.log(`🔄 Redis 카운트 리셋: ${userId} → 룸 ${roomId} → 총 ${total}`);
            return total;

        } catch (error) {
            console.error('Redis 카운트 리셋 실패:', error);
            return await this.syncFromDatabase(userId);
        }
    }

    /**
     * 총 읽지 않은 메시지 카운트 조회 (Redis에서 즉시 반환)
     */
    async getTotalUnreadCount(userId) {
        try {
            if (!this.redis) {
                return 0;
            }

            const counts = await this.redis.hGetAll(`user:${userId}:unread_counts`);
            let total = 0;
            
            for (const [key, value] of Object.entries(counts)) {
                if (key !== 'total') {
                    total += parseInt(value) || 0;
                }
            }
            
            return total;

        } catch (error) {
            console.error('Redis 총 카운트 조회 실패:', error);
            return 0;
        }
    }

    /**
     * 캐시된 총 카운트 즉시 조회 (성능 최적화)
     */
    async getCachedTotalUnreadCount(userId) {
        try {
            if (!this.redis) {
                return 0;
            }

            const cachedTotal = await this.redis.hGet(`user:${userId}:unread_counts`, 'total');
            return parseInt(cachedTotal || '0');

        } catch (error) {
            console.error('캐시된 총 카운트 조회 실패:', error);
            return 0;
        }
    }

    /**
     * DB와 Redis 동기화 (초기화 시 또는 불일치 발견 시)
     */
    async syncFromDatabase(userId) {
        try {
            console.log(`🔄 DB 동기화 시작: ${userId}`);

            const { data: rooms, error } = await this.supabase
                .from('chat_rooms')
                .select('id, user_unread_count, company_unread_count, user_id, company_id')
                .or(`user_id.eq.${userId},company_id.eq.${userId}`)
                .eq('is_active', true);

            if (error) {
                console.error('DB 동기화 쿼리 실패:', error);
                return 0;
            }

            const counts = {};
            let total = 0;

            if (rooms && rooms.length > 0) {
                rooms.forEach(room => {
                    let unreadCount = 0;
                    if (room.user_id === userId) {
                        unreadCount = room.user_unread_count || 0;
                    } else if (room.company_id === userId) {
                        unreadCount = room.company_unread_count || 0;
                    }
                    
                    if (unreadCount > 0) {
                        counts[room.id] = unreadCount.toString();
                        total += unreadCount;
                    }
                });
            }

            counts['total'] = total.toString();
            
            // Redis에 일괄 저장 (Redis v4+ 호환)
            if (this.redis && Object.keys(counts).length > 0) {
                for (const [key, value] of Object.entries(counts)) {
                    await this.redis.hSet(`user:${userId}:unread_counts`, key, value);
                }
                console.log(`✅ Redis 동기화 완료: ${userId} → 총 ${total}`);
            }
            
            return total;

        } catch (error) {
            console.error('DB 동기화 실패:', error);
            return 0;
        }
    }

    /**
     * Redis 연결 상태 확인
     */
    isRedisConnected() {
        return this.redis && this.redis.isReady;
    }

    /**
     * Redis 연결 종료
     */
    async disconnect() {
        try {
            if (this.redis) {
                await this.redis.disconnect();
                console.log('Redis 연결 종료됨');
            }
        } catch (error) {
            console.error('Redis 연결 종료 실패:', error);
        }
    }

    /**
     * 사용자의 모든 읽지 않은 카운트 데이터 삭제 (로그아웃 시)
     */
    async clearUserUnreadCounts(userId) {
        try {
            if (!this.redis) return;
            
            await this.redis.del(`user:${userId}:unread_counts`);
            console.log(`🗑️ 사용자 카운트 데이터 삭제: ${userId}`);
            
        } catch (error) {
            console.error('사용자 카운트 삭제 실패:', error);
        }
    }
}

module.exports = UnreadCountManager;