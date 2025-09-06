const { supabase } = require('../config/database')
const sharp = require('sharp')

// 프로필 조회
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;

        // 기본 프로필 정보 가져오기
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            if (profileError.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: '프로필이 존재하지 않습니다.'
                });
            }
            throw profileError;
        }

        let fullProfile = profileData;

        // user 타입인 경우 user_info 가져오기
        if (profileData.user_type === 'user') {
            const { data: userInfo, error: userInfoError } = await supabase
                .from('user_info')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (!userInfoError && userInfo) {
                fullProfile.user_info = userInfo;
            }
        }

        res.json({
            success: true,
            data: fullProfile
        });

    } catch (error) {
        console.error('프로필 조회 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필을 불러오는데 실패했습니다.'
        });
    }
};

// 프로필 업데이트
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { profile: profileUpdates, userInfo: userInfoUpdates } = req.body;

        // 현재 프로필 정보 가져오기
        const { data: currentProfile, error: currentProfileError } = await supabase
            .from('profiles')
            .select('user_type')
            .eq('id', userId)
            .single();

        if (currentProfileError) {
            throw currentProfileError;
        }

        // 1. profiles 테이블 업데이트
        if (profileUpdates) {
            const { error } = await supabase
                .from('profiles')
                .update(profileUpdates)
                .eq('id', userId);

            if (error) throw error;
        }

        // 2. user_info 테이블 업데이트 (user 타입인 경우만)
        if (userInfoUpdates && currentProfile.user_type === 'user') {
            // user_info가 이미 있는지 확인
            const { data: existing } = await supabase
                .from('user_info')
                .select('id')
                .eq('user_id', userId)
                .single();

            if (existing) {
                // 업데이트
                const { error } = await supabase
                    .from('user_info')
                    .update(userInfoUpdates)
                    .eq('user_id', userId);

                if (error) throw error;
            } else {
                // 새로 생성
                const { error } = await supabase
                    .from('user_info')
                    .insert({
                        ...userInfoUpdates,
                        user_id: userId
                    });

                if (error) throw error;
            }
        }

        res.json({
            success: true,
            message: '프로필이 성공적으로 업데이트되었습니다.'
        });

    } catch (error) {
        console.error('프로필 업데이트 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필 업데이트에 실패했습니다.'
        });
    }
};

// 프로필 새로고침
const refreshProfile = async (req, res) => {
    try {
        // getProfile과 동일한 로직 사용
        await getProfile(req, res);
    } catch (error) {
        console.error('프로필 새로고침 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필 새로고침에 실패했습니다.'
        });
    }
};

// 구직자 목록 조회 (회사용)
const getJobSeekers = async (req, res) => {
    try {
        const { data: jobSeekers, error } = await supabase
            .from('profiles')
            .select(`
                *,
                user_info!user_info_user_id_fkey (
                    age,
                    gender,
                    visa,
                    korean_level
                ),
                user_keywords:user_keyword (
                    keyword:keyword_id (
                        id,
                        keyword,
                        category
                    )
                )
            `)
            .eq('user_type', 'user')
            .eq('job_seeking_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data: jobSeekers || []
        });
    } catch (error) {
        console.error('구직자 목록 조회 실패:', error);
        res.status(500).json({
            success: false,
            error: '구직자 목록을 불러오는데 실패했습니다.'
        });
    }
};

// 특정 사용자 프로필 조회 (회사용)
const getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId가 필요합니다.'
            });
        }

        const { data: profileData, error } = await supabase
            .from('profiles')
            .select('id, name, user_type, profile_image_url')
            .eq('id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    success: false,
                    error: '사용자가 존재하지 않습니다.'
                });
            }
            throw error;
        }

        res.json({
            success: true,
            data: profileData
        });

    } catch (error) {
        console.error('사용자 프로필 조회 실패:', error);
        res.status(500).json({
            success: false,
            error: '사용자 프로필을 불러오는데 실패했습니다.'
        });
    }
};

// Push token 업데이트
exports.updatePushToken = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Push token이 필요합니다.'
            });
        }

        const { error } = await supabase
            .from('profiles')
            .update({ 
                push_token: token,
                push_token_updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Push token이 업데이트되었습니다.'
        });

    } catch (error) {
        console.error('Push token 업데이트 실패:', error);
        res.status(500).json({
            success: false,
            error: 'Push token 업데이트에 실패했습니다.'
        });
    }
};

