/**
 * Geo Location Server Utilities
 * Extracts geo information from Cloudflare/Caddy headers
 * 
 * @module geo.server
 * @version 1.0.0
 */

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
