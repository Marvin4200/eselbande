FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
