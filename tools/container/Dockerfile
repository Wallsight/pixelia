# Test container: Linux, Node and headless Chromium (software WebGL via
# SwiftShader). It runs the Vite dev server and tools/shot.mjs entirely inside
# the container, so nothing listens on the host. See tools/container/run.sh.
FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
