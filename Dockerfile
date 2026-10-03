FROM node:24-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN npm install -g pnpm@12.8.0 && pnpm ci --silent

COPY . .

EXPOSE 3000

CMD ["pnpm", "dev"]
