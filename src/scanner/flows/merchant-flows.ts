/**
 * Merchant-Specific Scan Flows
 * Extracted from E2E UI Automation scripts at:
 * /Users/mohammadshahiknawaze/Workspace/storefront-e2e-UI-automation/merchants/
 *
 * These flows use exact selectors from the actual test suites for reliable error detection.
 */

import { ScanFlow, FlowStep } from './default-flows';

// ============================================================================
// WELLVERSED SELECTORS (from merchants/Wellversed/pages/)
// ============================================================================
const WELLVERSED_SELECTORS = {
  // Header & Navigation
  searchBar: "div[data-testid='header-desktop-search-container'] input[placeholder='Shop for Health Supplements']",
  cartButton: "[data-testid='header-desktop-cart-button']",
  profileIcon: '//div[@aria-label="Profile"]//span[text()="Profile"]',
  loginButton: 'div[data-testid="header-desktop-profile-button"] button#login[data-test-id="login-button"]',

  // Category Navigation
  shopByCategory: '[data-testid="nav-desktop-shop-by-category"]',
  brandsMenu: '[data-testid="nav-desktop-brands"]',
  bestseller: '[data-testid="nav-desktop-bestseller"]',

  // Product Cards (Homepage/PLP)
  productCard: '[data-testid="productcard"]',
  productCardTitle: '[data-testid="productcard-title"]',
  productCardPrice: '[data-testid="productcard-price"]',
  productCardAddToCart: '[data-testid="productcard-add-to-cart"]',

  // Product Detail Page
  pdpAddToCart: 'div[data-testid="pinfo-add-to-cart"]',
  pdpBuyNow: 'div[data-testid="pinfo-buy-now-button"]',
  pdpPrice: 'p[data-testid="info-price-label"]',
  quantityInput: 'input[inputmode="numeric"][aria-label="Quantity"]',

  // Cart Drawer
  cartDrawer: 'div[data-testid="cart-drawer"]',
  cartItems: '[data-testid="cart-items"]',
  cartSummary: 'div.cart-summary',
  checkoutButton: 'div.cart-summary button',

  // GoKwik Checkout iframe
  gokwikIframe: '#gokwik-iframe',
  gokwikDeliveryDetails: 'text=DELIVERY DETAILS',
  gokwikPhoneInput: 'input#phone-input',
  gokwikOtpInput: 'input[autocomplete="one-time-code"]',
  gokwikSummaryPricing: 'div.summary-pricing',
  gokwikFinalPrice: 'div.summary-pricing span.final-price',

  // KwikPass Login iframe
  kwikpassIframe: '#iframe-kp',
  kwikpassPhoneInput: 'input#phone-input',
  kwikpassOtpContainer: 'div.gokwik-otp-container',
  kwikpassCloseButton: 'button#desktop_close_button',

  // Footer
  footer: '.mt-0',
  footerLink: "[data-testid^='footer-']",
  socialMedia: "[data-testid^='footer-social-']",

  // Coupons
  viewAllOffers: 'text=View all offers',
  couponApply: 'button:has-text("Apply")',
};

// ============================================================================
// PLIXKIDS SELECTORS (from merchants/PlixKids/pages/)
// ============================================================================
const PLIXKIDS_SELECTORS = {
  // Header & Navigation
  searchIcon: '[data-testid="header-search-icon"], button[aria-label*="search"]',
  searchInput: 'input[placeholder*="Search"]',
  cartIcon: '[data-testid="header-cart-icon"], button[aria-label*="cart"]',
  cartCount: '[data-testid="cart-count"]',

  // Product Cards
  productCards: 'div.group:has(a[href*="/product/"])',
  productCardNames: 'div.group:has(a[href*="/product/"]) h3',
  productCardPrices: 'div.group:has(a[href*="/product/"]) span:has-text("₹")',
  productCardAddToCart: 'div.group:has(a[href*="/product/"]) button:has-text("ADD")',

  // Collection Links
  collectionLinks: 'a[href*="/collection/"]',

  // Product Detail Page
  productTitle: 'h1',
  productPrice: 'span:has-text("₹")',
  addToCartButton: '[data-testid="product-add-to-cart-button-desktop"], button:has-text("ADD TO CART"), button:has-text("Add To Cart")',
  buyNowButton: 'button:has-text("BUY NOW"), button:has-text("Buy Now")',
  quantityInput: '[data-testid="quantity-input"], input[type="number"]',
  quantityIncrement: '[data-testid="quantity-increment"], button:has-text("+")',
  quantityDecrement: '[data-testid="quantity-decrement"], button:has-text("-")',

  // Variant Selection
  ageVariantButtons: 'button:has-text("Years"), button:has-text("yrs")',
  productTypeButtons: 'button:has-text("Growth"), button:has-text("Immunity"), button:has-text("Energy")',

  // Cart Drawer
  cartDrawer: 'div.fixed.right-0',
  cartHeader: 'text=Shopping Cart',
  cartItems: 'div.fixed.right-0 >> div:has(img):has(button:has-text("+"))',
  cartItemPrices: 'div.fixed.right-0 >> span:has-text("₹")',
  cartIncrementButton: 'div.fixed.right-0 >> button:has-text("+")',
  cartDecrementButton: 'div.fixed.right-0 >> button:has-text("−")',
  closeCartButton: 'div.fixed.right-0 button',

  // Coupon
  couponInput: 'input[placeholder*="Enter Coupon Code"], input[placeholder*="Coupon"]',
  couponApplyButton: 'button:has-text("APPLY")',
  freebiesPopup: 'text=/Freebies worth/i',
  freebiesThanksButton: 'text=/Woohoo, Thanks/i',

  // Checkout
  checkoutButton: 'div.fixed.right-0 button:has-text("PROCEED TO PAY")',
  totalAmount: 'div.fixed.right-0 >> span:has-text("₹")',
};

