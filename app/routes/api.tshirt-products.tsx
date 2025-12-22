/**
 * T-Shirt Products API
 * 
 * Returns available t-shirt products for the "T-Shirt Included" mode
 * These products are linked to DTF products as add-on items
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

interface TshirtProduct {
  id: string;
  title: string;
  handle: string;
  price: string;
  variants: {
    id: string;
    title: string;
    price: string;
    available: boolean;
    option1: string | null; // Size
    option2: string | null; // Color
  }[];
  featuredImage: string | null;
  colors: string[];
  sizes: string[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    
    // Query products tagged with "custom-upload-tshirt" or in specific collection
    const response = await admin.graphql(`
      query GetTshirtProducts {
        products(first: 20, query: "tag:custom-upload-tshirt OR product_type:T-Shirt") {
          edges {
            node {
              id
              title
              handle
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              featuredImage {
                url
              }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              options {
                name
                values
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    
    if (data.errors) {
      console.error("[T-Shirt Products API] GraphQL errors:", data.errors);
      return json({ error: "Failed to fetch products" }, { status: 500 });
    }

    const products: TshirtProduct[] = data.data.products.edges.map((edge: any) => {
      const node = edge.node;
      
      // Extract colors and sizes from options
      let colors: string[] = [];
      let sizes: string[] = [];
      
      node.options.forEach((option: any) => {
        if (option.name.toLowerCase() === 'color' || option.name.toLowerCase() === 'colour') {
          colors = option.values;
        } else if (option.name.toLowerCase() === 'size') {
          sizes = option.values;
        }
      });

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        price: node.priceRangeV2.minVariantPrice.amount,
        variants: node.variants.edges.map((v: any) => {
          const variant = v.node;
          let option1 = null;
          let option2 = null;
          
          variant.selectedOptions.forEach((opt: any) => {
            if (opt.name.toLowerCase() === 'size') {
              option1 = opt.value;
            } else if (opt.name.toLowerCase() === 'color' || opt.name.toLowerCase() === 'colour') {
              option2 = opt.value;
            }
          });

          return {
            id: variant.id,
            title: variant.title,
            price: variant.price,
            available: variant.availableForSale,
            option1, // Size
            option2, // Color
          };
        }),
        featuredImage: node.featuredImage?.url || null,
        colors,
        sizes,
      };
    });

    return json({ products });
  } catch (error) {
    console.error("[T-Shirt Products API] Error:", error);
    return json({ error: "Authentication required" }, { status: 401 });
  }
}
