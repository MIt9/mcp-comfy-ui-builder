FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and config
COPY tsconfig.json ./
COPY src ./src
COPY knowledge ./knowledge
COPY doc ./doc
COPY README.md ./README.md

# Build TypeScript and seed knowledge (postbuild)
RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy runtime artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/knowledge ./knowledge
COPY package.json ./package.json

# Default environment variables for ComfyUI host/path can be overridden
ENV COMFYUI_HOST=http://127.0.0.1:8188

# MCP server runs over stdio (stdin/stdout)
ENTRYPOINT ["node", "dist/mcp-server.js"]