// ============================================================================
// WELLVERSED FLOWS
// ============================================================================
export const WELLVERSED_FLOWS: { [key: string]: ScanFlow } = {
  homepage: {
    name: 'wellversed_homepage',
    description: 'Wellversed homepage scan with specific selectors',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to Wellversed homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page load' },
      { action: 'scroll', value: '500', description: 'Scroll to load products' },
      { action: 'wait', waitMs: 1000, description: 'Wait for lazy content' },
      { action: 'scroll', value: '500', description: 'Scroll further' },
    ] as FlowStep[],
  },

  product_page: {
    name: 'wellversed_product_page',
    description: 'Wellversed product detail page flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: WELLVERSED_SELECTORS.productCard, description: 'Click first product card' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP load' },
      { action: 'scroll', value: '300', description: 'Scroll to view product info' },
    ] as FlowStep[],
  },

  add_to_cart: {
    name: 'wellversed_add_to_cart',
    description: 'Wellversed add to cart flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: WELLVERSED_SELECTORS.productCard, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'scroll', value: '200', description: 'Scroll to Add to Cart' },
      { action: 'click', target: WELLVERSED_SELECTORS.pdpAddToCart, description: 'Click Add to Cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart update' },
    ] as FlowStep[],
  },

  cart_drawer: {
    name: 'wellversed_cart_drawer',
    description: 'Wellversed cart drawer flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WELLVERSED_SELECTORS.productCard, description: 'Click product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: WELLVERSED_SELECTORS.pdpAddToCart, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart' },
      { action: 'click', target: WELLVERSED_SELECTORS.cartButton, description: 'Open cart drawer' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer' },
    ] as FlowStep[],
  },

  checkout_init: {
    name: 'wellversed_checkout_init',
    description: 'Wellversed checkout initialization with GoKwik',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WELLVERSED_SELECTORS.productCard, description: 'Click product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: WELLVERSED_SELECTORS.pdpAddToCart, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart' },
      { action: 'click', target: WELLVERSED_SELECTORS.cartButton, description: 'Open cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer' },
      { action: 'click', target: WELLVERSED_SELECTORS.checkoutButton, description: 'Click checkout button' },
      { action: 'wait', waitMs: 3000, description: 'Wait for GoKwik iframe' },
    ] as FlowStep[],
  },

  search: {
    name: 'wellversed_search',
    description: 'Wellversed search functionality',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WELLVERSED_SELECTORS.searchBar, description: 'Click search bar' },
      { action: 'type', target: WELLVERSED_SELECTORS.searchBar, value: 'protein', description: 'Type search term' },
      { action: 'press', value: 'Enter', description: 'Submit search' },
      { action: 'wait', waitMs: 2000, description: 'Wait for results' },
    ] as FlowStep[],
  },

  login_flow: {
    name: 'wellversed_login',
    description: 'Wellversed KwikPass login flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      // Note: Login requires iframe interaction - this tests if iframe loads
      { action: 'scroll', value: '0', description: 'Ensure page is at top' },
    ] as FlowStep[],
  },
};

