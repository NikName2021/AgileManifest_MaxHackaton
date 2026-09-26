FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000
# Прогоняем непримененные миграции перед стартом — раньше их нужно было накатывать вручную
# (npx prisma migrate deploy) после каждого docker compose up, что легко забыть и получить
# "table does not exist" на свежем контейнере. migrate deploy идемпотентен, безопасен на каждом старте.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
