const AWS = require('aws-sdk');

// 환경변수 검증
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const S3_BUCKET = process.env.S3_BUCKET || 'kgency-storage';

// S3 설정 전 환경변수 확인
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.warn('⚠️  AWS credentials not found in environment variables!');
    console.warn('   Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    console.warn('   Video upload functionality will not work without these credentials.');
}

// S3 설정
const s3 = new AWS.S3({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION
});

const S3_VIDEO_PREFIX = 'video/';
const S3_AUDIO_PREFIX = 'record/';
const S3_AUDIO_AI_PREFIX = 'record/korean_test_ai/';
const S3_AUDIO_MERGED_PREFIX = 'record/korean_test_merged/';

// S3 연결 테스트 (개발 환경에서만)
if (process.env.NODE_ENV === 'development' && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
    s3.headBucket({ Bucket: S3_BUCKET }, (err, data) => {
        if (err) {
            console.error('❌ S3 bucket access failed:', err.message);
        } else {
            console.log('✅ S3 bucket connection successful');
        }
    });
}

module.exports = {
    s3,
    S3_BUCKET,
    S3_VIDEO_PREFIX,
    S3_AUDIO_PREFIX,
    S3_AUDIO_AI_PREFIX,
    S3_AUDIO_MERGED_PREFIX,
    isConfigured: !!AWS_ACCESS_KEY_ID && !!AWS_SECRET_ACCESS_KEY
};