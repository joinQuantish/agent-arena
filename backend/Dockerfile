FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY package.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY src ./src/
COPY tsconfig.json ./

# Expose port
EXPOSE 3001

# Push schema and start (|| true to not fail if DB push has issues)
CMD sh -c "npx prisma db push --skip-generate || true && npx tsx src/index.ts"
