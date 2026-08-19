FROM node:20-alpine
WORKDIR /app
RUN mkdir -p uploads database
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chmod +x scripts/start-production.sh
ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "scripts/start-production.sh"]
