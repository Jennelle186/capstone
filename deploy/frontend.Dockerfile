FROM node:20-alpine AS build

WORKDIR /app

# Vite's bundler (Rollup) needs more heap than Node auto-sizes against a small
# container's RAM. On a 1 GB VPS the default limit is ~486 MB and the build dies
# with "JavaScript heap out of memory" during transforming. Build stage only —
# the runtime nginx image is unaffected. Swap absorbs the overflow.
ENV NODE_OPTIONS=--max-old-space-size=2048

ARG VITE_API_BASE_URL=""
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

COPY front-end/package.json front-end/package-lock.json ./
RUN npm ci

COPY front-end/ ./
RUN npm run build

FROM nginx:alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80