
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const uploadId = 'Mv2mNbdj3iM1'
  console.log(`Searching for upload ${uploadId}...`)

  const upload = await prisma.upload.findFirst({
    where: { id: uploadId },
    include: { shop: true }
  })

  if (upload) {
    console.log(`\n✅ FOUND:`)
    console.log(`Order ID: ${upload.orderId}`)
    console.log(`Shop: ${upload.shop.shopDomain}`)
    console.log(`Created At: ${upload.createdAt}`)
  } else {
    console.log('❌ Upload not found.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
