
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Updated Public R2 URL
const R2_PUBLIC_BASE = 'https://app.customizerapp.dev'

async function main() {
  console.log('🔍 Scanning specifically for broken R2 fallback orders...')
  
  // 1. Get uploads that have R2 items
  // We check the last 100 uploads to cover the outage period
  const uploads = await prisma.upload.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    where: {
      orderId: { not: null }, // Only real orders
      items: {
        some: {
          storageKey: { startsWith: 'r2:' } // The identifier for our fallback mechanism
        }
      }
    },
    include: {
      items: true,
      shop: true // Need shop info to talk to Shopify
    }
  })

  console.log(`Found ${uploads.length} uploads with R2 fallback items.`)

  for (const upload of uploads) {
    if (!upload.createdAt) continue;
    
    // Only care about very recent ones (e.g. last 24 hours) or just process all found
    // Since we filtered by 'r2:' prefix which is new, it should be fine.
    
    console.log(`\n📦 Processing Order #${upload.orderId} (Upload: ${upload.id})`)
    const shopDomain = upload.shop.shopDomain;
    const accessToken = upload.shop.accessToken;

    const fileLinks = [];

    // Process Items
    for (const item of upload.items) {
      if (item.storageKey && item.storageKey.startsWith('r2:')) {
        // Transform: r2:bucket/key -> https://app.customizerapp.dev/key
        // 1. Remove "r2:"
        let cleanKey = item.storageKey.replace('r2:', '');
        
        // 2. Remove bucket name if present in path (older fallback implementation might include it, or not)
        // Previous output showed: "r2:fast-dtf-transfer_myshopify_com/prod/..."
        // The Custom Domain is mapped to the bucket root.
        // So we need "https://app.customizerapp.dev/fast-dtf-transfer_myshopify_com/prod/..."
        
        // Encode only the path segments
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
  console.log(`   🔄 Updating Shopify Order ${orderId}...`);
  
  // Construct a nice note
  const dateStr = new Date().toLocaleString('tr-TR');
  const noteLines = [
    `\n--- [SYSTEM RECOVERY] Backup File Links (${dateStr}) ---`,
    ...links.map(l => `${l.location.toUpperCase()}: ${l.url}`),
    "--------------------------------------------------"
  ];
  const newNoteSnippet = noteLines.join('\n');

  try {
    // 1. Fetch current order to get existing note
    const getRes = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json`, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    
    if (!getRes.ok) {
        throw new Error(`Failed to fetch order: ${getRes.statusText}`);
    }
    
    const orderData = await getRes.json();
    const currentNote = orderData.order.note || "";
    
    // Avoid double posting
    if (currentNote.includes('[SYSTEM RECOVERY]')) {
         console.log('   ⚠️  Already updated. Skipping.');
         return;
    }

    const updatedNote = currentNote + newNoteSnippet;

    // 2. Update Order
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
