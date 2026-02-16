# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Copy the entire repo
COPY . .

# IF we are building from the repository root, move into the Backend folder
# Otherwise, we stay in /app
RUN if [ -d "Backend" ]; then \
      mv Backend/* . && mv Backend/.[!.]* . 2>/dev/null || true; \
    fi

# Now package.json is guaranteed to be at /app/package.json
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build the NestJS app
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy package files for production install
COPY --from=builder /app/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy built artifacts and static folder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static

# Railway provides PORT
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/main"]