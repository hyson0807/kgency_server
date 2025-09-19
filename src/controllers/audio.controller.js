const { s3, S3_BUCKET, S3_AUDIO_PREFIX, isConfigured } = require('../config/s3.config');
const { supabase } = require('../config/database');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// S3 업로드 설정
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
            console.log(`🎙️ Generating S3 key for user: ${userId}, file: ${file.originalname}`);
            cb(null, `${S3_AUDIO_PREFIX}${userId}/${timestamp}${ext}`);
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

// Presigned URL 생성 (클라이언트 직접 업로드용)
const getUploadUrl = async (req, res) => {
    try {
        const { fileName, fileType } = req.body;
        const userId = req.user.userId;

        if (!fileName || !fileType) {
            return res.status(400).json({
                success: false,
                error: 'fileName and fileType are required'
            });
        }

        const timestamp = Date.now();
        const ext = path.extname(fileName);
        const key = `${S3_AUDIO_PREFIX}${userId}/${timestamp}${ext}`;

        const params = {
            Bucket: S3_BUCKET,
            Key: key,
            ContentType: fileType,
            Expires: 3600, // 1시간 유효
        };

        const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

        res.json({
            success: true,
            data: {
                uploadUrl,
                key,
                audioUrl: `https://${S3_BUCKET}.s3.ap-northeast-2.amazonaws.com/${key}`
            }
        });
    } catch (error) {
        console.error('Error generating upload URL:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 오디오 업로드 (서버 경유)
const uploadAudio = async (req, res) => {
    console.log('=== Audio Upload Request ===');
    console.log('Headers:', req.headers);
    console.log('User from auth:', req.user);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('S3 configured:', isConfigured);

    // S3 설정 확인
    if (!isConfigured) {
        console.log('❌ S3 not configured');
        return res.status(500).json({
            success: false,
            error: 'S3 credentials not configured. Please contact administrator.'
        });
    }

    upload(req, res, async function (err) {
        console.log('=== After Multer Processing ===');
        console.log('Body fields:', req.body ? Object.keys(req.body) : 'No body');
        console.log('File info:', req.file ? `${req.file.fieldname} - ${req.file.size} bytes` : 'No file');
        console.log('Upload error:', err);

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
            const title = req.body.title || `음성 ${new Date().toLocaleDateString()}`;
            const description = req.body.description || '';
            const duration = req.body.duration || null;

            // S3 URL
            const audioUrl = req.file.location;

            // DB에 저장 (테이블 없을 때 처리)
            let audioData = {
                user_id: userId,
                audio_url: audioUrl,
                title: title,
                description: description,
                duration: duration,
                file_size: req.file.size,
            };

            // DB에 오디오 정보 저장
            const { data, error } = await supabase
                .from('user_audios')
                .insert(audioData)
                .select()
                .single();

            if (error) {
                console.error('Database error during audio insert:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to save audio information to database'
                });
            }

            audioData = data;

            res.json({
                success: true,
                data: audioData
            });
        } catch (error) {
            console.error('Error saving audio info:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
};

// 오디오 정보 저장 (클라이언트가 직접 업로드 후)
const saveAudioInfo = async (req, res) => {
    try {
        const { audio_url, title, description, duration, file_size } = req.body;
        const userId = req.user.userId;

        if (!audio_url) {
            return res.status(400).json({
                success: false,
                error: 'audio_url is required'
            });
        }

        const { data, error } = await supabase
            .from('user_audios')
            .insert({
                user_id: userId,
                audio_url,
                title: title || `음성 ${new Date().toLocaleDateString()}`,
                description,
                duration,
                file_size
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error saving audio info:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 사용자 오디오 목록 조회
const getUserAudios = async (req, res) => {
    try {
        const userId = req.user.userId;

        const { data, error } = await supabase
            .from('user_audios')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Error fetching audios:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 오디오 삭제 (soft delete + S3 파일 삭제)
const deleteAudio = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // 먼저 오디오 정보를 가져옴
        const { data: audioData, error: fetchError } = await supabase
            .from('user_audios')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (fetchError || !audioData) {
            return res.status(404).json({
                success: false,
                error: 'Audio not found or already deleted'
            });
        }

        // S3에서 파일 삭제
        try {
            if (audioData.audio_url && isConfigured) {
                // S3 URL에서 키 추출
                const urlParts = audioData.audio_url.split('/');
                const key = urlParts.slice(3).join('/'); // 도메인 부분 제거

                console.log(`🗑️ Deleting S3 object: ${key}`);

                const deleteParams = {
                    Bucket: S3_BUCKET,
                    Key: key
                };

                await s3.deleteObject(deleteParams).promise();
                console.log(`✅ Successfully deleted S3 object: ${key}`);
            }
        } catch (s3Error) {
            console.error('Error deleting from S3:', s3Error);
            // S3 삭제 실패해도 DB에서는 삭제 진행
        }

        // DB에서 soft delete
        const { data, error } = await supabase
            .from('user_audios')
            .update({ is_active: false })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            message: 'Audio and S3 file deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting audio:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Presigned URL 생성 (오디오 조회용)
const getAudioUrl = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // DB에서 오디오 정보 조회
        const { data: audio, error } = await supabase
            .from('user_audios')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error) throw error;

        if (!audio) {
            return res.status(404).json({
                success: false,
                error: 'Audio not found'
            });
        }

        // S3 키 추출 (URL에서)
        const urlParts = audio.audio_url.split('/');
        const key = urlParts.slice(3).join('/'); // 도메인 부분 제거

        // Presigned URL 생성 (1시간 유효)
        const params = {
            Bucket: S3_BUCKET,
            Key: key,
            Expires: 3600
        };

        const presignedUrl = await s3.getSignedUrlPromise('getObject', params);

        res.json({
            success: true,
            data: {
                ...audio,
                presigned_url: presignedUrl
            }
        });
    } catch (error) {
        console.error('Error getting audio URL:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// 영구 삭제 (hard delete) - 관리자용
const permanentDeleteAudio = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        // 먼저 오디오 정보를 가져옴 (soft delete된 것도 포함)
        const { data: audioData, error: fetchError } = await supabase
            .from('user_audios')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (fetchError || !audioData) {
            return res.status(404).json({
                success: false,
                error: 'Audio not found'
            });
        }

        // S3에서 파일 삭제
        try {
            if (audioData.audio_url && isConfigured) {
                const urlParts = audioData.audio_url.split('/');
                const key = urlParts.slice(3).join('/');

                console.log(`🗑️ Permanently deleting S3 object: ${key}`);

                await s3.deleteObject({
                    Bucket: S3_BUCKET,
                    Key: key
                }).promise();

                console.log(`✅ Permanently deleted S3 object: ${key}`);
            }
        } catch (s3Error) {
            console.error('Error deleting from S3:', s3Error);
            // S3 삭제 실패해도 DB에서는 삭제 진행
        }

        // DB에서 완전 삭제
        const { error } = await supabase
            .from('user_audios')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Audio permanently deleted from both database and S3'
        });
    } catch (error) {
        console.error('Error permanently deleting audio:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    getUploadUrl,
    uploadAudio,
    saveAudioInfo,
    getUserAudios,
    deleteAudio,
    permanentDeleteAudio,
    getAudioUrl
};