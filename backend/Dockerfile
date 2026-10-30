FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server && CGO_ENABLED=0 go build -o /out/migrate ./cmd/migrate

FROM alpine:3.20
RUN adduser -D app
USER app
COPY --from=build /out/server /server
COPY --from=build /out/migrate /migrate
EXPOSE 8080
ENTRYPOINT ["/server"]
