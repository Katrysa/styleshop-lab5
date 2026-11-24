FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production TRUST_PROXY=1 DB_PATH=/data/styleshop.db
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server/index.js"]
