import { Page } from 'playwright';

/**
 * Flow configuration for scanning e-commerce storefronts
 */

export interface FlowStep {
  action: 'navigate' | 'click' | 'wait' | 'scroll' | 'type' | 'fill' | 'press';
  target?: string; // URL for navigate, selector for click/type/fill
  value?: string; // value for type/fill
  waitMs?: number; // milliseconds to wait
  description: string;
}

export interface ScanFlow {
  name: string;
  description: string;
  steps: FlowStep[];
}

/**
 * Common selectors for e-commerce sites
 * These are generic fallbacks that work on most storefronts
 */
const COMMON_SELECTORS = {
  // Product page selectors
  productLink: [
    'a[href*="/products/"]', // Shopify default
    'a[href*="/product/"]',
    '.product-link',
    '[data-testid="product-link"]',
    '.productCard a',
    'h2 a[href*="/product"]',
  ],

  // Add to cart selectors
  addToCart: [
    'button[name="add"]', // Shopify default
    'button[aria-label*="Add to cart"]',
    'button:has-text("Add to cart")',
    'button:has-text("Add To Cart")',
    '[data-testid="add-to-cart"]',
    '.add-to-cart',
    'button[class*="add-to-cart"]',
  ],

  // Checkout/cart related
  proceedToCheckout: [
    'a[href*="/checkout"]',
    'button:has-text("Proceed to checkout")',
    'button:has-text("Checkout")',
    '[data-testid="checkout-button"]',
    '.checkout-button',
  ],

  // Product grid/list
  productGrid: [
    '.product-list',
    '.products',
    '[data-testid="product-list"]',
    '.collection-products',
    '.grid',
  ],

  // Cart icon/link
  cartLink: [
    'a[href="/cart"]',
    'a[href*="/cart"]',
    '[data-testid="cart"]',
    '.cart-link',
    'button[aria-label*="cart"]',
  ],

  // Search/filter
  searchInput: [
    'input[placeholder*="search"]',
    '[data-testid="search"]',
    '.search-input',
  ],
};

/**
 * Execute a flow step on a page
 */
async function executeStep(page: Page, step: FlowStep, siteUrl: string): Promise<void> {
  switch (step.action) {
    case 'navigate': {
      if (!step.target) {
        throw new Error('Navigate action requires target URL');
      }
      const url = step.target.startsWith('http') ? step.target : new URL(step.target, siteUrl).toString();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {
        // Timeouts are acceptable
      });
      break;
    }

    case 'click': {
      if (!step.target) {
        throw new Error('Click action requires target selector');
      }
      // Try multiple selectors
      const selectors = Array.isArray(step.target) ? step.target : [step.target];
      let clicked = false;

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await page.click(selector, { timeout: 5000 });
            clicked = true;
            break;
          }
        } catch {
          // Try next selector
        }
      }

      if (!clicked) {
        console.warn(`Could not find clickable element with selectors: ${selectors.join(', ')}`);
      }
      break;
    }

    case 'wait': {
      const waitMs = step.waitMs || 1000;
      await page.waitForTimeout(waitMs);
      break;
    }

    case 'scroll': {
      const scrollAmount = step.value ? parseInt(step.value, 10) : 500;
      await page.evaluate((amount) => {
        window.scrollBy(0, amount);
      }, scrollAmount);
      await page.waitForTimeout(500); // Let content load after scroll
      break;
    }

    case 'type': {
      if (!step.target || !step.value) {
        throw new Error('Type action requires target selector and value');
      }
      await page.click(step.target, { timeout: 5000 });
      await page.fill(step.target, step.value);
      break;
    }

    case 'fill': {
      if (!step.target || !step.value) {
        throw new Error('Fill action requires target selector and value');
      }
      await page.fill(step.target, step.value);
      break;
    }

    case 'press': {
      if (!step.value) {
        throw new Error('Press action requires key value');
      }
      await page.press(step.target || 'body', step.value);
      break;
    }

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

/**
 * Execute a complete flow on a page
 */
export async function executeFlow(
  page: Page,
  flow: ScanFlow,
  siteUrl: string
): Promise<void> {
  console.log(`Executing flow: ${flow.name}`);

  for (const step of flow.steps) {
    try {
      console.log(`  - ${step.description}`);
      await executeStep(page, step, siteUrl);
    } catch (error) {
      console.warn(`  Step failed: ${error}. Continuing...`);
      // Continue with next step
    }
  }
}

