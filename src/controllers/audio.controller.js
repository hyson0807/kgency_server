const { s3, S3_BUCKET, S3_AUDIO_PREFIX, isConfigured } = require('../config/s3.config');
const { supabase } = require('../config/database');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// S3 업로드 설정 (한국어 테스트 전용)
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: S3_BUCKET,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const userId = req.body.user_id || req.user?.userId;
            const timestamp = Date.now();
            const ext = path.extname(file.originalname) || '.m4a';
            console.log(`🎙️ Generating S3 key for Korean test - user: ${userId}, file: ${file.originalname}`);
            cb(null, `${S3_AUDIO_PREFIX}korean_test/${userId}/${timestamp}${ext}`);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE
    }),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB 제한
    },
    fileFilter: function (req, file, cb) {
        console.log(`📁 File filter - fieldname: ${file.fieldname}, mimetype: ${file.mimetype}, originalname: ${file.originalname}`);
        // 오디오 파일만 허용
        const allowedMimes = [
            'audio/mp4',
            'audio/mpeg',
            'audio/wav',
            'audio/m4a',
            'audio/x-m4a',
            'audio/aac',
            'audio/webm'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.log(`❌ File type not allowed: ${file.mimetype}`);
            cb(new Error('Invalid file type. Only audio files are allowed.'));
        }
    }
}).single('audio');

// 한국어 테스트 오디오 업로드
const uploadKoreanTest = async (req, res) => {
    try {
        console.log('📤 Korean test upload request received');
        console.log('Request body before multer:', req.body ? 'Present' : 'Not present yet');

        // S3 관련 설정 확인
        if (!isConfigured) {
            console.error('❌ S3 not configured');
            return res.status(500).json({
                success: false,
                error: 'File upload service not configured'
            });
        }

        // multer 업로드 처리
        upload(req, res, async (err) => {
            if (err) {
                console.error('Upload error:', err);
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'No audio file provided'
                    });
                }

                const userId = req.body.user_id || req.user.userId;
                const questionNumber = req.body.question_number || '1';
                const duration = req.body.duration || '15';
                const questionText = req.body.question_text || '';

                console.log('📊 Processing Korean test data after multer:', {
                    hasBody: !!req.body,
                    bodyKeys: req.body ? Object.keys(req.body) : 'no body',
                    hasFile: !!req.file,
                    userId,
                    questionNumber,
                    duration,
                    questionText,
                    fileLocation: req.file?.location
                });

                // S3 URL
                const audioUrl = req.file.location;

                console.log('💾 Saving audio to database:', {
                    userId,
                    questionNumber,
                    audioUrl
                });

                // 기존 레코드가 있는지 확인 (가장 최근 레코드)
                const { data: existingRecords, error: selectError } = await supabase
                    .from('korean_tests')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const existingRecord = existingRecords?.[0] || null;

                let result;
                if (existingRecord) {
                    // 기존 레코드 업데이트
                    const updateData = {
                        [`question${questionNumber}_audio`]: audioUrl,
                        test_date: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    // 모든 질문이 완료되었는지 확인
                    const allQuestions = {
                        question1_audio: existingRecord.question1_audio,
                        question2_audio: existingRecord.question2_audio,
                        question3_audio: existingRecord.question3_audio
                    };

                    // 현재 질문 업데이트
                    allQuestions[`question${questionNumber}_audio`] = audioUrl;

                    const completedQuestions = Object.values(allQuestions).filter(url => url && url.trim() !== '').length;
                    updateData.status = completedQuestions === 3 ? 'completed' : 'in_progress';
                    updateData.questions_answered = completedQuestions;

                    const { data: updateResult, error: updateError } = await supabase
                        .from('korean_tests')
                        .update(updateData)
                        .eq('user_id', userId)
                        .select()
                        .single();

                    if (updateError) throw updateError;
                    result = { data: updateResult, error: null };
                } else {
                    // 새 레코드 생성
                    const koreanTestData = {
                        user_id: userId,
                        [`question${questionNumber}_audio`]: audioUrl,
                        test_date: new Date().toISOString(),
                        status: 'in_progress',
                        duration: parseInt(duration),
                        questions_answered: 1
                    };

                    const { data: insertResult, error: insertError } = await supabase
                        .from('korean_tests')
                        .insert(koreanTestData)
                        .select()
                        .single();

                    if (insertError) throw insertError;
                    result = { data: insertResult, error: null };
                }

                const { data, error } = result;

                if (error) {
                    console.error('Database error during Korean test insert:', error);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to save Korean test information to database'
                    });
                }

                console.log('✅ Korean test saved successfully:', data);

                res.json({
                    success: true,
                    data: data
                });
            } catch (error) {
                console.error('Error processing Korean test:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error during Korean test processing'
                });
            }
        });

    } catch (error) {
        console.error('Korean test upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Korean test upload failed'
        });
    }
};

