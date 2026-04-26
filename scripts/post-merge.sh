#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install --legacy-peer-deps

echo "==> Building server..."
npm run server:build

echo "==> Post-merge setup complete."
