#!/bin/bash
# Sutra Collections — Production Deployment Script
# Run this on a fresh Ubuntu 22.04 Google Cloud VM
# Usage: curl -O <raw_url>/deploy.sh && chmod +x deploy.sh && ./deploy.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Sutra Collections Deployment ===${NC}"
echo ""

# ── 1. Install Docker and Docker Compose ─────────────────────────────────────
echo -e "${YELLOW}[1/6] Installing Docker...${NC}"
sudo apt-get update -qq
sudo apt-get install -y docker.io docker-compose-v2 git curl

# Enable and start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Add current user to docker group (avoids needing sudo for docker commands)
sudo usermod -aG docker "$USER"
echo "    Docker installed. NOTE: log out and back in for docker group to take effect."
echo "    Continuing with sudo for this session..."

# ── 2. Clone the repository ───────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] Cloning repository...${NC}"
echo "Enter your Git repository URL (e.g. https://github.com/youruser/sutra-collections):"
read -r REPO_URL

if [ -d "/opt/sutra-collections" ]; then
  echo "    /opt/sutra-collections already exists — pulling latest..."
  cd /opt/sutra-collections
  git pull
else
  sudo git clone "$REPO_URL" /opt/sutra-collections
  sudo chown -R "$USER":"$USER" /opt/sutra-collections
  cd /opt/sutra-collections
fi

# ── 3. Configure environment ──────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Setting up environment...${NC}"
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────────┐"
  echo "  │  IMPORTANT: Edit /opt/sutra-collections/.env with real values  │"
  echo "  │                                                                 │"
  echo "  │  Required changes:                                              │"
  echo "  │  • POSTGRES_PASSWORD  — strong random password                  │"
  echo "  │  • DATABASE_URL       — must match POSTGRES_PASSWORD above       │"
  echo "  │  • SESSION_SECRET     — run: openssl rand -base64 64            │"
  echo "  │  • SA_SESSION_SECRET  — run: openssl rand -base64 64            │"
  echo "  │  • CRON_SECRET        — run: openssl rand -hex 32               │"
  echo "  │  • WHATSAPP_*         — from Meta Business Manager              │"
  echo "  └─────────────────────────────────────────────────────────────────┘"
  echo ""
  echo "  Opening .env in nano. Save with Ctrl+O, exit with Ctrl+X."
  echo "  Press Enter to open the editor..."
  read -r
  nano .env
else
  echo "    .env already exists — skipping."
fi

# ── 4. Build and start services ───────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Building Docker images and starting services...${NC}"
echo "    This will take 3–5 minutes on first run."
sudo docker compose -f docker-compose.prod.yml up -d --build

# Wait for app to be healthy
echo "    Waiting for app to be ready..."
for i in $(seq 1 30); do
  if sudo docker compose -f docker-compose.prod.yml exec -T app wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q "ok"; then
    echo "    App is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    WARNING: App didn't respond in 60s. Check logs: docker compose -f docker-compose.prod.yml logs app"
  fi
  sleep 2
done

# ── 5. Seed super admin ───────────────────────────────────────────────────────
echo -e "${YELLOW}[5/6] Setting up super admin...${NC}"
echo "  Enter the SA console password (you will use this to log into /sa-console-x7k2):"
read -rs SA_PASSWORD
echo ""

sudo docker compose -f docker-compose.prod.yml exec -T app \
  npx ts-node --project tsconfig.json scripts/seed-superadmin.ts "$SA_PASSWORD" 2>/dev/null || \
  echo "    (Super admin may already exist — skipping)"

# ── 6. Done ───────────────────────────────────────────────────────────────────
EXTERNAL_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "  App URL:          http://${EXTERNAL_IP}"
echo "  Health check:     http://${EXTERNAL_IP}/api/health"
echo "  SA Console:       http://${EXTERNAL_IP}/sa-console-x7k2"
echo ""
echo "  To set up SSL (HTTPS):"
echo "    sudo apt install certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d yourdomain.com"
echo "    Then uncomment the HTTPS server block in nginx/nginx.conf"
echo "    and run: docker compose -f docker-compose.prod.yml restart nginx"
echo ""
echo "  Useful commands:"
echo "    View logs:      docker compose -f docker-compose.prod.yml logs -f app"
echo "    Restart:        docker compose -f docker-compose.prod.yml restart app"
echo "    Update app:     git pull && docker compose -f docker-compose.prod.yml up -d --build app"
echo "    DB shell:       docker compose -f docker-compose.prod.yml exec db psql -U sutra sutra_db"
echo ""