/**
 * Try to find an element from a list of selectors
 */
export async function findElementBySelectors(
  page: Page,
  selectors: string[]
): Promise<string | null> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        return selector;
      }
    } catch {
      // Try next selector
    }
  }
  return null;
}

/**
 * Try to click an element from a list of selectors
 */
export async function clickBySelectors(
  page: Page,
  selectors: string[]
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await page.click(selector, { timeout: 5000 });
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  return false;
}

/**
 * Default scan flows for e-commerce storefronts
 */
export const DEFAULT_FLOWS = {
  /**
   * Homepage flow: Navigate to base URL, wait for load, scroll down
   */
  homepage: {
    name: 'homepage',
    description: 'Scan homepage - navigate, wait for load, scroll',
    steps: [
      {
        action: 'navigate',
        target: '/',
        description: 'Navigate to homepage',
      },
      {
        action: 'wait',
        waitMs: 2000,
        description: 'Wait for initial page load',
      },
      {
        action: 'scroll',
        value: '500',
        description: 'Scroll down to trigger lazy loading',
      },
      {
        action: 'scroll',
        value: '500',
        description: 'Scroll further to load more content',
      },
      {
        action: 'wait',
        waitMs: 1000,
        description: 'Wait for deferred content to load',
      },
    ] as FlowStep[],
  } as ScanFlow,

  /**
   * Product page flow: Navigate to homepage, find and click first product
   */
  product_page: {
    name: 'product_page',
    description: 'Scan product page - find and click first product',
    steps: [
      {
        action: 'navigate',
        target: '/',
        description: 'Navigate to homepage',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for products to load',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.productLink,
        description: 'Click on first product link',
      },
      {
        action: 'wait',
        waitMs: 2000,
        description: 'Wait for product page to load',
      },
      {
        action: 'scroll',
        value: '300',
        description: 'Scroll to view product details',
      },
      {
        action: 'wait',
        waitMs: 500,
        description: 'Wait for any deferred product info',
      },
    ] as FlowStep[],
  } as ScanFlow,

  /**
   * Shopping cart flow: Add product to cart and view cart
   */
  cart: {
    name: 'cart',
    description: 'Scan cart flow - add product and view cart',
    steps: [
      {
        action: 'navigate',
        target: '/',
        description: 'Navigate to homepage',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for products to load',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.productLink,
        description: 'Click on first product',
      },
      {
        action: 'wait',
        waitMs: 2000,
        description: 'Wait for product page to load',
      },
      {
        action: 'scroll',
        value: '300',
        description: 'Scroll to add-to-cart button',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.addToCart,
        description: 'Click add to cart button',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for item to be added',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.cartLink,
        description: 'Click cart link to view cart',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for cart page to load',
      },
    ] as FlowStep[],
  } as ScanFlow,

  /**
   * Checkout initialization flow: Add to cart and start checkout
   */
  checkout_init: {
    name: 'checkout_init',
    description: 'Scan checkout flow - add product and initiate checkout',
    steps: [
      {
        action: 'navigate',
        target: '/',
        description: 'Navigate to homepage',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for products to load',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.productLink,
        description: 'Click on first product',
      },
      {
        action: 'wait',
        waitMs: 2000,
        description: 'Wait for product page to load',
      },
      {
        action: 'scroll',
        value: '300',
        description: 'Scroll to add-to-cart button',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.addToCart,
        description: 'Click add to cart button',
      },
      {
        action: 'wait',
        waitMs: 1500,
        description: 'Wait for item to be added',
      },
      {
        action: 'click',
        target: COMMON_SELECTORS.proceedToCheckout,
        description: 'Click proceed to checkout button',
      },
      {
        action: 'wait',
        waitMs: 2000,
        description: 'Wait for checkout page to load',
      },
      {
        action: 'scroll',
        value: '300',
        description: 'Scroll to view checkout form',
      },
    ] as FlowStep[],
  } as ScanFlow,
};

/**
 * Helper to create a custom flow
 */
export function createCustomFlow(
  name: string,
  description: string,
  steps: FlowStep[]
): ScanFlow {
  return {
    name,
    description,
    steps,
  };
}

/**
 * Merge default selectors with custom ones
 */
export function getSelectors(): typeof COMMON_SELECTORS {
  return COMMON_SELECTORS;
}
