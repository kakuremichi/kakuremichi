FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY agent/go.mod agent/go.sum ./
RUN go mod download

# Copy source code
COPY agent/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o agent ./cmd/agent

# Production image
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/agent .

CMD ["./agent"]
