FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps && npm install react-is@^19.2.0 --legacy-peer-deps

COPY . .
RUN npm run build

FROM alpine:3.20

WORKDIR /app

COPY --from=build /app/dist ./dist

RUN adduser -D -u 1000 clearskies

USER clearskies

VOLUME /dist

CMD ["cp", "-r", "/app/dist/.", "/dist/"]
