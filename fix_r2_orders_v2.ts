
import { PrismaClient } from '@prisma/client'
import { REST } from '@discordjs/rest'; // Just kidding, using fetch
// We need to fetch shopify, but we can use native fetch

const prisma = new PrismaClient()

// Updated Public R2 URL
const R2_PUBLIC_BASE = 'https://app.customizerapp.dev'

async function main() {
  console.log('🔍 Scanning specifically for broken R2 fallback orders (Last 50 uploads)...')
  
  // Fetch last 50 uploads
  const uploads = await prisma.upload.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    where: {
      orderId: { not: null },
      items: {
        some: {
          storageKey: { startsWith: 'r2:' }
        }
      }
    },
    include: {
      items: true,
      shop: true
    }
  })

  console.log(`Found ${uploads.length} uploads with R2 fallback items.`)

  for (const upload of uploads) {
    if (!upload.createdAt) continue;
    
    // We want to ensure we catch recent ones where the URL might be wrong
    console.log(`\n📦 Processing Order #${upload.orderId} (Upload: ${upload.id}) [${upload.createdAt.toISOString()}]`)
    const shopDomain = upload.shop.shopDomain;
    const accessToken = upload.shop.accessToken;

    const fileLinks: { location: string, url: string }[] = [];

    // Process Items
    for (const item of upload.items) {
      if (item.storageKey && item.storageKey.startsWith('r2:')) {
        let cleanKey = item.storageKey.replace('r2:', '');
        
        // Ensure accurate mapping to custom domain
        // The bucket content structure: [shop_domain]/[env]/[uploadId]/[itemId]/[filename]
        // Our storageKey usually includes the full path relative to bucket root.
        
        const encodedKey = cleanKey.split('/').map(s => encodeURIComponent(s)).join('/');
        const finalUrl = `${R2_PUBLIC_BASE}/${encodedKey}`;
        
        console.log(`   👉 Generated: ${finalUrl}`);
        fileLinks.push({
            location: item.location,
            url: finalUrl
        });
      }
    }

    if (fileLinks.length > 0) {
      // UPDATE SHOPIFY ORDER
      await updateShopifyOrder(shopDomain, accessToken, upload.orderId!, fileLinks);
    }
  }
}

async function updateShopifyOrder(shop: string, token: string, orderId: string, links: {location: string, url: string}[]) {
  console.log(`   🔄 Checking Shopify Order ${orderId}...`);
  
  const dateStr = new Date().toLocaleString('tr-TR');
  // Unique marker for this specific update batch/logic to avoid spamming
  // But user said "update notes (except those already sent)"
  // We'll check for the specific URLs we are about to add, or a generic marker.
  
  const noteLines = [
    `\n--- [Recovered Links] (${dateStr}) ---`,
    ...links.map(l => `${l.location.toUpperCase()}: ${l.url}`),
    "--------------------------------------------------"
  ];
  
  try {
    const getRes = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    
    if (!getRes.ok) {
        throw new Error(`Failed to fetch order: ${getRes.statusText}`);
    }
    
    const orderData = await getRes.json();
    const currentNote = orderData.order.note || "";
    
    // Check if ANY of the links are already present in the note
    const alreadyExists = links.some(l => currentNote.includes(l.url));

    if (alreadyExists) {
         console.log('   ⚠️  Links already in note. Skipping update.');
         return;
    }

    const updatedNote = currentNote + noteLines.join('\n');

    // Update
    const updateRes = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order: {
          id: orderId,
          note: updatedNote
        }
      })
    });

    if (!updateRes.ok) {
         console.error(`   ❌ Failed to update Shopify: ${await updateRes.text()}`);
    } else {
         console.log('   ✅ Shopify Order Updated successfully!');
    }

  } catch (err) {
    console.error('   ❌ Error updating shopify:', err);
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
