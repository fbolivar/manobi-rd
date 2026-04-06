FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev libx11-dev libxrandr-dev

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o manobi-agent .

FROM alpine:latest

WORKDIR /app
COPY --from=builder /app/manobi-agent .

ENTRYPOINT ["./manobi-agent"]
