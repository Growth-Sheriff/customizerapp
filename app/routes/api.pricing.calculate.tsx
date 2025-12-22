/**
 * Pricing Calculation API
 * 
 * Calculates dynamic pricing based on:
 * - DTF sheet base price
 * - T-shirt inclusion (if enabled)
 * - Print locations (per-location fees)
 * - Quantity
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

// Default pricing configuration
const DEFAULT_PRICING = {
  dtfSheetBase: 12.00, // Base price for DTF sheet
  tshirtPrice: 15.00,  // T-shirt add-on price
  locationPrices: {
    front: 5.00,
    back: 5.00,
    left_sleeve: 3.00,
    right_sleeve: 3.00,
  },
  quantityDiscounts: [
    { min: 1, max: 5, discount: 0 },
    { min: 6, max: 10, discount: 0.05 }, // 5% off
    { min: 11, max: 25, discount: 0.10 }, // 10% off
    { min: 26, max: 50, discount: 0.15 }, // 15% off
    { min: 51, max: Infinity, discount: 0.20 }, // 20% off
  ],
};

interface PricingRequest {
  mode: 'dtf_only' | 'tshirt_included';
  locations: string[];
  quantity: number;
  shopDomain?: string;
}

interface PricingResponse {
  breakdown: {
    dtfBase: number;
    tshirt: number;
    locations: { [key: string]: number };
    subtotal: number;
    discount: number;
    discountPercent: number;
    total: number;
  };
  unitPrice: number;
  totalPrice: number;
  formattedTotal: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Return default pricing config for GET requests
  return json({
    config: DEFAULT_PRICING,
    message: "Use POST to calculate pricing"
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body: PricingRequest = await request.json();
    const { mode, locations = [], quantity = 1, shopDomain } = body;

    // TODO: Load shop-specific pricing from metafields if shopDomain provided
    const pricing = DEFAULT_PRICING;

    // Calculate base prices
    let dtfBase = pricing.dtfSheetBase;
    let tshirt = 0;
    let locationsTotal = 0;
    const locationBreakdown: { [key: string]: number } = {};

    // Add t-shirt price if mode is tshirt_included
    if (mode === 'tshirt_included') {
      tshirt = pricing.tshirtPrice;
      
      // Add location prices
      for (const location of locations) {
        const locationPrice = pricing.locationPrices[location as keyof typeof pricing.locationPrices] || 5.00;
        locationBreakdown[location] = locationPrice;
        locationsTotal += locationPrice;
      }
    }

    // Calculate subtotal per unit
    const subtotalPerUnit = dtfBase + tshirt + locationsTotal;
    const subtotal = subtotalPerUnit * quantity;

    // Apply quantity discount
    let discountPercent = 0;
    for (const tier of pricing.quantityDiscounts) {
      if (quantity >= tier.min && quantity <= tier.max) {
        discountPercent = tier.discount;
        break;
      }
    }

    const discount = subtotal * discountPercent;
    const total = subtotal - discount;
    const unitPrice = total / quantity;

    const response: PricingResponse = {
      breakdown: {
        dtfBase,
        tshirt,
        locations: locationBreakdown,
        subtotal,
        discount,
        discountPercent: discountPercent * 100,
        total,
      },
      unitPrice: Math.round(unitPrice * 100) / 100,
      totalPrice: Math.round(total * 100) / 100,
      formattedTotal: `$${(Math.round(total * 100) / 100).toFixed(2)}`,
    };

    return json(response);
  } catch (error) {
    console.error("[Pricing API] Error:", error);
    return json({ error: "Invalid request" }, { status: 400 });
  }
}
