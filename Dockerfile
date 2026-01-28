FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install -g pnpm@10.28.2 && pnpm install

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
