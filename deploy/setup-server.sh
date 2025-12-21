#!/bin/bash
# ===========================================
# 3D Customizer - Server Setup Script
# ===========================================
# Run this ONCE on a fresh Ubuntu 24 LTS server
# Usage: bash deploy/setup-server.sh

set -e

echo "=========================================="
echo "3D Customizer - Server Setup"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

echo -e "${GREEN}[1/8] Updating system...${NC}"
apt-get update && apt-get upgrade -y

echo -e "${GREEN}[2/8] Installing Node.js 20 LTS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo -e "${GREEN}[3/8] Installing pnpm...${NC}"
npm install -g pnpm

echo -e "${GREEN}[4/8] Installing PostgreSQL 16...${NC}"
apt-get install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER upload_lift WITH PASSWORD 'upload_lift_2025_secure';
CREATE DATABASE upload_lift OWNER upload_lift;
GRANT ALL PRIVILEGES ON DATABASE upload_lift TO upload_lift;
\c upload_lift
GRANT ALL ON SCHEMA public TO upload_lift;
EOF

echo -e "${GREEN}[5/8] Installing Redis 7...${NC}"
apt-get install -y redis-server
systemctl start redis-server
systemctl enable redis-server

echo -e "${GREEN}[6/8] Installing Caddy...${NC}"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# Remove nginx if exists
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true
apt-get remove --purge -y nginx nginx-common nginx-full 2>/dev/null || true

echo -e "${GREEN}[7/8] Setting up application directory...${NC}"
mkdir -p /var/www/3d-customizer
chown -R www-data:www-data /var/www/3d-customizer

echo -e "${GREEN}[8/8] Creating Caddyfile...${NC}"
cat > /etc/caddy/Caddyfile <<'CADDY'
customizerapp.dev {
    reverse_proxy localhost:3000
    header X-Content-Type-Options nosniff
    header Referrer-Policy strict-origin-when-cross-origin
    log {
        output file /var/log/caddy/upload-lift.log
        format json
    }
}
CADDY

mkdir -p /var/log/caddy
systemctl restart caddy
systemctl enable caddy

echo ""
echo -e "${GREEN}=========================================="
echo "Server setup complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Clone the repo: cd /var/www/3d-customizer && git clone git@github.com:Growth-Sheriff/customizerapp.git ."
echo "2. Copy .env: cp .env.example .env && nano .env"
echo "3. Run deploy: bash deploy/deploy.sh"
echo ""
echo -e "${YELLOW}PostgreSQL:${NC} postgresql://upload_lift:upload_lift_2025_secure@localhost:5432/upload_lift"
echo -e "${YELLOW}Redis:${NC} redis://localhost:6379"

