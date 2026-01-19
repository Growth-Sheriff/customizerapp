/**
 * Delivery Calculator - Zone Based Static Calculation
 * Version: 2.1.0 - Added Holidays & Ship Date
 * 
 * Bu dosya statik zone bazlı teslimat hesaplaması yapar.
 * DÜZELTMELER v2.1:
 * - US Federal Holidays eklendi (2025-2027)
 * - Ship date hesaplaması düzeltildi (cutoff + processing + holidays)
 * - isBusinessDay fonksiyonu eklendi
 * - Statik hesaplama sadece fallback olarak kullanılıyor
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION - ALIGNED WITH SHOPIFY
  // ============================================
  const CONFIG = {
    // Processing time before shipping
    processingDays: 1,
    
    // Cutoff time (2 PM Eastern)
    cutoffHour: 14,
    timezone: 'America/New_York',
    
    // Warehouse location
    warehouseState: 'NJ',
    warehouseZip: '07001',
    
    // Default shipping method
    defaultMethod: 'ground',
    
    // Debug mode
    debug: false
  };

  // ============================================
  // SAFE LOCALSTORAGE
  // ============================================
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Sandbox error - ignore
    }
  }

  // ============================================
  // ZONE DEFINITIONS - ALIGNED WITH CARRIER DATA
  // ============================================
  /**
   * Zones based on distance from NJ warehouse
   * Transit times are aligned with typical carrier ground shipping
   */
  const ZONES = {
    // Zone 1: Northeast (1-2 business days)
    zone1: {
      states: ['NJ', 'NY', 'PA', 'CT', 'MA', 'RI', 'NH', 'VT', 'ME', 'DE', 'MD', 'DC'],
      transitDays: { ground: 2, express: 1, overnight: 1 },
      name: 'Northeast'
    },
    
    // Zone 2: Mid-Atlantic & Upper South (2-3 business days)
    zone2: {
      states: ['VA', 'WV', 'NC', 'OH', 'MI', 'IN'],
      transitDays: { ground: 3, express: 2, overnight: 1 },
      name: 'Mid-Atlantic'
    },
    
    // Zone 3: Southeast & Midwest (3-4 business days)
    zone3: {
      states: ['SC', 'GA', 'FL', 'TN', 'KY', 'AL', 'MS', 'IL', 'WI', 'MN', 'IA', 'MO'],
      transitDays: { ground: 4, express: 2, overnight: 1 },
      name: 'Southeast/Midwest'
    },
    
    // Zone 4: Central (4-5 business days)
    zone4: {
      states: ['AR', 'LA', 'TX', 'OK', 'KS', 'NE', 'SD', 'ND'],
      transitDays: { ground: 5, express: 3, overnight: 2 },
      name: 'Central'
    },
    
    // Zone 5: Mountain & West (5-6 business days)
    zone5: {
      states: ['MT', 'WY', 'CO', 'NM', 'ID', 'UT', 'AZ', 'NV'],
      transitDays: { ground: 6, express: 3, overnight: 2 },
      name: 'Mountain'
    },
    
    // Zone 6: Pacific & Remote (6-7 business days)
    zone6: {
      states: ['WA', 'OR', 'CA', 'AK', 'HI', 'PR', 'VI', 'GU'],
      transitDays: { ground: 7, express: 4, overnight: 2 },
      name: 'Pacific'
    }
  };

  // ============================================
  // ZIP TO STATE (Imported from other files)
  // ============================================
  function getStateFromZip(zip) {
    if (window.getStateFromZip) {
      return window.getStateFromZip(zip);
    }
    
    // Fallback with basic prefix mapping
    const prefix = String(zip || '').substring(0, 3);
    const COMMON = {
      '070': 'NJ', '071': 'NJ', '072': 'NJ', '073': 'NJ', '074': 'NJ',
      '100': 'NY', '101': 'NY', '102': 'NY', '111': 'NY', '112': 'NY',
      '150': 'PA', '151': 'PA', '190': 'PA', '191': 'PA',
      '900': 'CA', '901': 'CA', '902': 'CA', '950': 'CA', '951': 'CA',
      '750': 'TX', '751': 'TX', '770': 'TX', '772': 'TX',
      '330': 'FL', '331': 'FL', '332': 'FL', '333': 'FL'
    };
    return COMMON[prefix] || CONFIG.warehouseState;
  }

  // ============================================
  // ZONE LOOKUP
  // ============================================
  function getZoneForState(state) {
    if (!state) return ZONES.zone3; // Default to middle zone
    
    const stateUpper = state.toUpperCase();
    
    for (const [zoneName, zoneData] of Object.entries(ZONES)) {
      if (zoneData.states.includes(stateUpper)) {
        return { ...zoneData, id: zoneName };
      }
    }
    
    return { ...ZONES.zone3, id: 'zone3' }; // Default
  }

  function getZoneForZip(zip) {
    const state = getStateFromZip(zip);
    return getZoneForState(state);
  }

  // ============================================
  // DATE UTILITIES
  // ============================================
  
  // US Federal Holidays (2025-2027)
  const US_HOLIDAYS = [
    // 2025
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-07-04',
    '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
    // 2026
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03',
    '2026-07-04', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    // 2027
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-07-05',
    '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24', '2027-12-25'
  ];

  function getETHour() {
    try {
      const options = { timeZone: CONFIG.timezone, hour: 'numeric', hour12: false };
      return parseInt(new Date().toLocaleString('en-US', options));
    } catch (e) {
      return new Date().getHours();
    }
  }

  function isPastCutoff() {
    return getETHour() >= CONFIG.cutoffHour;
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function isHoliday(date) {
    const dateStr = date.toISOString().split('T')[0];
    return US_HOLIDAYS.includes(dateStr);
  }

  function isBusinessDay(date) {
    return !isWeekend(date) && !isHoliday(date);
  }

  /**
   * Get ship date considering cutoff, weekends, and holidays
   */
  function getShipDate() {
    let shipDate = new Date();
    
    // If past cutoff, start from tomorrow
    if (isPastCutoff()) {
      shipDate.setDate(shipDate.getDate() + 1);
    }
    
    // Skip weekends and holidays
    while (!isBusinessDay(shipDate)) {
      shipDate.setDate(shipDate.getDate() + 1);
    }
    
    // Add processing time (1 day)
    shipDate.setDate(shipDate.getDate() + CONFIG.processingDays);
    
    // If processing lands on non-business day, skip
    while (!isBusinessDay(shipDate)) {
      shipDate.setDate(shipDate.getDate() + 1);
    }
    
    return shipDate;
  }

  function addBusinessDays(startDate, days) {
    const result = new Date(startDate);
    let added = 0;
    
    while (added < days) {
      result.setDate(result.getDate() + 1);
      if (isBusinessDay(result)) {
        added++;
      }
    }
    
    return result;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function formatLongDate(date) {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  // ============================================
  // DELIVERY CALCULATOR CLASS
  // ============================================
  class DeliveryCalculator {
    constructor(options = {}) {
      this.processingDays = options.processingDays || CONFIG.processingDays;
      this.debug = options.debug || CONFIG.debug;
    }

    log(...args) {
      if (this.debug) {
        console.log('[DeliveryCalculator]', ...args);
      }
    }

    /**
     * Calculate delivery estimate - PREFERS SHOPIFY LIVE RATES
     * Falls back to static calculation only if live rates unavailable
     */
    async calculate(destination, options = {}) {
      const method = options.method || CONFIG.defaultMethod;
      
      // Resolve destination
      let state, zip;
      if (typeof destination === 'string') {
        if (destination.length === 2) {
          state = destination.toUpperCase();
          zip = null;
        } else {
          zip = destination;
          state = getStateFromZip(zip);
        }
      } else if (destination && typeof destination === 'object') {
        state = destination.state || destination.province;
        zip = destination.zip || destination.postal;
        if (!state && zip) {
          state = getStateFromZip(zip);
        }
      } else {
        state = CONFIG.warehouseState;
        zip = null;
      }

      this.log('Calculating for:', { state, zip, method });

      // TRY SHOPIFY LIVE RATES FIRST (if available and ZIP known)
      if (zip && window.LiveShippingRates && options.preferLive !== false) {
        try {
          const liveRates = new window.LiveShippingRates({ debug: this.debug });
          const result = await liveRates.getRates(zip);
          
          if (result.success && result.rates.length > 0) {
            this.log('Using Shopify live rates');
            
            // Find best matching rate
            const rate = this.findMatchingRate(result.rates, method);
            if (rate) {
              return this.buildResultFromLiveRate(rate, state, zip);
            }
          }
        } catch (e) {
          this.log('Live rates failed, falling back to static:', e);
        }
      }

      // FALLBACK TO STATIC CALCULATION
      return this.calculateStatic(state, zip, method);
    }

    /**
     * Find matching rate from live rates
     */
    findMatchingRate(rates, method) {
      const methodLower = method.toLowerCase();
      
      // Priority order based on method
      if (methodLower === 'overnight' || methodLower === 'next_day') {
        const overnight = rates.find(r => {
          const n = (r.name || '').toLowerCase();
          return n.includes('overnight') || n.includes('next day') || n.includes('1-day');
        });
        if (overnight) return overnight;
      }
      
      if (methodLower === 'express' || methodLower === '2day') {
        const express = rates.find(r => {
          const n = (r.name || '').toLowerCase();
          return n.includes('express') || n.includes('2 day') || n.includes('2-day');
        });
        if (express) return express;
      }
      
      // Default to cheapest (ground)
      return rates[0];
    }

    /**
     * Build result from live rate
     */
    buildResultFromLiveRate(rate, state, zip) {
      return {
        method: rate.name,
        carrier: rate.carrier,
        price: rate.price,
        priceFormatted: rate.priceFormatted,
        isFree: rate.isFree,
        delivery: rate.delivery || {
          minDate: this.addBusinessDays(new Date(), 3),
          maxDate: this.addBusinessDays(new Date(), 5),
          minDateFormatted: formatDate(this.addBusinessDays(new Date(), 3)),
          maxDateFormatted: formatDate(this.addBusinessDays(new Date(), 5)),
          rangeText: `${formatDate(this.addBusinessDays(new Date(), 3))} - ${formatDate(this.addBusinessDays(new Date(), 5))}`
        },
        destination: { state, zip },
        source: 'shopify_live',
        timestamp: Date.now()
      };
    }

    /**
     * Static zone-based calculation (fallback)
     */
    calculateStatic(state, zip, method) {
      const zone = getZoneForState(state);
      const transitDays = zone.transitDays[method] || zone.transitDays.ground;
      
      // Start date (considering cutoff)
      let startDate = new Date();
      if (isPastCutoff()) {
        startDate.setDate(startDate.getDate() + 1);
      }
      
      // Skip weekends for start
      while (isWeekend(startDate)) {
        startDate.setDate(startDate.getDate() + 1);
      }
      
      // Total days = processing + transit
      const totalDays = this.processingDays + transitDays;
      
      const minDate = addBusinessDays(startDate, totalDays);
      const maxDate = addBusinessDays(startDate, totalDays + 1);
      
      return {
        method: this.getMethodName(method),
        carrier: { name: 'Standard Carrier', icon: 'package' },
        price: null, // Static doesn't know price
        priceFormatted: null,
        isFree: null,
        delivery: {
          minDays: totalDays,
          maxDays: totalDays + 1,
          minDate,
          maxDate,
          minDateFormatted: formatDate(minDate),
          maxDateFormatted: formatDate(maxDate),
          fullDate: formatLongDate(minDate),
          rangeText: `${formatDate(minDate)} - ${formatDate(maxDate)}`,
          countdown: this.formatCountdown(totalDays)
        },
        zone: {
          id: zone.id,
          name: zone.name,
          transitDays
        },
        destination: { state, zip },
        processing: {
          days: this.processingDays,
          isPastCutoff: isPastCutoff(),
          cutoffHour: CONFIG.cutoffHour
        },
        source: 'static_calculation',
        timestamp: Date.now()
      };
    }

    /**
     * Get method display name
     */
    getMethodName(method) {
      const names = {
        ground: 'Ground Shipping',
        express: 'Express Shipping',
        overnight: 'Overnight Shipping',
        '2day': '2-Day Shipping'
      };
      return names[method] || 'Standard Shipping';
    }

    /**
     * Format countdown text
     */
    formatCountdown(days) {
      if (days === 1) return 'Tomorrow';
      if (days === 2) return 'In 2 days';
      if (days <= 5) return `In ${days} days`;
      return `In about a week`;
    }

    /**
     * Helper to add business days
     */
    addBusinessDays(startDate, days) {
      return addBusinessDays(startDate, days);
    }

    /**
     * Quick estimate without async
     */
    quickEstimate(state, method = 'ground') {
      return this.calculateStatic(state, null, method);
    }
  }

  // ============================================
  // PRICE ESTIMATION (when live rates unavailable)
  // ============================================
  const STATIC_PRICES = {
    zone1: { ground: 8.99, express: 14.99, overnight: 29.99 },
    zone2: { ground: 9.99, express: 16.99, overnight: 34.99 },
    zone3: { ground: 11.99, express: 19.99, overnight: 39.99 },
    zone4: { ground: 13.99, express: 24.99, overnight: 49.99 },
    zone5: { ground: 15.99, express: 29.99, overnight: 59.99 },
    zone6: { ground: 18.99, express: 34.99, overnight: 69.99 }
  };

  function estimatePrice(state, method = 'ground') {
    const zone = getZoneForState(state);
    const prices = STATIC_PRICES[zone.id] || STATIC_PRICES.zone3;
    return prices[method] || prices.ground;
  }

  // ============================================
  // EXPOSE TO WINDOW
  // ============================================
  window.DeliveryCalculator = DeliveryCalculator;
  window.deliveryCalculator = new DeliveryCalculator();
  
  // Utility functions
  window.getDeliveryZone = getZoneForState;
  window.getDeliveryZoneForZip = getZoneForZip;
  window.estimateDeliveryPrice = estimatePrice;
  window.DELIVERY_ZONES = ZONES;

  // Quick calculation function
  window.calculateDelivery = async function(destination, options = {}) {
    const calc = new DeliveryCalculator(options);
    return await calc.calculate(destination, options);
  };

  // Sync quick estimate
  window.quickDeliveryEstimate = function(state, method = 'ground') {
    const calc = new DeliveryCalculator();
    return calc.quickEstimate(state, method);
  };

  console.log('[DeliveryCalculator] v2.0.0 loaded - Shopify live rates priority');
})();
