
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

// Copy from app/lib/storage.server.ts because we can't easily import from app/ in scripts without alias setup sometimes
const LOCAL_FILE_SECRET = process.env.SECRET_KEY || 'fallback-secret-key'

function generateLocalFileToken(key: string, expiresAt: number): string {
  const payload = `${key}:${expiresAt}`
  const signature = crypto.createHmac('sha256', LOCAL_FILE_SECRET).update(payload).digest('hex')
  return `${expiresAt}.${signature}`
}

function isR2Key(key: string | null): boolean {
  return key?.startsWith('r2:') || false
}

async function audit() {
  // 48 hours ago
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
  
  console.log(`Searching for uploads since ${twoDaysAgo.toISOString()}...`)

  const uploads = await prisma.upload.findMany({
    where: {
      createdAt: {
        gte: twoDaysAgo
      }
    },
    include: {
        items: true,
    }
  })

  // We also need Order ID. 
  // OrderLink table maps orderId <-> uploadId
  const uploadIds = uploads.map(u => u.id)
  const orderLinks = await prisma.orderLink.findMany({
      where: {
          uploadId: { in: uploadIds }
      }
  })
  
  // Map uploadId -> orderId
  const uploadOrderMap = new Map<string, string>()
  for (const link of orderLinks) {
      if (link.orderId) uploadOrderMap.set(link.uploadId, link.orderId)
  }
  
  // Also check upload.orderId directly
  for (const up of uploads) {
      if (up.orderId) uploadOrderMap.set(up.id, up.orderId)
  }

  const results = []

  const appHost = 'https://app.customizerapp.dev'

  console.log(`Found ${uploads.length} uploads. Checking links...`)

  for (const upload of uploads) {
      const orderId = uploadOrderMap.get(upload.id) || 'N/A'
      
      for (const item of upload.items) {
          if (isR2Key(item.storageKey)) {
              // Reconstruct the URL exactly as api.upload.status.$id.tsx does
              const r2Key = item.storageKey.replace('r2:', '')
              
              const encodedPath = r2Key
                .split('/')
                .map((segment) => encodeURIComponent(segment))
                .join('/')

              // The token generation uses the FULL key "r2:..."
              // const token = generateLocalFileToken(`r2:${r2Key}`, tokenExpiresAt) 
              // which is just item.storageKey
              
              const tokenExpiresAt = Date.now() + 365 * 24 * 3600 * 1000
              const token = generateLocalFileToken(item.storageKey, tokenExpiresAt)
              
              const url = `${appHost}/api/files/r2:${encodedPath}?token=${token}`
              
              let status = 0
              try {
                const res = await fetch(url, { method: 'HEAD' })
                status = res.status
              } catch (e) {
                  status = 999
              }
              
              results.push({
                  orderId,
                  uploadId: upload.id,
                  itemId: item.id,
                  key: item.storageKey,
                  url,
                  status
              })
              
              process.stdout.write(status === 200 ? '.' : 'x')
          }
      }
  }
  
  console.log('\n\n--- AUDIT REPORT ---\n')
  
  // Group by Order ID
  // | Shopify Order | Link | Status |
  
  console.log('| Shopify Order | Link | Status |')
  console.log('|---|---|---|')
  
  for (const row of results) {
      const statusIcon = row.status === 200 ? '✅ 200' : `❌ ${row.status}`
      console.log(`| ${row.orderId} | [Link](${row.url}) | ${statusIcon} |`)
  }
}

audit()
  .catch(e => {
      console.error(e)
      process.exit(1)
  })
  .finally(async () => {
      await prisma.$disconnect()
  })
