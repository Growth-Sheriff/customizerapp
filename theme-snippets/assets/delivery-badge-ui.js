/**
 * Delivery Badge UI Component
 * Version: 2.1.0 - Added Holidays & International Support
 * 
 * Bu dosya teslimat tarihini gösteren badge UI'ını yönetir.
 * DÜZELTMELER v2.1:
 * - US Federal Holidays eklendi (2025-2027)
 * - Ship date hesaplaması düzeltildi (cutoff + processing + holidays)
 * - ABD dışı lokasyonlar için uyarı eklendi
 * - International badge render eklendi
 */

(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const CONFIG = {
    cutoffHour: 14, // 2 PM ET
    timezone: 'America/New_York',
    warehouseState: 'NJ',
    geoIPCacheDuration: 30 * 60 * 1000, // 30 dakika
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
      // Sandbox/iframe hatası - sessizce geç
    }
  }

  function safeRemoveItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Sessizce geç
    }
  }

  // ============================================
  // GEOIP CACHE
  // ============================================
  const GEOIP_CACHE_KEY = 'deliveryGeoIP';
  
  function getCachedGeoIP() {
    const cached = safeGetItem(GEOIP_CACHE_KEY);
    if (!cached) return null;
    
    try {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < CONFIG.geoIPCacheDuration) {
        return data.location;
      }
    } catch (e) {
      // Invalid cache
    }
    return null;
  }

  function setCachedGeoIP(location) {
    safeSetItem(GEOIP_CACHE_KEY, JSON.stringify({
      location,
      timestamp: Date.now()
    }));
  }

  // ============================================
  // ZIP TO STATE MAPPING
  // ============================================
  function getStateFromZip(zip) {
    // Use window function if available (from shopify-live-shipping.js)
    if (window.getStateFromZip) {
      return window.getStateFromZip(zip);
    }
    
    // Fallback: Basic ZIP prefix to state
    const prefix = String(zip || '').substring(0, 3);
    
    // Common prefixes
    const COMMON_PREFIXES = {
      // New Jersey
      '070': 'NJ', '071': 'NJ', '072': 'NJ', '073': 'NJ', '074': 'NJ',
      '075': 'NJ', '076': 'NJ', '077': 'NJ', '078': 'NJ', '079': 'NJ',
      '080': 'NJ', '081': 'NJ', '082': 'NJ', '083': 'NJ', '084': 'NJ',
      '085': 'NJ', '086': 'NJ', '087': 'NJ', '088': 'NJ', '089': 'NJ',
      
      // New York
      '100': 'NY', '101': 'NY', '102': 'NY', '103': 'NY', '104': 'NY',
      '110': 'NY', '111': 'NY', '112': 'NY', '113': 'NY', '114': 'NY',
      '115': 'NY', '116': 'NY', '117': 'NY', '118': 'NY', '119': 'NY',
      
      // Pennsylvania
      '150': 'PA', '151': 'PA', '152': 'PA', '153': 'PA', '154': 'PA',
      '190': 'PA', '191': 'PA', '192': 'PA', '193': 'PA', '194': 'PA',
      
      // California
      '900': 'CA', '901': 'CA', '902': 'CA', '903': 'CA', '904': 'CA',
      '905': 'CA', '906': 'CA', '907': 'CA', '908': 'CA', '910': 'CA',
      '920': 'CA', '921': 'CA', '922': 'CA', '923': 'CA', '924': 'CA',
      '950': 'CA', '951': 'CA', '952': 'CA', '953': 'CA', '954': 'CA',
      
      // Texas
      '750': 'TX', '751': 'TX', '752': 'TX', '753': 'TX', '754': 'TX',
      '760': 'TX', '761': 'TX', '762': 'TX', '763': 'TX', '764': 'TX',
      '770': 'TX', '772': 'TX', '773': 'TX', '774': 'TX', '775': 'TX',
      '780': 'TX', '781': 'TX', '782': 'TX', '783': 'TX', '784': 'TX',
      
      // Florida
      '320': 'FL', '321': 'FL', '322': 'FL', '323': 'FL', '324': 'FL',
      '325': 'FL', '326': 'FL', '327': 'FL', '328': 'FL', '329': 'FL',
      '330': 'FL', '331': 'FL', '332': 'FL', '333': 'FL', '334': 'FL'
    };
    
    return COMMON_PREFIXES[prefix] || CONFIG.warehouseState;
  }

  // ============================================
  // DELIVERY ZONE CALCULATION
  // ============================================
  const ZONE_CONFIG = {
    // Warehouse: New Jersey
    zone1: ['NJ', 'NY', 'PA', 'CT', 'MA', 'RI', 'NH', 'VT', 'ME', 'DE', 'MD', 'DC'], // 2-3 days
    zone2: ['VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'OH', 'IN', 'MI', 'IL', 'WI', 'KY', 'TN', 'AL', 'MS'], // 3-4 days
    zone3: ['MN', 'IA', 'MO', 'AR', 'LA', 'ND', 'SD', 'NE', 'KS', 'OK', 'TX'], // 4-5 days
    zone4: ['MT', 'WY', 'CO', 'NM', 'ID', 'UT', 'AZ', 'NV', 'WA', 'OR', 'CA', 'AK', 'HI'] // 5-7 days
  };

  function getZone(state) {
    if (ZONE_CONFIG.zone1.includes(state)) return 1;
    if (ZONE_CONFIG.zone2.includes(state)) return 2;
    if (ZONE_CONFIG.zone3.includes(state)) return 3;
    if (ZONE_CONFIG.zone4.includes(state)) return 4;
    return 3; // Default to middle zone
  }

  function getBaseDaysForZone(zone) {
    switch (zone) {
      case 1: return 2;
      case 2: return 3;
      case 3: return 4;
      case 4: return 5;
      default: return 4;
    }
  }

  // ============================================
  // DATE CALCULATIONS
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
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  function formatFullDate(date) {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  // ============================================
  // CUSTOMER LOCATION
  // ============================================
  let customerLocation = null;

  async function detectLocation() {
    // 1. Check cache first
    const cached = getCachedGeoIP();
    if (cached) {
      customerLocation = cached;
      return cached;
    }

    // 2. Try Shopify customer data
    if (window.Shopify && window.Shopify.customer) {
      const customer = window.Shopify.customer;
      if (customer.default_address) {
        const addr = customer.default_address;
        if (addr.zip) {
          const location = {
            zip: addr.zip,
            state: addr.province_code || getStateFromZip(addr.zip),
            country: 'US',
            source: 'shopify_customer'
          };
          customerLocation = location;
          setCachedGeoIP(location);
          return location;
        }
      }
    }

    // 3. Check stored ZIP
    const storedZip = safeGetItem('customerZip');
    if (storedZip) {
      const location = {
        zip: storedZip,
        state: getStateFromZip(storedZip),
        country: 'US',
        source: 'stored'
      };
      customerLocation = location;
      setCachedGeoIP(location);
      return location;
    }

    // 4. GeoIP fallback (with caching to prevent multiple calls)
    try {
      const response = await fetch('https://ipapi.co/json/', { timeout: 3000 });
      if (response.ok) {
        const data = await response.json();
        
        // ABD dışı ülke kontrolü
        if (data.country_code && data.country_code !== 'US') {
          const location = {
            zip: null,
            state: null,
            city: data.city,
            country: data.country_code,
            countryName: data.country_name,
            isInternational: true,
            source: 'geoip'
          };
          customerLocation = location;
          setCachedGeoIP(location);
          return location;
        }
        
        if (data.country_code === 'US' && data.postal) {
          const location = {
            zip: data.postal,
            state: data.region_code || getStateFromZip(data.postal),
            city: data.city,
            country: 'US',
            isInternational: false,
            source: 'geoip'
          };
          customerLocation = location;
          setCachedGeoIP(location);
          return location;
        }
      }
    } catch (e) {
      // GeoIP failed
    }

    // 5. Default to warehouse state
    const defaultLocation = {
      zip: null,
      state: CONFIG.warehouseState,
      country: 'US',
      source: 'default'
    };
    customerLocation = defaultLocation;
    return defaultLocation;
  }

  function setCustomerZip(zip) {
    if (!zip) return;
    
    const location = {
      zip: zip,
      state: getStateFromZip(zip),
      country: 'US',
      source: 'user_input'
    };
    
    customerLocation = location;
    safeSetItem('customerZip', zip);
    setCachedGeoIP(location);
    
    // Trigger re-render
    document.dispatchEvent(new CustomEvent('deliveryLocationChanged', { detail: location }));
  }

  // ============================================
  // DELIVERY ESTIMATE
  // ============================================
  function calculateDeliveryEstimate(options = {}) {
    // KRITIK FIX: customerLocation null ise default state kullan
    const state = options.state || (customerLocation ? customerLocation.state : null) || CONFIG.warehouseState;
    const zone = getZone(state);
    const baseDays = getBaseDaysForZone(zone);
    
    // Processing time (1 day) + Transit time
    const processingDays = 1;
    const totalDays = processingDays + baseDays;
    
    // Start from ship date (handles cutoff, weekends, holidays)
    const shipDate = getShipDate();
    const minDate = addBusinessDays(shipDate, baseDays);
    const maxDate = addBusinessDays(shipDate, baseDays + 1);
    
    return {
      zone,
      baseDays,
      totalDays,
      minDate,
      maxDate,
      minDateFormatted: formatDate(minDate),
      maxDateFormatted: formatDate(maxDate),
      fullDateFormatted: formatFullDate(minDate),
      rangeText: `${formatDate(minDate)} - ${formatDate(maxDate)}`,
      isPastCutoff: isPastCutoff(),
      cutoffHour: CONFIG.cutoffHour,
      state,
      // KRITIK FIX: customerLocation null kontrolü
      source: customerLocation ? customerLocation.source : 'default'
    };
  }

  // ============================================
  // BADGE RENDERING
  // ============================================
  function renderDeliveryBadge(container, options = {}) {
    if (!container) return;
    
    // Check if international location
    if (customerLocation && customerLocation.isInternational) {
      const html = `
        <div class="delivery-badge delivery-badge--international">
          <div class="delivery-badge__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div class="delivery-badge__content">
            <div class="delivery-badge__label">International Shipping</div>
            <div class="delivery-badge__date">${customerLocation.city || customerLocation.countryName || 'International'}</div>
            <div class="delivery-badge__note">Contact us for shipping rates to ${customerLocation.countryName || 'your country'}</div>
          </div>
        </div>
      `;
      container.innerHTML = html;
      return { isInternational: true, location: customerLocation };
    }
    
    const estimate = calculateDeliveryEstimate(options);
    
    const html = `
      <div class="delivery-badge" data-zone="${estimate.zone}">
        <div class="delivery-badge__icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="3" width="15" height="13" rx="2"/>
            <path d="M16 8h4l3 3v5h-7V8z"/>
            <circle cx="5.5" cy="18.5" r="2.5"/>
            <circle cx="18.5" cy="18.5" r="2.5"/>
          </svg>
        </div>
        <div class="delivery-badge__content">
          <div class="delivery-badge__label">Estimated Delivery</div>
          <div class="delivery-badge__date">${estimate.rangeText}</div>
          ${estimate.isPastCutoff ? 
            '<div class="delivery-badge__note">Order by 2 PM ET for faster delivery</div>' : 
            '<div class="delivery-badge__note">Order now to get it by ' + estimate.minDateFormatted + '</div>'
          }
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    return estimate;
  }

  function renderCompactBadge(container, options = {}) {
    if (!container) return;
    
    const estimate = calculateDeliveryEstimate(options);
    
    container.innerHTML = `
      <span class="delivery-compact">
        📦 Get it by <strong>${estimate.minDateFormatted}</strong>
      </span>
    `;
    
    return estimate;
  }

  function renderInlineBadge(container, options = {}) {
    if (!container) return;
    
    const estimate = calculateDeliveryEstimate(options);
    
    container.innerHTML = `
      <span class="delivery-inline">
        Arrives ${estimate.rangeText}
      </span>
    `;
    
    return estimate;
  }

  // ============================================
  // ZIP INPUT COMPONENT
  // ============================================
  function renderZipInput(container, options = {}) {
    if (!container) return;
    
    // KRITIK FIX: customerLocation null kontrolü
    const currentZip = (customerLocation ? customerLocation.zip : null) || '';
    
    const html = `
      <div class="delivery-zip-input">
        <label for="delivery-zip">Enter ZIP for delivery estimate:</label>
        <div class="delivery-zip-input__row">
          <input type="text" 
                 id="delivery-zip" 
                 name="delivery-zip"
                 placeholder="Enter ZIP code" 
                 value="${currentZip}"
                 maxlength="5"
                 pattern="[0-9]*"
                 inputmode="numeric"
                 autocomplete="postal-code">
          <button type="button" class="delivery-zip-input__btn">Check</button>
        </div>
        <div class="delivery-zip-input__result"></div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Event handlers
    const input = container.querySelector('#delivery-zip');
    const btn = container.querySelector('.delivery-zip-input__btn');
    const result = container.querySelector('.delivery-zip-input__result');
    
    function updateResult() {
      const zip = input.value.trim();
      if (zip.length === 5 && /^\d+$/.test(zip)) {
        setCustomerZip(zip);
        const estimate = calculateDeliveryEstimate();
        result.innerHTML = `
          <div class="delivery-zip-result">
            📦 Delivers to <strong>${estimate.state}</strong>: ${estimate.rangeText}
          </div>
        `;
      } else if (zip.length > 0) {
        result.innerHTML = '<div class="delivery-zip-error">Please enter a valid 5-digit ZIP code</div>';
      } else {
        result.innerHTML = '';
      }
    }
    
    btn.addEventListener('click', updateResult);
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') updateResult();
    });
    input.addEventListener('input', () => {
      // Auto-check when 5 digits entered
      if (input.value.length === 5) {
        updateResult();
      }
    });
  }

  // ============================================
  // AUTO-INITIALIZATION
  // ============================================
  async function initDeliveryBadges() {
    // Detect location
    await detectLocation();
    
    // Find and render badges
    document.querySelectorAll('[data-delivery-badge]').forEach(el => {
      const type = el.dataset.deliveryBadge || 'full';
      switch (type) {
        case 'compact':
          renderCompactBadge(el);
          break;
        case 'inline':
          renderInlineBadge(el);
          break;
        case 'zip-input':
          renderZipInput(el);
          break;
        default:
          renderDeliveryBadge(el);
      }
    });
    
    // Listen for location changes
    document.addEventListener('deliveryLocationChanged', () => {
      document.querySelectorAll('[data-delivery-badge]').forEach(el => {
        const type = el.dataset.deliveryBadge || 'full';
        if (type !== 'zip-input') {
          switch (type) {
            case 'compact':
              renderCompactBadge(el);
              break;
            case 'inline':
              renderInlineBadge(el);
              break;
            default:
              renderDeliveryBadge(el);
          }
        }
      });
    });
  }

  // ============================================
  // EXPOSE TO WINDOW
  // ============================================
  window.DeliveryBadge = {
    init: initDeliveryBadges,
    detectLocation,
    setCustomerZip,
    calculateEstimate: calculateDeliveryEstimate,
    renderBadge: renderDeliveryBadge,
    renderCompact: renderCompactBadge,
    renderInline: renderInlineBadge,
    renderZipInput,
    getLocation: () => customerLocation,
    getStateFromZip,
    getZone,
    config: CONFIG
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeliveryBadges);
  } else {
    // DOM already loaded
    setTimeout(initDeliveryBadges, 0);
  }

  console.log('[DeliveryBadge] v2.0.0 loaded - GeoIP caching & province fallback fixed');
})();
