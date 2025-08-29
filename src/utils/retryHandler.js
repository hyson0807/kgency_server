// src/utils/retryHandler.js
// 재시도 메커니즘과 Circuit Breaker 패턴

class RetryHandler {
  constructor() {
    this.circuitBreakerStates = new Map(); // service -> {failures, lastFailure, state}
    this.defaultOptions = {
      maxRetries: 3,
      baseDelay: 1000, // 1초
      maxDelay: 10000, // 10초
      backoffMultiplier: 2,
      circuitBreakerThreshold: 5, // 5번 연속 실패 시 차단
      circuitBreakerTimeout: 30000 // 30초 후 재시도
    };
  }

  // Exponential Backoff로 재시도 실행
  async executeWithRetry(operation, options = {}) {
    const opts = { ...this.defaultOptions, ...options };
    const serviceName = options.serviceName || 'default';
    
    // Circuit Breaker 확인
    if (this.isCircuitBreakerOpen(serviceName)) {
      throw new Error(`서비스 ${serviceName}이(가) 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.`);
    }
    
    let lastError;
    let delay = opts.baseDelay;
    
    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // 성공 시 Circuit Breaker 리셋
        this.resetCircuitBreaker(serviceName);
        
        if (attempt > 1) {
          console.log(`✅ ${serviceName} 재시도 성공 (${attempt}/${opts.maxRetries})`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        console.warn(`⚠️ ${serviceName} 시도 ${attempt}/${opts.maxRetries} 실패:`, error.message);
        
        // 마지막 시도가 아닌 경우에만 재시도
        if (attempt < opts.maxRetries) {
          // 특정 에러는 재시도하지 않음
          if (this.isNonRetryableError(error)) {
            console.log(`❌ ${serviceName} 재시도 불가능한 에러:`, error.message);
            break;
          }
          
          // Exponential Backoff 대기
          const actualDelay = Math.min(delay, opts.maxDelay);
          console.log(`⏳ ${serviceName} ${actualDelay}ms 후 재시도...`);
          
          await this.sleep(actualDelay);
          delay *= opts.backoffMultiplier;
        }
      }
    }
    
    // 모든 재시도 실패 시 Circuit Breaker 업데이트
    this.recordFailure(serviceName);
    
    throw lastError;
  }

  // 재시도 불가능한 에러 판단
  isNonRetryableError(error) {
    // HTTP 상태 코드 기반 판단
    if (error.response?.status) {
      const status = error.response.status;
      // 4xx 에러는 클라이언트 에러이므로 재시도하지 않음
      if (status >= 400 && status < 500) {
        return true;
      }
    }
    
    // 특정 에러 메시지 기반 판단
    const nonRetryableMessages = [
      'ENOTFOUND', // DNS 에러
      'ECONNREFUSED', // 연결 거부
      'Authentication failed', // 인증 실패
      'Invalid token' // 토큰 에러
    ];
    
    return nonRetryableMessages.some(msg => 
      error.message.includes(msg) || error.code === msg
    );
  }

  // Circuit Breaker 상태 확인
  isCircuitBreakerOpen(serviceName) {
    const state = this.circuitBreakerStates.get(serviceName);
    if (!state) return false;
    
    const { failures, lastFailure, state: circuitState } = state;
    
    if (circuitState === 'OPEN') {
      const timeSinceLastFailure = Date.now() - lastFailure;
      
      // 타임아웃 후 Half-Open 상태로 전환
      if (timeSinceLastFailure > this.defaultOptions.circuitBreakerTimeout) {
        this.circuitBreakerStates.set(serviceName, {
          ...state,
          state: 'HALF_OPEN'
        });
        console.log(`🔄 ${serviceName} Circuit Breaker: OPEN -> HALF_OPEN`);
        return false;
      }
      
      return true;
    }
    
    return false;
  }

  // Circuit Breaker 실패 기록
  recordFailure(serviceName) {
    const currentState = this.circuitBreakerStates.get(serviceName) || {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED'
    };
    
    const newFailures = currentState.failures + 1;
    const newState = {
      failures: newFailures,
      lastFailure: Date.now(),
      state: newFailures >= this.defaultOptions.circuitBreakerThreshold ? 'OPEN' : 'CLOSED'
    };
    
    this.circuitBreakerStates.set(serviceName, newState);
    
    if (newState.state === 'OPEN') {
      console.warn(`🚫 ${serviceName} Circuit Breaker OPEN (${newFailures}번 연속 실패)`);
    }
  }

  // Circuit Breaker 리셋
  resetCircuitBreaker(serviceName) {
    this.circuitBreakerStates.delete(serviceName);
  }

  // 지연 함수
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Circuit Breaker 상태 조회
  getCircuitBreakerStatus() {
    const status = {};
    
    for (const [serviceName, state] of this.circuitBreakerStates.entries()) {
      status[serviceName] = {
        ...state,
        timeSinceLastFailure: Date.now() - state.lastFailure
      };
    }
    
    return status;
  }
}

// 전역 인스턴스 생성
const retryHandler = new RetryHandler();

// 편의 함수들
const withRetry = (operation, options) => {
  return retryHandler.executeWithRetry(operation, options);
};

const withDatabaseRetry = (operation) => {
  return withRetry(operation, {
    serviceName: 'database',
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 5000
  });
};

const withAPIRetry = (operation) => {
  return withRetry(operation, {
    serviceName: 'external_api',
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 8000
  });
};

const withCacheRetry = (operation) => {
  return withRetry(operation, {
    serviceName: 'cache',
    maxRetries: 2,
    baseDelay: 200,
    maxDelay: 1000
  });
};

module.exports = {
  RetryHandler,
  retryHandler,
  withRetry,
  withDatabaseRetry,
  withAPIRetry,
  withCacheRetry
};