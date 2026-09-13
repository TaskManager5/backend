FROM node:20-alpine

WORKDIR /app

# Копируем только манифесты для кэширования слоёв
COPY package*.json ./

# Чистая установка production-зависимостей
RUN npm ci --omit=dev

# Копируем исходники
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