// 한국어 테스트 완료 여부 조회
const getKoreanTestStatus = async (req, res) => {
    try {
        const userId = req.user.userId;

        const { data, error } = await supabase
            .from('korean_tests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch Korean test status'
            });
        }

        const latestTest = data?.[0] || null;
        const isCompleted = latestTest && latestTest.status.includes('completed');

        res.json({
            success: true,
            data: {
                korean_test_completed: isCompleted,
                latest_test: latestTest
            }
        });
    } catch (error) {
        console.error('Korean test status error:', error);
        res.status(500).json({
            success: false,
            error: 'Korean test status check failed'
        });
    }
};

// 한국어 테스트 목록 조회
const getKoreanTests = async (req, res) => {
    try {
        const userId = req.user.userId;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const { data, error } = await supabase
            .from('korean_tests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch Korean tests'
            });
        }

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Korean tests fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Korean tests fetch failed'
        });
    }
};

// 최신 한국어 테스트 조회
const getLatestKoreanTest = async (req, res) => {
    try {
        const userId = req.user.userId;

        const { data, error } = await supabase
            .from('korean_tests')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch latest Korean test'
            });
        }

        res.json({
            success: true,
            data: data?.[0] || null
        });
    } catch (error) {
        console.error('Latest Korean test fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Latest Korean test fetch failed'
        });
    }
};

// 개별 질문별 한국어 테스트 조회
const getKoreanTestByQuestions = async (req, res) => {
    try {
        const { userId } = req.params;

        console.log('🎵 Fetching korean test for userId:', userId);

        const { data, error } = await supabase
            .from('korean_tests')
            .select('question1_audio, question2_audio, question3_audio, status, score')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch Korean test by questions'
            });
        }

        // 데이터가 없는 경우 처리
        if (!data || data.length === 0) {
            console.log('❌ No korean test found for user:', userId);
            return res.json({
                success: true,
                data: null
            });
        }

        const testData = data[0];

        // Presigned URL 생성 함수
        const generatePresignedUrl = (s3Url) => {
            if (!s3Url) return null;

            try {
                // S3 URL에서 키 추출 (예: https://bucket.s3.region.amazonaws.com/path/to/file.m4a)
                const urlParts = s3Url.split('/');
                const key = urlParts.slice(3).join('/'); // 도메인 뒤의 모든 경로

                console.log(`🔗 Generating presigned URL for key: ${key}`);

                // Presigned URL 생성 (1시간 유효)
                const presignedUrl = s3.getSignedUrl('getObject', {
                    Bucket: S3_BUCKET,
                    Key: key,
                    Expires: 3600 // 1시간
                });

                console.log(`✅ Presigned URL generated: ${presignedUrl.substring(0, 100)}...`);
                return presignedUrl;
            } catch (error) {
                console.error(`❌ Failed to generate presigned URL for: ${s3Url}`, error);
                return s3Url; // 실패 시 원본 URL 반환
            }
        };

        // 질문별 오디오 URL 정리 (Presigned URL로 변환)
        const questionAudios = {
            question1_audio: generatePresignedUrl(testData?.question1_audio),
            question2_audio: generatePresignedUrl(testData?.question2_audio),
            question3_audio: generatePresignedUrl(testData?.question3_audio),
            status: testData?.status || null,
            score: testData?.score || null
        };

        console.log('✅ Korean test data prepared with presigned URLs:', {
            ...questionAudios,
            question1_audio: questionAudios.question1_audio ? `${questionAudios.question1_audio.substring(0, 50)}...` : null,
            question2_audio: questionAudios.question2_audio ? `${questionAudios.question2_audio.substring(0, 50)}...` : null,
            question3_audio: questionAudios.question3_audio ? `${questionAudios.question3_audio.substring(0, 50)}...` : null
        });

        res.json({
            success: true,
            data: questionAudios
        });
    } catch (error) {
        console.error('Korean test by questions fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Korean test by questions fetch failed'
        });
    }
};