// ============================================================================
// PLIXKIDS FLOWS
// ============================================================================
export const PLIXKIDS_FLOWS: { [key: string]: ScanFlow } = {
  homepage: {
    name: 'plixkids_homepage',
    description: 'PlixKids homepage scan',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to PlixKids homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page load' },
      { action: 'scroll', value: '500', description: 'Scroll to load products' },
      { action: 'wait', waitMs: 1000, description: 'Wait for lazy content' },
      { action: 'scroll', value: '500', description: 'Scroll further' },
    ] as FlowStep[],
  },

  product_page: {
    name: 'plixkids_product_page',
    description: 'PlixKids product detail page flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCards, description: 'Click first product card' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP load' },
      { action: 'scroll', value: '300', description: 'Scroll to view product' },
    ] as FlowStep[],
  },

  add_to_cart: {
    name: 'plixkids_add_to_cart',
    description: 'PlixKids add to cart flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCards, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'scroll', value: '200', description: 'Scroll to Add to Cart' },
      { action: 'click', target: PLIXKIDS_SELECTORS.addToCartButton, description: 'Click Add to Cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart update' },
    ] as FlowStep[],
  },

  cart_drawer: {
    name: 'plixkids_cart_drawer',
    description: 'PlixKids cart drawer flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCardAddToCart, description: 'Add first product to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer to open' },
      { action: 'scroll', value: '100', description: 'Scroll in cart drawer' },
    ] as FlowStep[],
  },

  checkout_init: {
    name: 'plixkids_checkout_init',
    description: 'PlixKids checkout initialization',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCardAddToCart, description: 'Add to cart from homepage' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer' },
      { action: 'click', target: PLIXKIDS_SELECTORS.checkoutButton, description: 'Click Proceed to Pay' },
      { action: 'wait', waitMs: 3000, description: 'Wait for checkout page' },
    ] as FlowStep[],
  },

  variant_selection: {
    name: 'plixkids_variant_selection',
    description: 'PlixKids variant selection (age groups)',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCards, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: PLIXKIDS_SELECTORS.ageVariantButtons, description: 'Click age variant' },
      { action: 'wait', waitMs: 1000, description: 'Wait for variant update' },
    ] as FlowStep[],
  },

  coupon_flow: {
    name: 'plixkids_coupon',
    description: 'PlixKids coupon application flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: PLIXKIDS_SELECTORS.productCardAddToCart, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer' },
      { action: 'scroll', value: '200', description: 'Scroll to coupon section' },
      { action: 'click', target: PLIXKIDS_SELECTORS.couponInput, description: 'Click coupon input' },
      { action: 'wait', waitMs: 500, description: 'Wait for input focus' },
    ] as FlowStep[],
  },
};

// ============================================================================
// AQUALOGICA SELECTORS (from merchants/Aqualogica/pages/)
// Base URL: https://store.aqualogica.in/
// ============================================================================
const AQUALOGICA_SELECTORS = {
  // Header & Navigation
  searchIcon: 'button[aria-label*="search"], [class*="search-icon"]',
  searchInput: 'input[placeholder*="Search"]',
  cartIcon: '[class*="cart-icon"], button[aria-label*="cart"]',

  // Product Cards (Homepage/Collection)
  productCards: '[class*="product"]',
  addToCartButtons: 'button:has-text("Add to cart"), button:has-text("ADD TO CART")',

  // Category Navigation
  sunscreenCategory: 'a:has-text("Sunscreen"), a[href*="sunscreen"]',
  fragranceCategory: 'a:has-text("Fragrance"), a[href*="fragrance"]',
  moisturizerCategory: 'a:has-text("Moisturizer"), a[href*="moisturizer"]',

  // Product Detail Page
  pdpAddToCart: 'button:has-text("Add to cart"), button:has-text("ADD TO CART")',
  buyNowButton: 'button:has-text("Buy Now"), button:has-text("BUY NOW")',
  quantityInput: 'input[type="number"], input[name*="quantity"]',
  productTitle: 'h1',
  productPrice: 'span:has-text("₹"), [class*="price"]',

  // Cart Drawer
  cartDrawer: '[class*="cart-drawer"], [class*="cart-sidebar"], [role="dialog"]:has-text("Cart")',
  cartItems: '[class*="cart-item"], [class*="line-item"]',
  checkoutButton: 'button:has-text("Checkout"), a:has-text("Checkout")',

  // Coupons
  couponInput: 'input[placeholder*="code"], input[name*="coupon"]',
  couponApplyButton: 'button:has-text("Apply")',

  // Footer
  footer: 'footer',
  footerLinks: 'footer a',
};

