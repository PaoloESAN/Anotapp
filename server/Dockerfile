FROM oven/bun:latest AS base
WORKDIR /app

# Instalar dependencias
COPY package.json bun.lock* ./
RUN bun install --production

# Copiar código fuente
COPY . .

# Puerto por defecto de Railway
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
