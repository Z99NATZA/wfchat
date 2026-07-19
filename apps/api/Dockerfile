# syntax=docker/dockerfile:1

FROM rust:1-slim-bookworm AS build
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps/api/Cargo.toml apps/api/Cargo.toml
COPY apps/api/migrations apps/api/migrations
COPY apps/api/src apps/api/src

RUN cargo build --release --manifest-path apps/api/Cargo.toml

FROM debian:bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*

ENV APP_HOST=0.0.0.0
ENV APP_PORT=8080
ENV RUST_LOG=info

COPY --from=build /app/target/release/wfchat-api /usr/local/bin/wfchat-api

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 \
	CMD curl --fail --silent --show-error http://127.0.0.1:8080/api/health > /dev/null || exit 1
CMD ["wfchat-api"]
