# 배포 환경 설정 가이드

## Render.com 배포 (권장)

Render.com에서는 FFmpeg가 기본적으로 제공됩니다.

### 1. Render 배포 설정
- `render.yaml` 파일이 포함되어 있습니다
- 환경변수 `FFMPEG_PATH=ffmpeg`로 설정됨
- 추가 설치 불필요

### 2. 환경변수 설정
Render 대시보드에서 다음 환경변수들을 설정:
```
NODE_ENV=production
FFMPEG_PATH=ffmpeg
# 기타 필요한 환경변수들...
```

## 기타 플랫폼 배포

### Ubuntu/Debian 서버
```bash
sudo apt update
sudo apt install ffmpeg
```

### CentOS/RHEL 서버
```bash
sudo yum install epel-release
sudo yum install ffmpeg
```

### Docker 환경 설정

Dockerfile에 FFmpeg 설치 추가:

```dockerfile
# Ubuntu 기반
FROM node:18
RUN apt-get update && apt-get install -y ffmpeg

# Alpine 기반
FROM node:18-alpine
RUN apk add --no-cache ffmpeg
```

## 환경변수 설정

### FFmpeg 커스텀 경로 (선택사항)
```bash
FFMPEG_PATH=/path/to/ffmpeg
```

### 기본 경로들
- **개발환경 (macOS)**: `/opt/homebrew/bin/ffmpeg` 또는 `/usr/local/bin/ffmpeg`
- **배포환경 (Linux)**: `/usr/bin/ffmpeg` 또는 `/usr/local/bin/ffmpeg`

## 확인 방법

서버 시작 시 로그에서 FFmpeg 경로 확인:
```
🎬 FFmpeg path set for production: /usr/bin/ffmpeg
```

FFmpeg 설치 확인:
```bash
ffmpeg -version
```

## 주의사항

- FFmpeg가 설치되지 않으면 AI 음성 합성 기능이 작동하지 않습니다
- temp 디렉토리는 자동으로 생성됩니다
- S3 권한 설정도 함께 확인해주세요