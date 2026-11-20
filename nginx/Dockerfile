FROM node:20-bookworm-slim AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/app-locations.conf /etc/nginx/snippets/app-locations.conf
COPY nginx/ensure-certs.sh /docker-entrypoint.d/05-ensure-certs.sh
RUN chmod +x /docker-entrypoint.d/05-ensure-certs.sh
COPY --from=build /src/dist /usr/share/nginx/html