// ============================================================================
// WERYZE SELECTORS (from merchants/Weryze/pages/)
// Base URL: https://weryze.com/
// ============================================================================
const WERYZE_SELECTORS = {
  // Header & Navigation
  userProfileIcon: "button[aria-label='Login']",
  cartBtn: '[data-test-id="cart-button"]',
  cartWindow: "h2:has-text('Cart')",
  closeCartBtn: '[id="close-cart"]',

  // Preference Popup (unique to Weryze - habit selection)
  preferencePopup: "h2:has-text('Which habit are you trying to quit?')",
  iSmokeOption: '[data-test-id="I SMOKE button"]',
  iVapeOption: '[data-test-id="I VAPE button"]',

  // Product Cards
  productCards: '[class*="product"]',
  productLinks: 'a[href*="/products/"]',

  // Product Detail Page
  addToCartButton: "//button[contains(text(), 'Add to cart')]",
  cartHeading: "//h2[contains(text(), 'CART')]",
  ageVerificationCheckbox: '#age-verification',
  checkoutButton: 'button.w-full.flex.flex-col.items-center.justify-center.rounded-md',
  productTitle: 'h1',
  productPrice: 'span:has-text("₹")',

  // Variant Selection
  variantButtons: '[data-test-id*="variant-"]',

  // GoKwik Checkout iframe
  gokwikIframe: 'iframe.gokwik-iframe',
  gokwikDeliveryDetails: 'text=DELIVERY DETAILS',

  // KwikPass Login iframe
  kwikpassIframe: '#iframe-kp',
  kwikpassPhoneInput: 'input#phone-input',

  // Cart
  cartItems: '[class*="cart-item"]',
  cartTotal: '[class*="total"]',
};

// ============================================================================
// AQUALOGICA FLOWS
// ============================================================================
export const AQUALOGICA_FLOWS: { [key: string]: ScanFlow } = {
  homepage: {
    name: 'aqualogica_homepage',
    description: 'Aqualogica homepage scan with specific selectors',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to Aqualogica homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page load' },
      { action: 'scroll', value: '500', description: 'Scroll to load products' },
      { action: 'wait', waitMs: 1000, description: 'Wait for lazy content' },
      { action: 'scroll', value: '500', description: 'Scroll further' },
    ] as FlowStep[],
  },

  product_page: {
    name: 'aqualogica_product_page',
    description: 'Aqualogica product detail page flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: AQUALOGICA_SELECTORS.productCards, description: 'Click first product card' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP load' },
      { action: 'scroll', value: '300', description: 'Scroll to view product info' },
    ] as FlowStep[],
  },

  add_to_cart: {
    name: 'aqualogica_add_to_cart',
    description: 'Aqualogica add to cart flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: AQUALOGICA_SELECTORS.productCards, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'scroll', value: '200', description: 'Scroll to Add to Cart' },
      { action: 'click', target: AQUALOGICA_SELECTORS.pdpAddToCart, description: 'Click Add to Cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart update' },
    ] as FlowStep[],
  },

  cart_drawer: {
    name: 'aqualogica_cart_drawer',
    description: 'Aqualogica cart drawer flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: AQUALOGICA_SELECTORS.addToCartButtons, description: 'Add first product to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer to open' },
      { action: 'scroll', value: '100', description: 'Scroll in cart area' },
    ] as FlowStep[],
  },

  checkout_init: {
    name: 'aqualogica_checkout_init',
    description: 'Aqualogica checkout initialization',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: AQUALOGICA_SELECTORS.addToCartButtons, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart drawer' },
      { action: 'click', target: AQUALOGICA_SELECTORS.checkoutButton, description: 'Click checkout button' },
      { action: 'wait', waitMs: 3000, description: 'Wait for checkout page' },
    ] as FlowStep[],
  },

  category_browse: {
    name: 'aqualogica_category_browse',
    description: 'Aqualogica category browsing (sunscreen, moisturizer)',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: AQUALOGICA_SELECTORS.sunscreenCategory, description: 'Click sunscreen category' },
      { action: 'wait', waitMs: 2000, description: 'Wait for category page' },
      { action: 'scroll', value: '500', description: 'Scroll to load products' },
    ] as FlowStep[],
  },
};

