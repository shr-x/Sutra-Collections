# Sutra Collections — Production Deployment on Google Cloud VM

## Overview

This guide deploys Sutra Collections on a single Google Cloud VM using Docker Compose. All services (Next.js app, PostgreSQL, Nginx, backup, updater) run as Docker containers.

---

## 1. Create the Google Cloud VM

In the [GCP Console](https://console.cloud.google.com/compute/instances):

1. Click **Create Instance**
2. Set the following:

| Field | Value |
|---|---|
| **Machine type** | `e2-medium` (2 vCPU, 4 GB RAM) minimum; `e2-standard-2` recommended |
| **Boot disk** | Ubuntu 22.04 LTS, **50 GB SSD** |
| **Boot disk type** | Standard persistent disk (or SSD for faster DB) |
| **Region** | Choose closest to your customers (e.g. `asia-south1` for India) |

3. Under **Firewall**, tick:
   - ✅ Allow HTTP traffic
   - ✅ Allow HTTPS traffic
4. Click **Create**

Note your VM's **External IP address** — you'll need it.

---

## 2. Open Firewall Ports in GCP Console

Go to **VPC Network → Firewall** and ensure these rules exist:

| Rule Name | Direction | Protocol/Port | Source | Purpose |
|---|---|---|---|---|
| `allow-http` | Ingress | TCP 80 | 0.0.0.0/0 | Web traffic |
| `allow-https` | Ingress | TCP 443 | 0.0.0.0/0 | SSL traffic |
| `allow-ssh` | Ingress | TCP 22 | Your IP only | SSH access |

> **Do NOT** open port 5432 (PostgreSQL) or 3000 (Next.js) publicly — only nginx on 80/443 faces the internet.

---

## 3. SSH into the VM

```bash
# Using gcloud CLI:
gcloud compute ssh instance-name --zone=us-central1-a

# Or using standard SSH:
ssh -i ~/.ssh/your-key ubuntu@EXTERNAL_IP
```

---

## 4. Run the Deployment Script

```bash
# Download the deploy script from your repo
curl -O https://raw.githubusercontent.com/YOUR_GITHUB_USER/YOUR_REPO/main/deploy.sh
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Install Docker and Docker Compose
2. Clone your repository to `/opt/sutra-collections`
3. Ask you to configure `.env`
4. Build and start all Docker services
5. Seed the super admin account

---

## 5. Configure the .env File

When the script prompts, edit `/opt/sutra-collections/.env`:

```bash
nano /opt/sutra-collections/.env
```

**Required changes:**

```env
# Generate with: openssl rand -base64 64
SESSION_SECRET=PASTE_64_CHAR_RANDOM_STRING_HERE
SA_SESSION_SECRET=PASTE_DIFFERENT_64_CHAR_RANDOM_STRING_HERE

# Generate with: openssl rand -hex 32
CRON_SECRET=PASTE_32_CHAR_HEX_HERE

# Use a strong password
POSTGRES_PASSWORD=your_strong_database_password
DATABASE_URL=postgresql://sutra:your_strong_database_password@db:5432/sutra_db

# From Meta Business Manager → WhatsApp Business API
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_TOKEN=your_webhook_verify_token
```

---

## 6. Set Up a Domain Name (Optional but Recommended)

1. Buy a domain or use an existing one (e.g. `shr-x.in`)
2. In your DNS provider, add an **A record**:
   - **Name:** `@` (or `sutra` for a subdomain)
   - **Value:** Your VM's External IP
   - **TTL:** 300
3. Wait 5–30 minutes for DNS to propagate

---

## 7. Enable SSL / HTTPS with Let's Encrypt

Once DNS is pointing to your VM:

```bash
cd /opt/sutra-collections

# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Certbot will automatically edit nginx config.
# After success, uncomment the HTTPS server block in nginx/nginx.conf:
nano nginx/nginx.conf
# Then replace 'yourdomain.com' with your actual domain in the ssl block

# Restart nginx to apply
docker compose -f docker-compose.prod.yml restart nginx
```

**Auto-renew SSL** (certbot sets this up automatically, but verify):
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 8. Set Up the Cron Job for Daily Tasks

The daily cron (reminders, greetings, low-stock alerts) must be triggered externally:

```bash
# Add to crontab on the VM (runs at 9 AM IST = 3:30 UTC)
crontab -e
```

Add this line:
```
30 3 * * * curl -s -X POST http://localhost/api/cron/daily \
  -H "x-cron-secret: YOUR_CRON_SECRET_FROM_ENV" \
  >> /var/log/sutra-cron.log 2>&1
```

---

## 9. Set Up Cloudflare Tunnel (Alternative to Nginx/SSL)

If you use Cloudflare Tunnel (as originally configured), you can skip nginx and SSL setup:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create sutra-collections

# Configure tunnel to point to app
cat > ~/.cloudflared/config.yml << EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/$USER/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: shr-x.in
    service: http://localhost:3000
  - service: http_status:404
EOF

# Run as a service
sudo cloudflared service install
sudo systemctl start cloudflared
```

---

## 10. Monitoring & Maintenance

### Check service health
```bash
cd /opt/sutra-collections

# All services status
docker compose -f docker-compose.prod.yml ps

# App logs (live)
docker compose -f docker-compose.prod.yml logs -f app

# Health check
curl http://localhost/api/health
```

### Update the application
```bash
cd /opt/sutra-collections
git pull
docker compose -f docker-compose.prod.yml up -d --build app
```

### Database shell
```bash
docker compose -f docker-compose.prod.yml exec db psql -U sutra sutra_db
```

### Manual database backup
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U sutra sutra_db > /opt/sutra-collections/backups/manual-$(date +%Y%m%d).sql
```

### Restart all services
```bash
docker compose -f docker-compose.prod.yml restart
```

---

## Security Checklist

Before going live:

- [ ] Changed all default passwords in `.env`
- [ ] `SESSION_SECRET` is 64+ random characters
- [ ] `SA_SESSION_SECRET` is different from `SESSION_SECRET`
- [ ] SSH port 22 is restricted to your IP only in GCP firewall
- [ ] Port 5432 (PostgreSQL) is NOT exposed publicly
- [ ] Port 3000 (Next.js) is NOT exposed publicly (only nginx on 80/443)
- [ ] SSL certificate is active (or Cloudflare Tunnel is set up)
- [ ] Backups are running (`ls -la /opt/sutra-collections/backups/`)
- [ ] WhatsApp webhook is verified in Meta Business Manager
- [ ] Super admin password is strong and saved securely

---

## Resource Sizing Guide

| Usage | Recommended VM |
|---|---|
| Single store, <100 invoices/day | `e2-medium` (2 vCPU, 4 GB) |
| Single store, heavy tailoring | `e2-standard-2` (2 vCPU, 8 GB) |
| Multiple staff users | `e2-standard-4` (4 vCPU, 16 GB) |

Storage: Start with 50 GB SSD. Add more via GCP disk resize if backups grow large.
