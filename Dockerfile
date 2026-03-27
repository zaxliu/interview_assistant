# Stage 1: Build the application
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Build args for environment variables (embedded at build time)
ARG VITE_AI_API_KEY
ARG VITE_AI_MODEL
ARG VITE_FEISHU_APP_ID
ARG VITE_FEISHU_APP_SECRET

ENV VITE_AI_API_KEY=$VITE_AI_API_KEY
ENV VITE_AI_MODEL=$VITE_AI_MODEL
ENV VITE_FEISHU_APP_ID=$VITE_FEISHU_APP_ID
ENV VITE_FEISHU_APP_SECRET=$VITE_FEISHU_APP_SECRET

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:stable

# Copy HTTP/HTTPS templates. The custom entrypoint selects one of them and places
# it under /etc/nginx/templates before handing off to the nginx image entrypoint.
COPY nginx.conf.template /opt/interview-assistant/nginx/http.conf.template
COPY nginx.https.conf.template /opt/interview-assistant/nginx/https.conf.template
COPY docker-entrypoint.sh /usr/local/bin/app-entrypoint.sh
RUN chmod +x /usr/local/bin/app-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/app-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