// ============================================================================
// WERYZE FLOWS
// ============================================================================
export const WERYZE_FLOWS: { [key: string]: ScanFlow } = {
  homepage: {
    name: 'weryze_homepage',
    description: 'Weryze homepage scan with preference popup handling',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to Weryze homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page load' },
      // Handle preference popup if it appears
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup - select I SMOKE' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'scroll', value: '500', description: 'Scroll to load products' },
      { action: 'wait', waitMs: 1000, description: 'Wait for lazy content' },
    ] as FlowStep[],
  },

  product_page: {
    name: 'weryze_product_page',
    description: 'Weryze product detail page flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'click', target: WERYZE_SELECTORS.productLinks, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP load' },
      { action: 'scroll', value: '300', description: 'Scroll to view product info' },
    ] as FlowStep[],
  },

  add_to_cart: {
    name: 'weryze_add_to_cart',
    description: 'Weryze add to cart flow with age verification',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for products' },
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'click', target: WERYZE_SELECTORS.productLinks, description: 'Click first product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: WERYZE_SELECTORS.ageVerificationCheckbox, description: 'Accept age verification' },
      { action: 'wait', waitMs: 500, description: 'Wait after checkbox' },
      { action: 'click', target: WERYZE_SELECTORS.addToCartButton, description: 'Click Add to Cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart update' },
    ] as FlowStep[],
  },

  cart_view: {
    name: 'weryze_cart_view',
    description: 'Weryze cart view flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'click', target: WERYZE_SELECTORS.productLinks, description: 'Click product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: WERYZE_SELECTORS.ageVerificationCheckbox, description: 'Accept age verification' },
      { action: 'click', target: WERYZE_SELECTORS.addToCartButton, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart' },
      { action: 'click', target: WERYZE_SELECTORS.cartBtn, description: 'Open cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart view' },
    ] as FlowStep[],
  },

  checkout_init: {
    name: 'weryze_checkout_init',
    description: 'Weryze checkout initialization with GoKwik',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'click', target: WERYZE_SELECTORS.productLinks, description: 'Click product' },
      { action: 'wait', waitMs: 2000, description: 'Wait for PDP' },
      { action: 'click', target: WERYZE_SELECTORS.ageVerificationCheckbox, description: 'Accept age verification' },
      { action: 'click', target: WERYZE_SELECTORS.addToCartButton, description: 'Add to cart' },
      { action: 'wait', waitMs: 1500, description: 'Wait for cart' },
      { action: 'click', target: WERYZE_SELECTORS.checkoutButton, description: 'Click checkout button' },
      { action: 'wait', waitMs: 3000, description: 'Wait for GoKwik iframe' },
    ] as FlowStep[],
  },

  login_flow: {
    name: 'weryze_login',
    description: 'Weryze KwikPass login flow',
    steps: [
      { action: 'navigate', target: '/', description: 'Navigate to homepage' },
      { action: 'wait', waitMs: 2000, description: 'Wait for page' },
      { action: 'click', target: WERYZE_SELECTORS.iSmokeOption, description: 'Handle preference popup' },
      { action: 'wait', waitMs: 1000, description: 'Wait after popup' },
      { action: 'click', target: WERYZE_SELECTORS.userProfileIcon, description: 'Click login button' },
      { action: 'wait', waitMs: 2000, description: 'Wait for KwikPass iframe' },
    ] as FlowStep[],
  },
};

// ============================================================================
// MERCHANT FLOW REGISTRY
// ============================================================================
export const MERCHANT_FLOWS: { [merchantName: string]: { [flowName: string]: ScanFlow } } = {
  Wellversed: WELLVERSED_FLOWS,
  PlixKids: PLIXKIDS_FLOWS,
  Aqualogica: AQUALOGICA_FLOWS,
  Weryze: WERYZE_FLOWS,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get flows for a specific merchant
 */
export function getMerchantFlows(merchantName: string): ScanFlow[] {
  const flows = MERCHANT_FLOWS[merchantName];
  if (!flows) {
    return [];
  }
  return Object.values(flows);
}

/**
 * Get a specific flow for a merchant
 */
export function getMerchantFlow(merchantName: string, flowName: string): ScanFlow | null {
  const flows = MERCHANT_FLOWS[merchantName];
  if (!flows || !flows[flowName]) {
    return null;
  }
  return flows[flowName];
}

/**
 * Check if merchant has custom flows
 */
export function hasMerchantFlows(merchantName: string): boolean {
  return !!MERCHANT_FLOWS[merchantName];
}

/**
 * Get all available merchant names
 */
export function getAvailableMerchants(): string[] {
  return Object.keys(MERCHANT_FLOWS);
}

/**
 * Export selectors for external use (e.g., visual testing)
 */
export const MERCHANT_SELECTORS = {
  Wellversed: WELLVERSED_SELECTORS,
  PlixKids: PLIXKIDS_SELECTORS,
  Aqualogica: AQUALOGICA_SELECTORS,
  Weryze: WERYZE_SELECTORS,
};
