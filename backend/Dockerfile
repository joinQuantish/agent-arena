FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source
COPY src ./src/
COPY tsconfig.json ./

# Expose port
EXPOSE 3001

# Start
CMD ["npx", "tsx", "src/index.ts"]
