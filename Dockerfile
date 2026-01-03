# ---------- 1️⃣ Build stage ----------
FROM node:24-bookworm AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && \
      pnpm install --prod --dangerously-allow-all-builds --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      corepack enable && yarn install --frozen-lockfile; \
    else \
      npm ci; \
    fi

COPY . .

RUN if [ -f tsconfig.json ]; then \
      npm run build || pnpm run build || yarn build; \
    fi

# ---------- 2️⃣ Runtime stage ----------
FROM node:24-slim AS runner

# Install ffmpeg (and minimal TLS/CA support)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && \
      pnpm install --prod --dangerously-allow-all-builds --frozen-lockfile && \
      pnpm add tsx --save-prod; \
    elif [ -f yarn.lock ]; then \
      corepack enable && \
      yarn install --production --frozen-lockfile && \
      yarn global add tsx; \
    else \
      npm ci --omit=dev && \
      npm install -g tsx; \
    fi

COPY tsconfig.json ./
COPY --from=builder /app/src ./src
COPY build-system ./build-system

EXPOSE 1612

# Optional: quick verify at container start (remove if you don’t want it)
# RUN ffmpeg -version

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
