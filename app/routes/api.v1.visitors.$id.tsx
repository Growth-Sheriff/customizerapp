/**
 * Visitor Detail API Endpoint
 * Get single visitor with sessions and uploads
 *
 * @route GET /api/v1/visitors/:id
 *
 * ⚠️ This is a NEW endpoint - does not modify existing flows
 */

import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { prisma } from '~/lib/prisma.server'
import { getVisitorWithSessions } from '~/lib/visitor.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
  const visitorId = params.id

  if (!visitorId) {
    return json({ error: 'Missing visitor ID' }, { status: 400 })
  }

  const url = new URL(request.url)
  const shopDomain = url.searchParams.get('shop')

  if (!shopDomain) {
    return json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  // Find shop
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  })

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 })
  }

  try {
    const visitor = await getVisitorWithSessions(shop.id, visitorId)

    if (!visitor) {
      return json({ error: 'Visitor not found' }, { status: 404 })
    }

    return json({
      success: true,
      visitor,
    })
  } catch (error) {
    console.error('[Visitor Detail Error]', error)
    return json({ error: 'Failed to get visitor' }, { status: 500 })
  }
}
