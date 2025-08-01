// utils/suitabilityCalculator.js - 서버용 적합도 계산기

const defaultSuitabilityRules = {
    scoreLevels: {
        perfect: 90,
        excellent: 80,
        good: 60,
        fair: 40
    }
};

class SuitabilityCalculator {
    constructor(rules) {
        this.rules = rules || defaultSuitabilityRules;
    }

    /**
     * 특정 카테고리에서 "상관없음" 키워드 ID 찾기
     */
    findNoPreferenceKeywordId(jobKeywords, category) {
        const noPreferenceKeyword = jobKeywords.find(k => 
            k.keyword.category === category && k.keyword.keyword === '상관없음'
        );
        return noPreferenceKeyword ? noPreferenceKeyword.keyword.id : null;
    }

    /**
     * 유저 또는 공고에서 "상관없음"이 선택되었는지 확인
     */
    isNoPreferenceSelected(userKeywordIds, jobKeywords, category) {
        const noPreferenceId = this.findNoPreferenceKeywordId(jobKeywords, category);
        
        if (!noPreferenceId) {
            return { userHasNoPreference: false, jobHasNoPreference: false, noPreferenceId: null };
        }

        const userHasNoPreference = userKeywordIds.includes(noPreferenceId);
        const jobHasNoPreference = jobKeywords.some(k => k.keyword.id === noPreferenceId);

        return { userHasNoPreference, jobHasNoPreference, noPreferenceId };
    }

    /**
     * 적합도 계산 메인 함수
     */
    calculate(userKeywordIds, jobKeywords) {
        let totalScore = 0;
        const categoryScores = {};
        const matchedKeywords = this.initializeMatchedKeywords();

        // 먼저 지역 매칭 확인 (필수)
        const locationMatch = this.checkLocationMatch(userKeywordIds, jobKeywords, matchedKeywords);
        const hasLocationMatch = locationMatch.matched > 0;

        // 지역 점수 계산 추가 (38%)
        if (hasLocationMatch) {
            totalScore += 38;
        }
        categoryScores['지역'] = { ...locationMatch, score: hasLocationMatch ? 38 : 0, weight: 38 };

        // 성별 매칭 확인 (필수)
        const genderMatch = this.checkGenderMatchRequired(userKeywordIds, jobKeywords, matchedKeywords);
        const hasGenderMatch = genderMatch.matched > 0;
        categoryScores['성별필수체크'] = { ...genderMatch, weight: 0 };

        // 1. 희망직종 (33%)
        const jobScore = this.calculateJobMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += jobScore.score;
        categoryScores['직종'] = { ...jobScore, weight: 33 };

        // 2. 근무 가능 요일 (11%)
        const workDayScore = this.calculateWorkDayMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += workDayScore.score;
        categoryScores['근무요일'] = { ...workDayScore, weight: 11 };

        // 3. 한국어 실력 (5% 보너스)
        const koreanScore = this.calculateKoreanLevelMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += koreanScore.score;
        categoryScores['한국어수준'] = { ...koreanScore, weight: 5 };

        // 4. 비자 유형 (5%)
        const visaScore = this.calculateVisaMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += visaScore.score;
        categoryScores['비자'] = { ...visaScore, weight: 5 };

        // 5. 성별 (4%)
        const genderScore = this.calculateGenderMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += genderScore.score;
        categoryScores['성별'] = { ...genderScore, weight: 4 };

        // 6. 나이대 (3%)
        const ageScore = this.calculateAgeMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += ageScore.score;
        categoryScores['나이대'] = { ...ageScore, weight: 3 };

        // 7. 비자지원 여부 (2%)
        const visaSupportScore = this.calculateVisaSupportMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += visaSupportScore.score;
        categoryScores['비자지원'] = { ...visaSupportScore, weight: 2 };

        // 8. 식사 제공 여부 (2%)
        const mealScore = this.calculateMealProvidedMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += mealScore.score;
        categoryScores['식사제공'] = { ...mealScore, weight: 2 };

        // 9. 국적 (2%)
        const countryScore = this.calculateCountryMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += countryScore.score;
        categoryScores['국가'] = { ...countryScore, weight: 2 };

        // 10. 기타 근무조건 (2%)
        const otherConditionsScore = this.calculateOtherConditionsMatch(userKeywordIds, jobKeywords, matchedKeywords);
        totalScore += otherConditionsScore.score;
        categoryScores['기타조건'] = { ...otherConditionsScore, weight: 2 };

        // 필수 항목 미매칭 시 패널티
        const missingRequired = [];
        if (!hasLocationMatch) {
            totalScore = totalScore * 0.3;
            missingRequired.push('지역');
        }

        if (!hasGenderMatch) {
            totalScore = Math.max(0, totalScore - 20);
            missingRequired.push('성별');
        }

        // 레벨 결정
        const level = this.determineLevel(totalScore);

        return {
            score: Math.round(totalScore),
            level,
            details: {
                categoryScores,
                bonusPoints: 0,
                matchedKeywords,
                missingRequired,
                appliedBonuses: []
            }
        };
    }

    calculateJobMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const jobKeywordsInPosting = jobKeywords.filter(k => k.keyword.category === '직종');
        const matchedJobs = jobKeywordsInPosting.filter(k => userKeywordIds.includes(k.keyword.id));

        matchedJobs.forEach(k => matchedKeywords.jobs.push(k.keyword.keyword));

        if (jobKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 33 };
        }

        if (matchedJobs.length > 0) {
            return {
                matched: matchedJobs.length,
                total: jobKeywordsInPosting.length,
                score: 33
            };
        }

        return {
            matched: 0,
            total: jobKeywordsInPosting.length,
            score: 0
        };
    }

    calculateWorkDayMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const workDayKeywordsInPosting = jobKeywords.filter(k => k.keyword.category === '근무요일');

        if (workDayKeywordsInPosting.length === 0) {
            return { matched: 0, total: 0, score: 0 };
        }

        const userWorkDayKeywords = jobKeywords.filter(k =>
            k.keyword.category === '근무요일' && userKeywordIds.includes(k.keyword.id)
        );

        if (userWorkDayKeywords.length === 0) {
            return { matched: 0, total: workDayKeywordsInPosting.length, score: 0 };
        }

        const matchedWorkDays = workDayKeywordsInPosting.filter(k =>
            userKeywordIds.includes(k.keyword.id)
        );

        matchedWorkDays.forEach(k => matchedKeywords.workDays?.push(k.keyword.keyword));

        const matchRate = matchedWorkDays.length / workDayKeywordsInPosting.length;

        return {
            matched: matchedWorkDays.length,
            total: workDayKeywordsInPosting.length,
            score: matchRate * 11
        };
    }

    calculateKoreanLevelMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '한국어수준');

        // 유저나 공고 중 하나라도 "상관없음"이면 만점
        if (userHasNoPreference || jobHasNoPreference) {
            // 사용자의 실제 키워드를 표시 (상관없음이 아닌 경우)
            if (jobHasNoPreference && !userHasNoPreference) {
                const userKorean = jobKeywords.find(k =>
                    k.keyword.category === '한국어수준' && 
                    k.keyword.keyword !== '상관없음' && 
                    userKeywordIds.includes(k.keyword.id)
                );
                if (userKorean) {
                    matchedKeywords.koreanLevel?.push(userKorean.keyword.keyword);
                } else {
                    matchedKeywords.koreanLevel?.push('기타');
                }
            } else {
                matchedKeywords.koreanLevel?.push('기타');
            }
            return { matched: 1, total: 1, score: 5 };
        }

        const koreanKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '한국어수준' && k.keyword.keyword !== '상관없음'
        );

        if (koreanKeywordsInPosting.length === 0) {
            return { matched: 0, total: 0, score: 0 };
        }

        const levelMap = {
            '초급': 1,
            '중급': 2,
            '고급': 3
        };

        const userKoreanLevel = jobKeywords.find(k =>
            k.keyword.category === '한국어수준' && 
            k.keyword.keyword !== '상관없음' && 
            userKeywordIds.includes(k.keyword.id)
        );

        if (!userKoreanLevel) {
            return { matched: 0, total: 1, score: 0 };
        }

        const userLevel = levelMap[userKoreanLevel.keyword.keyword] || 0;

        if (koreanKeywordsInPosting.length === 3) {
            const hasAllLevels = ['초급', '중급', '고급'].every(level => 
                koreanKeywordsInPosting.some(k => k.keyword.keyword === level)
            );
            
            if (hasAllLevels) {
                matchedKeywords.koreanLevel?.push(userKoreanLevel.keyword.keyword);
                return { matched: 1, total: 1, score: 5 };
            }
        }

        const minRequiredLevel = Math.min(...koreanKeywordsInPosting.map(k => levelMap[k.keyword.keyword] || 0));
        
        if (userLevel >= minRequiredLevel) {
            matchedKeywords.koreanLevel?.push(userKoreanLevel.keyword.keyword);
            return { matched: 1, total: 1, score: 5 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateVisaMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '비자');

        // 유저나 공고 중 하나라도 "상관없음"이면 만점
        if (userHasNoPreference || jobHasNoPreference) {
            // 사용자의 실제 키워드를 표시 (상관없음이 아닌 경우)
            if (jobHasNoPreference && !userHasNoPreference) {
                const userVisa = jobKeywords.find(k =>
                    k.keyword.category === '비자' && 
                    k.keyword.keyword !== '상관없음' && 
                    userKeywordIds.includes(k.keyword.id)
                );
                if (userVisa) {
                    matchedKeywords.visa.push(userVisa.keyword.keyword);
                } else {
                    matchedKeywords.visa.push('기타');
                }
            } else {
                matchedKeywords.visa.push('기타');
            }
            return { matched: 1, total: 1, score: 5 };
        }

        const visaKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '비자' && k.keyword.keyword !== '상관없음'
        );
        const userVisa = jobKeywords.find(k =>
            k.keyword.category === '비자' && 
            k.keyword.keyword !== '상관없음' && 
            userKeywordIds.includes(k.keyword.id)
        );

        if (visaKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 5 };
        }

        if (userVisa && visaKeywordsInPosting.some(k => k.keyword.id === userVisa.keyword.id)) {
            matchedKeywords.visa.push(userVisa.keyword.keyword);
            return { matched: 1, total: 1, score: 5 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateGenderMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '성별');

        // 유저나 공고 중 하나라도 "상관없음"이면 만점
        if (userHasNoPreference || jobHasNoPreference) {
            // 사용자의 실제 키워드를 표시 (상관없음이 아닌 경우)
            if (jobHasNoPreference && !userHasNoPreference) {
                const userGender = jobKeywords.find(k =>
                    k.keyword.category === '성별' && 
                    k.keyword.keyword !== '상관없음' && 
                    userKeywordIds.includes(k.keyword.id)
                );
                if (userGender) {
                    matchedKeywords.gender.push(userGender.keyword.keyword);
                } else {
                    matchedKeywords.gender.push('기타');
                }
            } else {
                matchedKeywords.gender.push('기타');
            }
            return { matched: 1, total: 1, score: 4 };
        }

        const genderKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '성별' && k.keyword.keyword !== '상관없음'
        );

        if (genderKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 4 };
        }

        const matchedGender = genderKeywordsInPosting.filter(k =>
            userKeywordIds.includes(k.keyword.id)
        );

        if (matchedGender.length > 0) {
            matchedGender.forEach(k => matchedKeywords.gender.push(k.keyword.keyword));
            return { matched: 1, total: 1, score: 4 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    checkGenderMatchRequired(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '성별');

        // 유저나 공고 중 하나라도 "상관없음"이면 매칭으로 처리
        if (userHasNoPreference || jobHasNoPreference) {
            return { matched: 1, total: 1, score: 0 };
        }

        const genderKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '성별' && k.keyword.keyword !== '상관없음'
        );

        if (genderKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 0 };
        }

        const userGenderKeyword = jobKeywords.find(k =>
            k.keyword.category === '성별' && 
            k.keyword.keyword !== '상관없음' && 
            userKeywordIds.includes(k.keyword.id)
        );

        if (!userGenderKeyword) {
            return { matched: 0, total: 1, score: 0 };
        }

        const isMatched = genderKeywordsInPosting.some(k =>
            k.keyword.id === userGenderKeyword.keyword.id
        );

        if (isMatched) {
            return { matched: 1, total: 1, score: 0 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateAgeMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '나이대');

        // 유저나 공고 중 하나라도 "상관없음"이면 만점
        if (userHasNoPreference || jobHasNoPreference) {
            // 사용자의 실제 키워드를 표시 (상관없음이 아닌 경우)
            if (jobHasNoPreference && !userHasNoPreference) {
                const userAge = jobKeywords.find(k =>
                    k.keyword.category === '나이대' && 
                    k.keyword.keyword !== '상관없음' && 
                    userKeywordIds.includes(k.keyword.id)
                );
                if (userAge) {
                    matchedKeywords.age.push(userAge.keyword.keyword);
                } else {
                    matchedKeywords.age.push('기타');
                }
            } else {
                matchedKeywords.age.push('기타');
            }
            return { matched: 1, total: 1, score: 3 };
        }

        const ageKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '나이대' && k.keyword.keyword !== '상관없음'
        );

        if (ageKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 3 };
        }

        const userAge = jobKeywords.find(k =>
            k.keyword.category === '나이대' && 
            k.keyword.keyword !== '상관없음' && 
            userKeywordIds.includes(k.keyword.id)
        );

        if (!userAge) {
            return { matched: 0, total: 1, score: 0 };
        }

        if (ageKeywordsInPosting.some(k => k.keyword.id === userAge.keyword.id)) {
            matchedKeywords.age.push(userAge.keyword.keyword);
            return { matched: 1, total: 1, score: 3 };
        }

        const ageOrder = ['20-25세', '25-30세', '30-35세', '35세 이상'];
        const userAgeIndex = ageOrder.indexOf(userAge.keyword.keyword);
        const acceptableAges = ageKeywordsInPosting.map(k => k.keyword.keyword);

        for (const acceptableAge of acceptableAges) {
            const acceptableIndex = ageOrder.indexOf(acceptableAge);
            if (Math.abs(userAgeIndex - acceptableIndex) === 1) {
                return { matched: 0, total: 1, score: 1.5 };
            }
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateVisaSupportMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const visaSupportId = 49;
        const hasVisaSupport = jobKeywords.some(k =>
            k.keyword.id === visaSupportId && userKeywordIds.includes(visaSupportId)
        );

        if (hasVisaSupport) {
            matchedKeywords.conditions.push('비자지원');
            return { matched: 1, total: 1, score: 2 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateMealProvidedMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const mealProvidedId = 46;
        const hasMealProvided = jobKeywords.some(k =>
            k.keyword.id === mealProvidedId && userKeywordIds.includes(mealProvidedId)
        );

        if (hasMealProvided) {
            matchedKeywords.conditions.push('식사제공');
            return { matched: 1, total: 1, score: 2 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateCountryMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        // "상관없음" 키워드 확인
        const { userHasNoPreference, jobHasNoPreference, noPreferenceId } = 
            this.isNoPreferenceSelected(userKeywordIds, jobKeywords, '국가');

        // 유저나 공고 중 하나라도 "상관없음"이면 만점
        if (userHasNoPreference || jobHasNoPreference) {
            // 사용자의 실제 키워드를 표시 (상관없음이 아닌 경우)
            if (jobHasNoPreference && !userHasNoPreference) {
                const userCountry = jobKeywords.find(k =>
                    k.keyword.category === '국가' && 
                    k.keyword.keyword !== '상관없음' && 
                    userKeywordIds.includes(k.keyword.id)
                );
                if (userCountry) {
                    matchedKeywords.countries.push(userCountry.keyword.keyword);
                } else {
                    matchedKeywords.countries.push('기타');
                }
            } else {
                matchedKeywords.countries.push('기타');
            }
            return { matched: 1, total: 1, score: 2 };
        }

        const countryKeywordsInPosting = jobKeywords.filter(k => 
            k.keyword.category === '국가' && k.keyword.keyword !== '상관없음'
        );

        if (countryKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 2 };
        }

        const matchedCountries = countryKeywordsInPosting.filter(k =>
            userKeywordIds.includes(k.keyword.id)
        );

        if (matchedCountries.length > 0) {
            matchedCountries.forEach(k => matchedKeywords.countries.push(k.keyword.keyword));
            return { matched: 1, total: 1, score: 2 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    calculateOtherConditionsMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const otherConditionIds = [44, 45, 47, 48];
        const otherConditions = jobKeywords.filter(k =>
            k.keyword.category === '근무조건' &&
            otherConditionIds.includes(k.keyword.id)
        );

        if (otherConditions.length === 0) {
            return { matched: 0, total: 0, score: 2 };
        }

        const matchedOthers = otherConditions.filter(k =>
            userKeywordIds.includes(k.keyword.id)
        );

        matchedOthers.forEach(k => matchedKeywords.conditions.push(k.keyword.keyword));

        const matchRate = matchedOthers.length / otherConditions.length;
        return {
            matched: matchedOthers.length,
            total: otherConditions.length,
            score: matchRate * 2
        };
    }

    checkLocationMatch(userKeywordIds, jobKeywords, matchedKeywords) {
        const locationKeywordsInPosting = jobKeywords.filter(k => k.keyword.category === '지역');

        if (locationKeywordsInPosting.length === 0) {
            return { matched: 1, total: 1, score: 0 };
        }

        const userLocationKeyword = jobKeywords.find(k =>
            k.keyword.category === '지역' && userKeywordIds.includes(k.keyword.id)
        );

        if (!userLocationKeyword) {
            return { matched: 0, total: 1, score: 0 };
        }

        const isMatched = locationKeywordsInPosting.some(k =>
            k.keyword.id === userLocationKeyword.keyword.id
        );

        if (isMatched) {
            matchedKeywords.location.push(userLocationKeyword.keyword.keyword);
            return { matched: 1, total: 1, score: 0 };
        }

        return { matched: 0, total: 1, score: 0 };
    }

    initializeMatchedKeywords() {
        return {
            countries: [],
            jobs: [],
            conditions: [],
            location: [],
            moveable: [],
            gender: [],
            age: [],
            visa: [],
            workDays: [],
            koreanLevel: []
        };
    }

    determineLevel(score) {
        const { scoreLevels } = this.rules;

        if (score >= scoreLevels.perfect) return 'perfect';
        if (score >= scoreLevels.excellent) return 'excellent';
        if (score >= scoreLevels.good) return 'good';
        if (score >= scoreLevels.fair) return 'fair';
        return 'low';
    }

    updateRules(rules) {
        this.rules = rules;
    }
}

module.exports = SuitabilityCalculator;