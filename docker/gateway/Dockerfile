FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY gateway/go.mod gateway/go.sum ./
RUN go mod download

# Copy source code
COPY gateway/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o gateway ./cmd/gateway

# Production image
FROM alpine:latest

RUN apk --no-cache add ca-certificates iptables wireguard-tools

WORKDIR /root/

COPY --from=builder /app/gateway .

# Expose ports
EXPOSE 51820/udp 80 443

CMD ["./gateway"]
