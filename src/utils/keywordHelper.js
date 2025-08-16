// utils/keywordHelper.js - 키워드 ID 동적 조회 유틸리티

const { supabase } = require('../config/database');

class KeywordHelper {
    constructor() {
        this.keywordCache = new Map(); // 캐시로 성능 최적화
        this.cacheExpiry = 5 * 60 * 1000; // 5분 캐시
        this.lastCacheUpdate = 0;
    }

    /**
     * 키워드 캐시 초기화/갱신
     */
    async refreshKeywordCache() {
        try {
            const { data: keywords, error } = await supabase
                .from('keyword')
                .select('id, keyword, category');

            if (error) throw error;

            // 캐시 초기화
            this.keywordCache.clear();
            
            // 키워드별로 캐시 저장
            keywords.forEach(kw => {
                const key = `${kw.category}:${kw.keyword}`;
                this.keywordCache.set(key, kw.id);
            });

            this.lastCacheUpdate = Date.now();
            console.log(`키워드 캐시 갱신 완료: ${keywords.length}개`);
            
            return true;
        } catch (error) {
            console.error('키워드 캐시 갱신 실패:', error);
            throw error;
        }
    }

    /**
     * 캐시가 유효한지 확인
     */
    isCacheValid() {
        return (Date.now() - this.lastCacheUpdate) < this.cacheExpiry;
    }

    /**
     * 특정 키워드의 ID 조회
     * @param {string} category - 키워드 카테고리
     * @param {string} keyword - 키워드 텍스트
     * @returns {number|null} - 키워드 ID 또는 null
     */
    async getKeywordId(category, keyword) {
        // 캐시가 유효하지 않으면 갱신
        if (!this.isCacheValid()) {
            await this.refreshKeywordCache();
        }

        const key = `${category}:${keyword}`;
        return this.keywordCache.get(key) || null;
    }

    /**
     * 여러 키워드 ID를 한번에 조회
     * @param {Array} keywordPairs - [{category, keyword}, ...] 형태 배열
     * @returns {Object} - {category_keyword: id, ...} 형태 객체
     */
    async getKeywordIds(keywordPairs) {
        // 캐시가 유효하지 않으면 갱신
        if (!this.isCacheValid()) {
            await this.refreshKeywordCache();
        }

        const result = {};
        keywordPairs.forEach(({ category, keyword, alias }) => {
            const key = `${category}:${keyword}`;
            const id = this.keywordCache.get(key);
            const resultKey = alias || `${category}_${keyword}`;
            result[resultKey] = id || null;
        });

        return result;
    }

    /**
     * 특정 카테고리의 모든 키워드 ID 조회
     * @param {string} category - 키워드 카테고리
     * @returns {Array} - 키워드 ID 배열
     */
    async getKeywordIdsByCategory(category) {
        // 캐시가 유효하지 않으면 갱신
        if (!this.isCacheValid()) {
            await this.refreshKeywordCache();
        }

        const ids = [];
        for (const [key, id] of this.keywordCache.entries()) {
            if (key.startsWith(`${category}:`)) {
                ids.push(id);
            }
        }

        return ids;
    }

    /**
     * 적합도 계산에 필요한 주요 키워드 ID들을 한번에 조회
     * @returns {Object} - 필요한 키워드 ID들
     */
    async getSuitabilityKeywordIds() {
        const keywordPairs = [
            { category: '근무조건', keyword: '비자지원', alias: 'visaSupport' },
            { category: '근무조건', keyword: '식사제공', alias: 'mealProvided' },
            { category: '지역이동', keyword: '지역이동 가능', alias: 'moveable' },
            { category: '근무조건', keyword: '고급여', alias: 'highSalary' },
            { category: '근무조건', keyword: '숙소제공', alias: 'accommodation' },
            { category: '근무조건', keyword: '주말근무', alias: 'weekendWork' },
            { category: '근무조건', keyword: '통근버스', alias: 'shuttleBus' }
        ];

        return await this.getKeywordIds(keywordPairs);
    }

    /**
     * 캐시 상태 정보 반환
     */
    getCacheInfo() {
        return {
            size: this.keywordCache.size,
            lastUpdate: new Date(this.lastCacheUpdate).toISOString(),
            isValid: this.isCacheValid(),
            expiresIn: Math.max(0, this.cacheExpiry - (Date.now() - this.lastCacheUpdate))
        };
    }
}

// 싱글톤 인스턴스 생성
const keywordHelper = new KeywordHelper();

module.exports = keywordHelper;