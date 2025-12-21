# Upload Lift Pro

DTF/özel baskı için Shopify customizer uygulaması.

## Tech Stack

- **Frontend:** Remix + Polaris (embedded admin)
- **Backend:** Node.js + TypeScript
- **Database:** PostgreSQL + Prisma
- **Queue:** Redis + BullMQ
- **Storage:** Cloudflare R2 (default) / S3
- **3D Engine:** Three.js + React Three Fiber
- **Proxy:** Caddy (auto-SSL)

## Kurulum

```bash
# Bağımlılıkları yükle
pnpm install

# Prisma client oluştur
pnpm db:generate

# Veritabanını migrate et
pnpm db:push

# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

## Proje Yapısı

```
upload-lift/
├── app/                     # Remix (admin/backend)
│   ├── lib/                 # Utilities (prisma, storage)
│   └── routes/              # API & page routes
├── extensions/
│   └── theme-extension/     # Storefront blocks & assets
├── workers/                 # BullMQ workers
├── prisma/                  # Schema & migrations
├── .github/workflows/       # CI/CD
└── package.json
```

## Environment Variables

`.env.example` dosyasını `.env` olarak kopyalayıp değerleri doldurun.

## Deployment

```bash
# GitHub'a push = otomatik deploy
git push origin main
```

## Lisans

Proprietary - All rights reserved.

