
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const links = await prisma.orderLink.findMany({
    take: 10,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      upload: true
    }
  })

  console.log(JSON.stringify(links, null, 2))
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
