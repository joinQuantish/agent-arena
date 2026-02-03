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

# Expose port (Render uses PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3001}/health || exit 1

# Run
CMD ["bun", "run", "src/index.ts"]
