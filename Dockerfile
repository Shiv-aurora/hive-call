FROM public.ecr.aws/docker/library/node:22-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-slim AS runner
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV NODE_ENV=production PORT=8080 AWS_LWA_PORT=8080 AWS_LWA_READINESS_CHECK_PATH=/api/health AWS_LWA_READINESS_CHECK_HEALTHY_STATUS=100-399
WORKDIR /var/task
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
