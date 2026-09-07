# ModelVerse — one-command deploy.
# Build:   docker build -t modelverse .
# Run:     docker run -p 3000:3000 -v modelverse-models:/app/models modelverse
# Then open http://localhost:3000 and point it at Ollama/LM Studio or a .gguf.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY profiles ./profiles
COPY prompts ./prompts
COPY scripts/data ./scripts/data
RUN mkdir -p models logs
VOLUME ["/app/models", "/app/logs"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/version').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
