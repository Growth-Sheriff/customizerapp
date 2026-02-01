/**
 * Live Shipping Rates Fetcher
 * Version: 2.0.0 - Fixed Price Normalization & localStorage Safety
 *
 * Bu dosya Shopify'dan gerçek zamanlı kargo tarifelerini çeker.
 * DÜZELTMELER:
 * - Fiyat normalizasyonu düzeltildi (99 cent sorunu çözüldü)
 * - localStorage sandbox hatası düzeltildi
 * - Province ZIP'ten otomatik tespit
 */

;(function () {
  'use strict'

  // ============================================
  // SAFE LOCALSTORAGE
  // ============================================
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      // Sandbox/iframe hatası - sessizce geç
    }
  }

  // ============================================
  // PRICE NORMALIZATION - FIXED
  // ============================================
  /**
   * Shopify API'den gelen fiyatları normalize eder
   *
   * Shopify tutarsız formatlar döner:
   * - "12.99" (string, dolar)
   * - 12.99 (number, dolar)
   * - 1299 (number, cent)
   * - "1299" (string, cent)
   *
   * Bu fonksiyon hepsini doğru şekilde işler.
   */
  function normalizePrice(price) {
    if (price === null || price === undefined || price === '') return 0

    const strPrice = String(price)
    const numPrice = parseFloat(price)

    if (isNaN(numPrice)) return 0

    // Eğer string'de nokta varsa, zaten dolar formatında
    if (strPrice.includes('.')) {
      return numPrice
    }

    // Nokta yoksa:
    // - 100'den küçükse muhtemelen dolar ($99 gibi nadir bir durum)
    // - 100 veya daha büyükse cent (Shopify'ın varsayılan cent formatı)
    //
    // Önemli: $99 dolar çok nadirdir, genellikle free shipping veya $9.99 gibi
    // fiyatlar kullanılır. Ancak güvenli olmak için 1000 eşiğini kullanalım:
    // - < 1000: Muhtemelen dolar (0-999 arası nadir olsa da mümkün)
    // - >= 1000: Kesinlikle cent (1000 cent = $10.00)

    // Daha güvenli yaklaşım: 4 haneli ve üstü sayıları cent kabul et
    if (numPrice >= 1000) {
      return numPrice / 100
    }

    // 3 haneli sayılar (100-999): Belirsiz, ama genellikle cent
    // $5.00 = 500 cent, $9.99 = 999 cent
    // $1.00 - $9.99 arası çok yaygın
    if (numPrice >= 100) {
      return numPrice / 100
    }

    // 2 haneli ve altı (0-99):
    // Bu ya çok düşük cent ($0.99 = 99 cent)
    // ya da nadir bir dolar değeri ($5, $10 gibi)
    // Shopify genelde cent kullandığı için cent kabul edelim
    // ANCAK free shipping (0) özel durum
    if (numPrice === 0) {
      return 0
    }

    // 1-99 arası: Muhtemelen cent
    return numPrice / 100
  }

  function formatPrice(price) {
    const normalized = normalizePrice(price)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(normalized)
  }

  // ============================================
  // ZIP TO STATE (Re-exported from shopify-live-shipping.js)
  // ============================================
  function getStateFromZip(zip) {
    if (window.getStateFromZip) {
      return window.getStateFromZip(zip)
    }

    // Fallback - Basic ZIP prefix mapping
    const ZIP_PREFIXES = {
      0: 'NJ',
      1: 'NY',
      2: 'VA',
      3: 'FL',
      4: 'KY',
      5: 'IA',
      6: 'IL',
      7: 'TX',
      8: 'CO',
      9: 'CA',
    }
    const prefix = String(zip || '').charAt(0)
    return ZIP_PREFIXES[prefix] || 'NJ'
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================
  const CACHE_KEY = 'liveShippingRates'
  const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika

  function getCachedRates(zip) {
    const cached = safeGetItem(CACHE_KEY)
    if (!cached) return null

    try {
      const data = JSON.parse(cached)
      if (data.zip === zip && Date.now() - data.timestamp < CACHE_DURATION) {
        return data.rates
      }
    } catch (e) {
      // Invalid cache
    }
    return null
  }

  function setCachedRates(zip, rates) {
    safeSetItem(
      CACHE_KEY,
      JSON.stringify({
        zip,
        rates,
        timestamp: Date.now(),
      })
    )
  }

  // ============================================
  // LIVE SHIPPING RATES CLASS
  // ============================================
  class LiveShippingRates {
    constructor(options = {}) {
      this.debug = options.debug || false
      this.timeout = options.timeout || 6000
      this.useCache = options.useCache !== false
    }

    log(...args) {
      if (this.debug) {
        console.log('[LiveShippingRates]', ...args)
      }
    }

    /**
     * Get shipping rates for a ZIP code
     * @param {string} zip - ZIP code
     * @param {Object} options - Additional options
     */
    async getRates(zip, options = {}) {
      if (!zip) {
        return { success: false, error: 'ZIP code required', rates: [] }
      }

      this.log('Getting rates for ZIP:', zip)

      // Check cache
      if (this.useCache && !options.skipCache) {
        const cached = getCachedRates(zip)
        if (cached) {
          this.log('Returning cached rates')
          return { success: true, rates: cached, cached: true }
        }
      }

      // Get state from ZIP
      const state = options.state || getStateFromZip(zip)
      this.log('Resolved state:', state)

      // Build address
      const address = {
        zip: zip,
        province: state,
        country: 'United States',
      }

      try {
        // Use ShopifyLiveShipping if available
        if (window.ShopifyLiveShipping) {
          const client = new window.ShopifyLiveShipping({ debug: this.debug })
          const result = await client.getShippingRates(address)

          if (result.success && result.rates.length > 0) {
            // Cache the rates
            if (this.useCache) {
              setCachedRates(zip, result.rates)
            }
            return result
          }
        }

        // Fallback: Direct API call
        return await this.fetchDirectRates(address)
      } catch (error) {
        this.log('Error getting rates:', error)
        return { success: false, error: error.message, rates: [] }
      }
    }

    /**
     * Direct fetch without ShopifyLiveShipping class
     */
    async fetchDirectRates(address) {
      const { zip, province, country } = address

      // Prepare first
      const prepareUrl = `/cart/prepare_shipping_rates.json?shipping_address[zip]=${encodeURIComponent(zip)}&shipping_address[country]=${encodeURIComponent(country)}&shipping_address[province]=${encodeURIComponent(province)}`

      try {
        await fetch(prepareUrl, { method: 'POST' })
      } catch (e) {
        this.log('Prepare failed:', e)
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Fetch rates
      const fetchUrl = `/cart/shipping_rates.json?shipping_address[zip]=${encodeURIComponent(zip)}&shipping_address[country]=${encodeURIComponent(country)}&shipping_address[province]=${encodeURIComponent(province)}`

      const response = await fetch(fetchUrl)
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, rates: [] }
      }

      const data = await response.json()
      if (!data.shipping_rates || data.shipping_rates.length === 0) {
        return { success: false, error: 'No rates', rates: [] }
      }

      const rates = data.shipping_rates.map((rate) => this.processRate(rate))
      rates.sort((a, b) => a.price - b.price)

      // Mark cheapest
      if (rates.length > 0) {
        rates[0].isCheapest = true
      }

      // Cache
      if (this.useCache) {
        setCachedRates(address.zip, rates)
      }

      return { success: true, rates }
    }

    /**
     * Process a raw rate from Shopify
     */
    processRate(rate) {
      const normalized = normalizePrice(rate.price)

      return {
        name: rate.name,
        code: rate.code,
        price: normalized,
        priceFormatted: formatPrice(rate.price),
        isFree: normalized === 0,
        original: rate,
      }
    }

    /**
     * Get cheapest rate
     */
    async getCheapestRate(zip) {
      const result = await this.getRates(zip)
      if (result.success && result.rates.length > 0) {
        return result.rates[0]
      }
      return null
    }

    /**
     * Get express rates (2 days or less)
     */
    async getExpressRates(zip) {
      const result = await this.getRates(zip)
      if (result.success) {
        return result.rates.filter((r) => {
          const name = (r.name || '').toLowerCase()
          return (
            name.includes('express') ||
            name.includes('next day') ||
            name.includes('overnight') ||
            name.includes('2 day') ||
            name.includes('2-day')
          )
        })
      }
      return []
    }
  }

  // ============================================
  // EXPOSE TO WINDOW
  // ============================================
  window.LiveShippingRates = LiveShippingRates
  window.normalizeShippingPrice = normalizePrice
  window.formatShippingPrice = formatPrice

  // Create default instance
  window.liveShipping = new LiveShippingRates({ debug: false })

  console.log('[LiveShippingRates] v2.0.0 loaded - Price normalization fixed')
})()
