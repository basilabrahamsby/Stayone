# Node 18 base image
FROM node:18-alpine

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json* ./

# Install dependencies with legacy peer deps for React 18 compatibility
RUN npm install --legacy-peer-deps

# Copy project source
COPY . .

# Environment settings for local development and file watcher polling on Windows/Docker
ENV PORT=3000 \
    CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true \
    WDS_SOCKET_PORT=0

EXPOSE 3000

# Start development server
CMD ["npm", "start"]
