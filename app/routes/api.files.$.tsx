import type { LoaderFunctionArgs } from '@remix-run/node'
import mime from 'mime-types'
import {
  getStorageConfig,
  getR2SignedGetUrl,
  isBunnyUrl,
  readLocalFile,
  validateLocalFileToken,
} from '~/lib/storage.server'

/**
 * GET /api/files/:key?token=xxx
 *
 * WI-004: Serves files from local storage with signed URL token validation
 * Token is HMAC-SHA256 signed and time-limited
 *
 * For Bunny URLs: Redirects to CDN
 * For Local files: Serves from filesystem
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
      },
    })
  }

  const key = params['*']

  if (!key) {
    return new Response('File not found', { status: 404 })
  }

  // WI-004: Validate signed URL token
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const decodedKey = decodeURIComponent(key)

  if (!token || !validateLocalFileToken(decodedKey, token)) {
    return new Response('Unauthorized - invalid or expired token', {
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  try {
    // If the key is a Bunny URL or bunny: prefixed, redirect to CDN
    if (isBunnyUrl(decodedKey) || decodedKey.startsWith('bunny:')) {
      const cdnUrl = process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net'
      let redirectUrl: string

      if (decodedKey.startsWith('http')) {
        redirectUrl = decodedKey
      } else {
        const cleanKey = decodedKey.replace('bunny:', '')
        redirectUrl = `${cdnUrl}/${cleanKey}`
      }

      return Response.redirect(redirectUrl, 302)
    }

    // If the key is R2, redirect to signed URL
    if (decodedKey.startsWith('r2:')) {
      const r2Key = decodedKey.replace('r2:', '')
      const config = getStorageConfig()
      const signedUrl = await getR2SignedGetUrl(config, r2Key)

      if (signedUrl) {
        return Response.redirect(signedUrl, 302)
      }
      console.error('[FileServe] Failed to sign R2 URL for key:', r2Key)
      return new Response('File not found / R2 Error', { status: 404 })
    }

    // Otherwise serve from local storage
    const buffer = await readLocalFile(decodedKey)

    // Determine content type from file extension
    const ext = decodedKey.split('.').pop() || ''
    const contentType = mime.lookup(ext) || 'application/octet-stream'

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        'Content-Length': String(buffer.length),
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[FileServe] Error:', error)
    return new Response('File not found', { status: 404 })
  }
}