// Push token 제거
exports.removePushToken = async (req, res) => {
    try {
        const userId = req.user.userId;

        const { error } = await supabase
            .from('profiles')
            .update({ 
                push_token: null,
                push_token_updated_at: new Date().toISOString()
            })
            .eq('id', userId);

        if (error) throw error;

        res.json({
            success: true,
            message: 'Push token이 제거되었습니다.'
        });

    } catch (error) {
        console.error('Push token 제거 실패:', error);
        res.status(500).json({
            success: false,
            error: 'Push token 제거에 실패했습니다.'
        });
    }
};

// 프로필 이미지 업로드
const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { base64Image, mimeType } = req.body;

        if (!base64Image) {
            return res.status(400).json({
                success: false,
                error: '이미지 데이터가 필요합니다.'
            });
        }

        // Base64에서 데이터 추출
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Sharp를 사용하여 이미지 리사이징 및 최적화
        const resizedBuffer = await sharp(buffer)
            .resize(1024, 1024, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })  // JPEG로 변환하고 품질 80%로 설정
            .toBuffer();

        // 파일 확장자 결정 (리사이징 후 항상 JPEG로 저장)
        const fileName = `${userId}_${Date.now()}.jpeg`;
        const filePath = `profile_images/${fileName}`;

        // Supabase Storage에 업로드
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile_image')
            .upload(filePath, resizedBuffer, {
                contentType: 'image/jpeg',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Public URL 생성
        const { data: { publicUrl } } = supabase.storage
            .from('profile_image')
            .getPublicUrl(filePath);

        // profiles 테이블 업데이트
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ profile_image_url: publicUrl })
            .eq('id', userId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: {
                url: publicUrl,
                path: filePath
            },
            message: '프로필 이미지가 업로드되었습니다.'
        });

    } catch (error) {
        console.error('프로필 이미지 업로드 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필 이미지 업로드에 실패했습니다.'
        });
    }
};

// 프로필 이미지 수정
const updateProfileImage = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { base64Image, mimeType } = req.body;

        if (!base64Image) {
            return res.status(400).json({
                success: false,
                error: '이미지 데이터가 필요합니다.'
            });
        }

        // 기존 이미지 URL 가져오기
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('profile_image_url')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        // 기존 이미지가 있으면 삭제
        if (profile.profile_image_url) {
            const oldPath = profile.profile_image_url.split('/').slice(-2).join('/');
            await supabase.storage
                .from('profile_image')
                .remove([oldPath]);
        }

        // 새 이미지 업로드
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Sharp를 사용하여 이미지 리사이징 및 최적화
        const resizedBuffer = await sharp(buffer)
            .resize(1024, 1024, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })  // JPEG로 변환하고 품질 80%로 설정
            .toBuffer();

        // 파일 확장자 결정 (리사이징 후 항상 JPEG로 저장)
        const fileName = `${userId}_${Date.now()}.jpeg`;
        const filePath = `profile_images/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile_image')
            .upload(filePath, resizedBuffer, {
                contentType: 'image/jpeg',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Public URL 생성
        const { data: { publicUrl } } = supabase.storage
            .from('profile_image')
            .getPublicUrl(filePath);

        // profiles 테이블 업데이트
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ profile_image_url: publicUrl })
            .eq('id', userId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            data: {
                url: publicUrl,
                path: filePath
            },
            message: '프로필 이미지가 수정되었습니다.'
        });

    } catch (error) {
        console.error('프로필 이미지 수정 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필 이미지 수정에 실패했습니다.'
        });
    }
};

// 프로필 이미지 삭제
const deleteProfileImage = async (req, res) => {
    try {
        const userId = req.user.userId;

        // 현재 프로필 이미지 URL 가져오기
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('profile_image_url')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        if (!profile.profile_image_url) {
            return res.status(404).json({
                success: false,
                error: '삭제할 프로필 이미지가 없습니다.'
            });
        }

        // Storage에서 이미지 삭제
        const imagePath = profile.profile_image_url.split('/').slice(-2).join('/');
        const { error: deleteError } = await supabase.storage
            .from('profile_image')
            .remove([imagePath]);

        if (deleteError) throw deleteError;

        // profiles 테이블에서 URL 제거
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ profile_image_url: null })
            .eq('id', userId);

        if (updateError) throw updateError;

        res.json({
            success: true,
            message: '프로필 이미지가 삭제되었습니다.'
        });

    } catch (error) {
        console.error('프로필 이미지 삭제 실패:', error);
        res.status(500).json({
            success: false,
            error: '프로필 이미지 삭제에 실패했습니다.'
        });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    refreshProfile,
    getJobSeekers,
    getUserProfile,
    updatePushToken: exports.updatePushToken,
    removePushToken: exports.removePushToken,
    uploadProfileImage,
    updateProfileImage,
    deleteProfileImage
};