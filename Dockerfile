FROM node:22.23.4-alpine

WORKDIR /app

# Копируем только манифесты для кэширования слоёв
COPY package*.json ./

# Чистая установка production-зависимостей
RUN npm install --omit=dev

# Копируем исходники
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
