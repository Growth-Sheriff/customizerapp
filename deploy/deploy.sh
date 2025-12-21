#!/bin/bash
# ===========================================
# 3D Customizer - Deployment Script
# ===========================================
# Run this after git pull to deploy changes
# Usage: bash deploy/deploy.sh

set -e

APP_DIR="/var/www/3d-customizer"
SERVICE_NAME="3d-customizer"

echo "=========================================="
echo "3D Customizer - Deploying..."
echo "=========================================="

cd $APP_DIR

# Check if .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found!"
  echo "Copy .env.example to .env and configure it first."
  exit 1
fi

echo "[1/5] Pulling latest code from GitHub..."
git pull origin main

echo "[2/5] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[3/5] Running database migrations..."
pnpm db:migrate:deploy

echo "[4/5] Building application..."
pnpm build

echo "[5/5] Restarting service..."
systemctl restart $SERVICE_NAME

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo ""
echo "Check status: systemctl status $SERVICE_NAME"
echo "Check logs: journalctl -u $SERVICE_NAME -f"