// 한국어 테스트 배치 업로드 (모든 질문을 한 번에 처리)
const uploadKoreanTestBatch = async (req, res) => {
    try {
        console.log('📤 Korean test batch upload request received');

        // S3 관련 설정 확인
        if (!isConfigured) {
            console.error('❌ S3 not configured');
            return res.status(500).json({
                success: false,
                error: 'File upload service not configured'
            });
        }

        const upload = multer({
            storage: multerS3({
                s3: s3,
                bucket: S3_BUCKET,
                metadata: function (req, file, cb) {
                    cb(null, { fieldName: file.fieldname });
                },
                key: function (req, file, cb) {
                    const userId = req.body.user_id || req.user?.userId;
                    const timestamp = Date.now();
                    const ext = path.extname(file.originalname) || '.m4a';

                    // 파일 필드명에서 질문 번호 추출 (audio_1, audio_2, audio_3)
                    const questionNumber = file.fieldname.split('_')[1] || '1';
                    console.log(`🎙️ Generating S3 key for batch upload - user: ${userId}, question: ${questionNumber}, file: ${file.originalname}`);
                    cb(null, `${S3_AUDIO_PREFIX}korean_test/${userId}/${timestamp}_q${questionNumber}${ext}`);
                },
                contentType: multerS3.AUTO_CONTENT_TYPE
            }),
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB 제한
            },
            fileFilter: function (req, file, cb) {
                console.log(`📁 Batch file filter - fieldname: ${file.fieldname}, mimetype: ${file.mimetype}, originalname: ${file.originalname}`);
                // 오디오 파일만 허용
                const allowedMimes = [
                    'audio/mp4',
                    'audio/mpeg',
                    'audio/wav',
                    'audio/m4a',
                    'audio/x-m4a',
                    'audio/aac',
                    'audio/webm'
                ];
                if (allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    console.log(`❌ File type not allowed: ${file.mimetype}`);
                    cb(new Error('Invalid file type. Only audio files are allowed.'));
                }
            }
        });

        // 최대 3개 파일 업로드 (audio_1, audio_2, audio_3)
        const uploadFields = upload.fields([
            { name: 'audio_1', maxCount: 1 },
            { name: 'audio_2', maxCount: 1 },
            { name: 'audio_3', maxCount: 1 }
        ]);

        uploadFields(req, res, async (err) => {
            if (err) {
                console.error('Batch upload error:', err);
                return res.status(400).json({
                    success: false,
                    error: err.message
                });
            }

            try {
                const userId = req.body.user_id || req.user.userId;
                console.log('📊 Processing Korean test batch data:', {
                    hasBody: !!req.body,
                    bodyKeys: req.body ? Object.keys(req.body) : 'no body',
                    hasFiles: !!req.files,
                    filesKeys: req.files ? Object.keys(req.files) : 'no files',
                    userId
                });

                if (!req.files || Object.keys(req.files).length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No audio files provided'
                    });
                }

                // 업로드된 파일들에서 S3 URL 추출
                const audioUrls = {
                    question1_audio: null,
                    question2_audio: null,
                    question3_audio: null
                };

                // 각 질문별 오디오 URL 할당
                if (req.files.audio_1 && req.files.audio_1[0]) {
                    audioUrls.question1_audio = req.files.audio_1[0].location;
                    console.log('✅ Question 1 uploaded:', audioUrls.question1_audio);
                }
                if (req.files.audio_2 && req.files.audio_2[0]) {
                    audioUrls.question2_audio = req.files.audio_2[0].location;
                    console.log('✅ Question 2 uploaded:', audioUrls.question2_audio);
                }
                if (req.files.audio_3 && req.files.audio_3[0]) {
                    audioUrls.question3_audio = req.files.audio_3[0].location;
                    console.log('✅ Question 3 uploaded:', audioUrls.question3_audio);
                }

                console.log('💾 Saving batch audio to database:', {
                    userId,
                    audioUrls
                });

                // 기존 레코드가 있는지 확인
                const { data: existingRecords, error: selectError } = await supabase
                    .from('korean_tests')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (selectError) {
                    console.error('Database select error:', selectError);
                    throw selectError;
                }

                const existingRecord = existingRecords?.[0] || null;

                let result;
                if (existingRecord) {
                    // 기존 레코드 업데이트 (모든 질문을 한 번에)
                    const updateData = {
                        ...audioUrls,
                        test_date: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    // 모든 질문이 완료되었는지 확인
                    const completedQuestions = Object.values(audioUrls).filter(url => url && url.trim() !== '').length;
                    updateData.status = completedQuestions === 3 ? 'completed' : 'in_progress';
                    updateData.questions_answered = completedQuestions;

                    console.log('🔄 Updating existing record with batch data:', updateData);

                    const { data: updateResult, error: updateError } = await supabase
                        .from('korean_tests')
                        .update(updateData)
                        .eq('user_id', userId)
                        .select()
                        .single();

                    if (updateError) throw updateError;
                    result = { data: updateResult, error: null };
                } else {
                    // 새 레코드 생성
                    const completedQuestions = Object.values(audioUrls).filter(url => url && url.trim() !== '').length;
                    const koreanTestData = {
                        user_id: userId,
                        ...audioUrls,
                        test_date: new Date().toISOString(),
                        status: completedQuestions === 3 ? 'completed' : 'in_progress',
                        duration: 15, // 질문당 15초
                        questions_answered: completedQuestions
                    };

                    console.log('🆕 Creating new record with batch data:', koreanTestData);

                    const { data: insertResult, error: insertError } = await supabase
                        .from('korean_tests')
                        .insert(koreanTestData)
                        .select()
                        .single();

                    if (insertError) throw insertError;
                    result = { data: insertResult, error: null };
                }

                const { data, error } = result;

                if (error) {
                    console.error('Database error during Korean test batch insert:', error);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to save Korean test batch information to database'
                    });
                }

                console.log('✅ Korean test batch saved successfully:', data);

                res.json({
                    success: true,
                    data: {
                        ...data,
                        ...audioUrls
                    }
                });
            } catch (error) {
                console.error('Error processing Korean test batch:', error);
                res.status(500).json({
                    success: false,
                    error: 'Internal server error during Korean test batch processing'
                });
            }
        });

    } catch (error) {
        console.error('Korean test batch upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Korean test batch upload failed'
        });
    }
};

module.exports = {
    uploadKoreanTest,
    uploadKoreanTestBatch,
    getKoreanTestStatus,
    // getKoreanTests, // 미사용으로 주석 처리
    // getLatestKoreanTest, // 미사용으로 주석 처리
    getKoreanTestByQuestions
};