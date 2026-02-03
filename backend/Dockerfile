FROM oven/bun:1.2

WORKDIR /app

# Copy package files
COPY backend/package.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN bun install --production

# Generate Prisma client
RUN bunx prisma generate

# Copy source
COPY backend/src ./src/
COPY backend/tsconfig.json ./

# Expose port
EXPOSE 3001

# Run
CMD ["bun", "run", "src/index.ts"]
