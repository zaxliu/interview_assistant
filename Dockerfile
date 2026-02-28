# Stage 1: Build the application
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Build args for environment variables (embedded at build time)
ARG VITE_AI_API_KEY
ARG VITE_AI_BASE_URL
ARG VITE_AI_MODEL
ARG VITE_NOTION_API_KEY
ARG VITE_NOTION_DATABASE_ID
ARG VITE_FEISHU_APP_ID
ARG VITE_FEISHU_APP_SECRET
ARG VITE_CORS_PROXY

ENV VITE_AI_API_KEY=$VITE_AI_API_KEY
ENV VITE_AI_BASE_URL=$VITE_AI_BASE_URL
ENV VITE_AI_MODEL=$VITE_AI_MODEL
ENV VITE_NOTION_API_KEY=$VITE_NOTION_API_KEY
ENV VITE_NOTION_DATABASE_ID=$VITE_NOTION_DATABASE_ID
ENV VITE_FEISHU_APP_ID=$VITE_FEISHU_APP_ID
ENV VITE_FEISHU_APP_SECRET=$VITE_FEISHU_APP_SECRET
ENV VITE_CORS_PROXY=$VITE_CORS_PROXY

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
