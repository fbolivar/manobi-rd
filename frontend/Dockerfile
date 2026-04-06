FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ARG NEXT_PUBLIC_API_URL=http://192.168.50.5:3001
ARG NEXT_PUBLIC_WS_URL=ws://192.168.50.5:3001
ARG NEXT_PUBLIC_TURN_SERVER=turn:192.168.50.5:3478

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_TURN_SERVER=$NEXT_PUBLIC_TURN_SERVER

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p ./public
COPY --from=builder /app/public/ ./public/

ENV PORT=80
ENV HOSTNAME="0.0.0.0"

EXPOSE 80

CMD ["node", "server.js"]
