# Node 18 base image
FROM node:18-alpine

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json* ./

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

# Copy project source
COPY . .

# Environment settings for local development and file watcher polling on Windows/Docker
ENV PORT=3002 \
    CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true \
    WDS_SOCKET_PORT=0

EXPOSE 3002

# Start development server directly via react-scripts to avoid Windows cmd syntax
CMD ["npx", "react-scripts", "start"]
