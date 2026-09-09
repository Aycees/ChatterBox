FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at runtime, so this has to be a build ARG, not just an environment
# variable on the compose service. The browser (not this container) is
# what actually calls the API, so this must stay a host-reachable URL
# (localhost:8000, via the api service's port mapping) -- the in-network
# service name (http://api:8000) would only work for container-to-container
# calls, which this app never makes.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
