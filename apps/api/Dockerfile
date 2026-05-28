# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS build
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/src apps/api/src

RUN cargo build --release --manifest-path apps/api/Cargo.toml

FROM debian:bookworm-slim AS runtime
WORKDIR /app

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8080
ENV RUST_LOG=info

COPY --from=build /app/target/release/wfchat-api /usr/local/bin/wfchat-api

EXPOSE 8080
CMD ["wfchat-api"]
