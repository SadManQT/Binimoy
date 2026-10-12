# One image for both processes (spec D.13). Run it twice:
#   web:    docker run -p 3000:3000 --env-file .env binimoy
#   worker: docker run --env-file .env binimoy pnpm --filter @lp/worker start
# Packages are TypeScript source, so the image carries the workspace and its
# dependencies rather than a pruned bundle.
FROM node:24.11.1-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@12.11.2
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/adapters/package.json packages/adapters/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY packages/templates/package.json packages/templates/
RUN pnpm install --frozen-lockfile
COPY . .
# The build reads configuration; these values exist only for this step and
# are not in the final environment.
RUN APP_ENV=staging DATABASE_URL=postgres://build:build@127.0.0.1:5432/build \
    APP_URL=http://localhost:3000 AUTH_SECRET=build-only-build-only-build-only-0000 \
    PAYMENT_MODE=mock VERIFIER_MODE=mock RESEARCH_MODE=fixture AI_MODE=fixture \
    pnpm --filter @lp/web build
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@lp/web", "exec", "next", "start", "-p", "3000"]
