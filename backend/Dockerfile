FROM oven/bun:1.2

WORKDIR /app

# Copy package files
COPY package.json ./
COPY prisma ./prisma/

# Install dependencies
RUN bun install

# Generate Prisma client
RUN bunx prisma generate

# Copy source
COPY src ./src/
COPY tsconfig.json ./

# Expose port
EXPOSE 3001

# Start script that runs migrations then starts the app
CMD bunx prisma db push --skip-generate && bun run src/index.ts
