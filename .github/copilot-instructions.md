# 3D Customizer – Project Rules & Fixed Principles (MASTER DOCUMENT)

> **Version:** 3.1.0  
> **Last Updated:** December 21, 2025  
> **Project:** 3D Customizer - DTF/Print Customizer Shopify App  
> **Domain:** customizerapp.dev

---

## 🔗 Repository & Access

### GitHub Repository
```
git@github.com:Growth-Sheriff/customizerapp.git
```

### Server SSH Access
```powershell
# Windows PowerShell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_customizer_app root@5.78.136.98

# Linux/Mac
ssh -i ~/.ssh/id_ed25519_customizer_app root@5.78.136.98
```

### 3D Reference Repository
```
https://github.com/kt946/ai-threejs-products-app-yt-jsm
```

---

## 🔐 API Keys & Credentials (Test Environment)

### Shopify Dev Dashboard
```
Client ID: <SHOPIFY_CLIENT_ID>
Secret: <SHOPIFY_CLIENT_SECRET>
```

### Custom App
```
API Key: <SHOPIFY_API_KEY>
API Secret: <SHOPIFY_API_SECRET>
```

### Admin API
```
Access Token: <SHOPIFY_ADMIN_ACCESS_TOKEN>
```

### Storefront API
```
Token: <SHOPIFY_STOREFRONT_TOKEN>
```

### Application URLs
```
App URL: https://customizerapp.dev
Admin: https://customizerapp.dev/app
API: https://customizerapp.dev/api
Health: https://customizerapp.dev/health
```

---

## 🌍 Language & Localization

- i18n (multi-language) support enabled
- **All application content in English**
- **All responses to project owner in Turkish**
- Supported locales: `en` (default), `tr`, `de`, `es`

---

## 🔁 Development & Deployment Flow (NON-NEGOTIABLE)

```
LOCAL → GitHub → SERVER → BUILD / DEPLOY
```

### ❌ FORBIDDEN
- SCP / rsync / sftp / ftp
- Manual file transfer
- Direct server code editing
- Bypassing GitHub

### ✅ REQUIRED Workflow
```bash
# Local
pnpm dev && pnpm test && pnpm build

# Push
git push origin main

# Server
cd /var/www/3d-customizer
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:deploy
systemctl restart 3d-customizer
```

---

## 🖥️ Server & Infrastructure

| Item | Value |
|------|-------|
| OS | Ubuntu 24 LTS |
| Reverse Proxy | **Caddy** (auto SSL) |
| Node.js | 20 LTS |
| Package Manager | pnpm |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Storage | Cloudflare R2 (default) / S3 (option) |

### ❌ NGINX IS FORBIDDEN
```bash
systemctl stop nginx && systemctl disable nginx
apt-get remove --purge -y nginx nginx-common nginx-full
rm -rf /etc/nginx
```

---

## 🛍️ Shopify Integration Rules

| Rule | Value |
|------|-------|
| API Type | **GraphQL ONLY** |
| API Version | **2025-10** |
| REST API | ❌ FORBIDDEN |

### Webhooks
```
orders/create, orders/paid, orders/cancelled, orders/fulfilled
products/update, products/delete
app/uninstalled
customers/data_request (GDPR)
customers/redact (GDPR)
shop/redact (GDPR)
```

---

## 📦 Upload Rules

- Direct-to-storage via signed URLs
- Backend NEVER proxies files
- Default: Private access
- Download: Signed URLs (15 min expiry)
- Resumable upload for files > 5MB

---

## 🧩 3D Designer (Mod-1)

| Component | Technology |
|-----------|------------|
| 3D Engine | Three.js |
| React Integration | React Three Fiber |
| Helpers | @react-three/drei |
| State | Valtio / Zustand |

### Print Locations
- front, back, left_sleeve, right_sleeve

### Add to Cart Lock
- Location selected ✓
- File uploaded ✓
- No blocking errors ✓
- Approval checkbox checked ✓

---

## 🎨 UX Rules

### Step-Based Flow
```
LOCATION → UPLOAD → POSITION → CONFIRM
```

- Steps are locked (no skip)
- Visual feedback required after upload
- Validation badges: OK (green) / WARNING (yellow) / ERROR (red)
- Mobile 2D fallback; Desktop 3D 60fps

---

## 🧪 Coding Standards

- TypeScript strict mode
- Max 50 lines per function
- Explicit return types
- No implicit any
- Prisma tenant guard (shop_id scope)

---

## ✅ Absolute Red Lines

### ❌ FORBIDDEN
| Rule | Reason |
|------|--------|
| SCP | GitHub is single source |
| NGINX | Caddy only |
| REST API | GraphQL 2025-10 only |
| Backend file streaming | Direct-to-storage only |
| Skip approval step | UX requirement |
| Bare DB queries | Tenant isolation |

### ✅ REQUIRED
| Rule | Implementation |
|------|----------------|
| GitHub deployment | LOCAL → GitHub → Server |
| Caddy | Auto SSL |
| Shopify GraphQL 2025-10 | All operations |
| Tenant isolation | shop_id in all queries |
| Direct-to-storage | Signed URLs |
| Step-locked UX | 4-step flow |

---

## 📌 Final Note

This document is **binding** for all development, deployment, and AI assistance.

Any implementation violating these rules must be **rejected immediately**.

---

*Version: 3.1.0 | Domain: customizerapp.dev | App: 3D Customizer*
