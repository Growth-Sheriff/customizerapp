/**
 * Geo Location Server Utilities
 * Extracts geo information from Cloudflare/Caddy headers
 * Falls back to IP-based geo lookup if headers unavailable
 * 
 * @module geo.server
 * @version 1.1.0
 */

// Simple in-memory cache for IP lookups (5 min TTL)
const geoCache = new Map<string, { data: GeoInfo; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface GeoInfo {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  ip: string | null; // Only for rate limiting, NOT stored
}

/**
 * Extract geo information from request headers
 * Supports Cloudflare and standard forwarding headers
 */
export function extractGeoFromHeaders(request: Request): GeoInfo {
  const headers = request.headers;
  
  return {
    // Cloudflare headers
    country: headers.get("cf-ipcountry") || 
             headers.get("x-country-code") || 
             null,
    
    region: headers.get("cf-region") || 
            headers.get("x-region") || 
            null,
    
    city: headers.get("cf-ipcity") || 
          headers.get("x-city") || 
          null,
    
    timezone: headers.get("cf-timezone") || 
              headers.get("x-timezone") || 
              null,
    
    // IP for rate limiting only (not stored in visitor record)
    ip: headers.get("cf-connecting-ip") || 
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
        headers.get("x-real-ip") || 
        null,
  };
}

/**
 * Get geo info with IP-based fallback
 * Uses ip-api.com (free, 45 req/min limit)
 */
export async function getGeoWithFallback(request: Request): Promise<GeoInfo> {
  // First try headers (Cloudflare etc.)
  const headerGeo = extractGeoFromHeaders(request);
  
  // If we have country from headers, use it
  if (headerGeo.country) {
    return headerGeo;
  }
  
  // Get IP for lookup
  const ip = headerGeo.ip;
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    // Local IP, can't lookup
    return headerGeo;
  }
  
  // Check cache first
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  // Lookup via ip-api.com (free tier)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
    
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,timezone`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.status === "success") {
        const geoInfo: GeoInfo = {
          country: data.countryCode || null, // ISO 3166-1 alpha-2 (US, TR, DE)
          region: data.regionName || null,
          city: data.city || null,
          timezone: data.timezone || null,
          ip,
        };
        
        // Cache the result
        geoCache.set(ip, { data: geoInfo, timestamp: Date.now() });
        
        // Clean old cache entries periodically
        if (geoCache.size > 1000) {
          const now = Date.now();
          for (const [key, val] of geoCache.entries()) {
            if (now - val.timestamp > CACHE_TTL) {
              geoCache.delete(key);
            }
          }
        }
        
        return geoInfo;
      }
    }
  } catch (error) {
    // Timeout or network error - fail silently
    console.warn("[Geo] IP lookup failed:", error instanceof Error ? error.message : "Unknown error");
  }
  
  // Return header-based info (may have partial data)
  return headerGeo;
}

/**
 * Classify referrer type based on domain
 */
export function classifyReferrerType(referrerDomain: string | null): string {
  if (!referrerDomain) return "direct";
  
  const domain = referrerDomain.toLowerCase();
  
  // Search engines
  const searchEngines = [
    "google", "bing", "yahoo", "duckduckgo", "baidu", 
    "yandex", "ecosia", "ask", "aol"
  ];
  if (searchEngines.some(se => domain.includes(se))) {
    return "organic_search";
  }
  
  // Social media
  const socialMedia = [
    "facebook", "instagram", "twitter", "x.com", "linkedin", 
    "pinterest", "tiktok", "snapchat", "reddit", "youtube",
    "whatsapp", "telegram", "discord"
  ];
  if (socialMedia.some(sm => domain.includes(sm))) {
    return "social";
  }
  
  // Email providers
  const emailProviders = [
    "mail.google", "outlook", "yahoo.com/mail", "mail.yahoo",
    "protonmail", "zoho", "icloud", "aol.com/mail"
  ];
  if (emailProviders.some(ep => domain.includes(ep))) {
    return "email";
  }
  
  // If has utm_source=email
  return "referral";
}

/**
 * Parse referrer URL and extract domain
 */
export function parseReferrer(referrer: string | null): {
  referrer: string | null;
  referrerDomain: string | null;
} {
  if (!referrer) {
    return { referrer: null, referrerDomain: null };
  }
  
  try {
    const url = new URL(referrer);
    return {
      referrer,
      referrerDomain: url.hostname.replace(/^www\./, ""),
    };
  } catch {
    return { referrer, referrerDomain: null };
  }
}

/**
 * Extract UTM parameters from URL
 */
export function extractUtmParams(url: string | URL): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  ttclid: string | null;
} {
  try {
    const urlObj = typeof url === "string" ? new URL(url) : url;
    const params = urlObj.searchParams;
    
    return {
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
      utmTerm: params.get("utm_term"),
      utmContent: params.get("utm_content"),
      gclid: params.get("gclid"),
      fbclid: params.get("fbclid"),
      msclkid: params.get("msclkid"),
      ttclid: params.get("ttclid"),
    };
  } catch {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      gclid: null,
      fbclid: null,
      msclkid: null,
      ttclid: null,
    };
  }
}

/**
 * Determine referrer type considering UTM params and click IDs
 */
export function determineReferrerType(
  referrerDomain: string | null,
  utmMedium: string | null,
  gclid: string | null,
  fbclid: string | null,
  msclkid: string | null,
  ttclid: string | null
): string {
  // Click IDs indicate paid traffic
  if (gclid) return "paid_search";
  if (fbclid) return "paid_social";
  if (msclkid) return "paid_search";
  if (ttclid) return "paid_social";
  
  // UTM medium hints
  if (utmMedium) {
    const medium = utmMedium.toLowerCase();
    if (medium === "cpc" || medium === "ppc" || medium === "paid") {
      return "paid_search";
    }
    if (medium === "email" || medium === "newsletter") {
      return "email";
    }
    if (medium === "social" || medium === "sm") {
      return "social";
    }
    if (medium === "organic") {
      return "organic_search";
    }
    if (medium === "referral" || medium === "affiliate") {
      return "referral";
    }
  }
  
  // Fall back to domain-based classification
  return classifyReferrerType(referrerDomain);
}
