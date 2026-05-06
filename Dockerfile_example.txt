# Dockerfile

# Node.js 환경 사용
FROM node:20-alpine

# 앱 디렉토리 설정
WORKDIR /app

# 종속성 파일 복사 및 설치
# tsx는 실행 시 필요하므로 dependencies와 devDependencies를 모두 설치합니다.
COPY package*.json ./
RUN npm install

# 소스 코드 복사
COPY . .

ENV NODE_ENV=production
# Hugging Face Spaces 포트 설정
ENV PORT=7860
EXPOSE 7860

# 앱 실행: npm start (== tsx src/index.ts)
CMD ["npm", "start"]