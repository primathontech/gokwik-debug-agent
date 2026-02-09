import {
  NetworkError,
  ConsoleError,
  Classification,
  ErrorCategory,
  Severity,
  IssueDomain,
} from '../models/incident';

interface RuleScore {
  category: ErrorCategory;
  score: number;
  confidence: number;
}

interface DomainMatch {
  domain: IssueDomain;
  sourceSystem: Classification['sourceSystem'];
  confidence: number;
  reasoning: string;
}

type SeverityMap = {
  [key in ErrorCategory]: Severity;
};

type OwnerMap = {
  [key in ErrorCategory]: string;
};

const SEVERITY_MAP: SeverityMap = {
  // Network errors
  network_4xx: 'medium',
  network_5xx: 'high',
  network_timeout: 'high',
  network_cors: 'high',
  // Console/JS errors
  console_error: 'medium',
  console_warning: 'low',
  js_runtime_error: 'high',
  resource_error: 'medium',
  visual_issue: 'medium',
  hydration_error: 'medium',
  rendering_issue: 'medium',
  // GoKwik/E-commerce specific
  payment_error: 'critical',
  checkout_error: 'critical',
  cart_error: 'critical',
  auth_error: 'high',
  sdk_load_error: 'critical',
  third_party_error: 'medium',
  cdn_error: 'high',
  api_schema_error: 'high',
  performance_degradation: 'medium',
  security_error: 'high',
  seo_error: 'low',
  websocket_error: 'medium',
  // Shopify-specific
  shopify_api_error: 'high',
  shopify_theme_error: 'medium',
  shopify_app_error: 'medium',
  shopify_rate_limit: 'high',
  shopify_checkout_error: 'critical',
  // Analytics/Tracking errors
  analytics_meta_missing: 'medium',
  analytics_meta_failed: 'high',
  analytics_ga4_missing: 'medium',
  analytics_ga4_failed: 'high',
  analytics_google_ads_failed: 'high',
  analytics_pixel_not_loaded: 'high',
  // Next.js SSR/SSG errors
  nextjs_ssr_error: 'critical',
  nextjs_routing_error: 'high',
  nextjs_build_error: 'high',
  // Web Vitals performance errors
  web_vitals_lcp: 'high',
  web_vitals_cls: 'medium',
  web_vitals_fid: 'high',
  web_vitals_inp: 'high',
  web_vitals_ttfb: 'high',
  // Additional Shopify purchase funnel errors
  shopify_inventory_error: 'critical',
  shopify_discount_error: 'high',
  shopify_shipping_error: 'critical',
  shopify_webhook_error: 'high',
  unknown: 'info',
};

const OWNER_MAP: OwnerMap = {
  // Network errors
  network_4xx: 'Backend / API Team',
  network_5xx: 'Backend / API Team',
  network_timeout: 'Backend / API Team',
  network_cors: 'Backend / DevOps',
  // Console/JS errors
  console_error: 'Frontend Team',
  console_warning: 'Frontend Team',
  js_runtime_error: 'Frontend Team',
  resource_error: 'Frontend / DevOps',
  visual_issue: 'Frontend / Design',
  hydration_error: 'Frontend Team',
  rendering_issue: 'Frontend Team',
  // GoKwik/E-commerce specific
  payment_error: 'Payment Team / GoKwik',
  checkout_error: 'Backend / GoKwik',
  cart_error: 'Backend / API Team',
  auth_error: 'Backend / Security',
  sdk_load_error: 'GoKwik SDK Team',
  third_party_error: 'Frontend / Integrations',
  cdn_error: 'DevOps / CDN Team',
  api_schema_error: 'Frontend Team',
  performance_degradation: 'DevOps / SRE',
  security_error: 'Security Team',
  seo_error: 'Frontend / Marketing',
  websocket_error: 'Backend / Infrastructure',
  // Shopify-specific
  shopify_api_error: 'Shopify / Backend Team',
  shopify_theme_error: 'Shopify / Frontend Team',
  shopify_app_error: 'Shopify / App Team',
  shopify_rate_limit: 'Shopify / Backend Team',
  shopify_checkout_error: 'Shopify / Checkout Team',
  // Analytics/Tracking errors
  analytics_meta_missing: 'Marketing / Analytics Team',
  analytics_meta_failed: 'Marketing / Analytics Team',
  analytics_ga4_missing: 'Marketing / Analytics Team',
  analytics_ga4_failed: 'Marketing / Analytics Team',
  analytics_google_ads_failed: 'Marketing / Ads Team',
  analytics_pixel_not_loaded: 'Frontend / Marketing Team',
  // Next.js SSR/SSG errors
  nextjs_ssr_error: 'Frontend Team',
  nextjs_routing_error: 'Frontend Team',
  nextjs_build_error: 'Frontend / DevOps',
  // Web Vitals performance errors
  web_vitals_lcp: 'Frontend / Performance Team',
  web_vitals_cls: 'Frontend / Performance Team',
  web_vitals_fid: 'Frontend / Performance Team',
  web_vitals_inp: 'Frontend / Performance Team',
  web_vitals_ttfb: 'Frontend / DevOps',
  // Additional Shopify purchase funnel errors
  shopify_inventory_error: 'Shopify / Backend Team',
  shopify_discount_error: 'Shopify / Backend Team',
  shopify_shipping_error: 'Shopify / Backend Team',
  shopify_webhook_error: 'Shopify / Backend Team',
  unknown: 'Support Team',
};

// ============================================================================
// URL Pattern Matchers for Domain Classification
// ============================================================================

// Backend API patterns
const BACKEND_URL_PATTERNS = [
  // GoKwik APIs
  /api-gw.*\.gokwik\.io/i,
  /api\.gokwik\.io/i,
  /gokwik.*\/api\//i,
  /\/api\/v\d+\//i,
  /\/api\/(cart|checkout|order|payment|user|auth|product|inventory)/i,

  // Shopify Backend APIs
  /\.myshopify\.com\/api/i,
  /\.myshopify\.com\/admin/i,
  /shopify\.com\/.*\/graphql/i,
  /\/cart\.js/i,
  /\/cart\/add\.js/i,
  /\/cart\/update\.js/i,
  /\/cart\/change\.js/i,

  // Common backend patterns
  /\/graphql/i,
  /\/rest\//i,
  /\/v\d+\/(api|cart|checkout|orders?|products?|users?)/i,
  /\/(checkout|payment|order).*\/api/i,
];

// Payment Gateway patterns (Third Party - Critical)
const PAYMENT_GATEWAY_PATTERNS = [
  /razorpay/i,
  /paytm/i,
  /phonepe/i,
  /stripe/i,
  /paypal/i,
  /cashfree/i,
  /payu/i,
  /ccavenue/i,
  /juspay/i,
  /simpl/i,
  /lazypay/i,
];

// Analytics/Tracking patterns (Third Party - Low priority)
const ANALYTICS_PATTERNS = [
  /google-analytics/i,
  /googletagmanager/i,
  /gtag/i,
  /facebook.*pixel/i,
  /fb.*events/i,
  /analytics/i,
  /segment\.(io|com)/i,
  /mixpanel/i,
  /amplitude/i,
  /hotjar/i,
  /clarity\.ms/i,
  /clevertap/i,
  /moengage/i,
  /webengage/i,
  /\/collect\?/i,
  /doubleclick/i,
  /adservice/i,
];

// CDN/Static resource patterns
const CDN_PATTERNS = [
  /cloudflare/i,
  /cloudfront/i,
  /akamai/i,
  /fastly/i,
  /jsdelivr/i,
  /unpkg/i,
  /cdnjs/i,
  /cdn\./i,
  /\.cdn\./i,
  /staticxx/i,
];

// Frontend resource patterns
const FRONTEND_RESOURCE_PATTERNS = [
  /\.js(\?|$)/i,
  /\.css(\?|$)/i,
  /\.chunk\./i,
  /\.bundle\./i,
  /webpack/i,
  /\/static\//i,
  /\/assets\//i,
  /\/_next\//i,
  /\/build\//i,
];

// ============================================================================
// Console Error Pattern Matchers
// ============================================================================

// Frontend JS errors
const FE_CONSOLE_PATTERNS = [
  /typeerror/i,
  /referenceerror/i,
  /syntaxerror/i,
  /cannot read propert/i,
  /undefined is not/i,
  /null is not/i,
  /is not a function/i,
  /is not defined/i,
  /hydration/i,
  /minified react error/i,
  /react.*error/i,
  /nextjs/i,
  /webpack/i,
  /chunk.*failed/i,
  /loading chunk/i,
  /module.*not found/i,
  /cannot find module/i,
  /component.*render/i,
  /invalid hook/i,
  /hooks can only/i,
  /maximum update depth/i,
  /too many re-renders/i,
  /invariant violation/i,
];

// Backend-related console errors (usually from failed API calls)
const BE_CONSOLE_PATTERNS = [
  /failed to fetch/i,
  /network error/i,
  /api.*error/i,
  /unauthorized/i,
  /forbidden/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway timeout/i,
  /cors.*blocked/i,
  /cross-origin/i,
  /preflight/i,
  /access-control-allow/i,
  /cart.*failed/i,
  /checkout.*failed/i,
  /payment.*failed/i,
  /order.*failed/i,
  /graphql.*error/i,
  /mutation.*failed/i,
  /query.*failed/i,
];

// ============================================================================
// Domain Classification Functions
// ============================================================================

function classifyNetworkErrorDomain(error: NetworkError): DomainMatch {
  const { url, statusCode, errorMessage } = error;
  const lowerUrl = url.toLowerCase();
  const lowerError = (errorMessage || '').toLowerCase();

  // Check Payment Gateways first (critical third-party)
  for (const pattern of PAYMENT_GATEWAY_PATTERNS) {
    if (pattern.test(lowerUrl)) {
      return {
        domain: 'THIRD_PARTY',
        sourceSystem: 'PAYMENT_GATEWAY',
        confidence: 95,
        reasoning: `Payment gateway error detected (${url.split('/')[2]})`,
      };
    }
  }

  // Check Analytics (low priority third-party)
  for (const pattern of ANALYTICS_PATTERNS) {
    if (pattern.test(lowerUrl)) {
      return {
        domain: 'THIRD_PARTY',
        sourceSystem: 'ANALYTICS',
        confidence: 90,
        reasoning: `Analytics/tracking service error - usually non-critical`,
      };
    }
  }

  // Check CDN patterns
  for (const pattern of CDN_PATTERNS) {
    if (pattern.test(lowerUrl)) {
      return {
        domain: 'INFRASTRUCTURE',
        sourceSystem: 'CDN',
        confidence: 85,
        reasoning: `CDN/static delivery error`,
      };
    }
  }

  // Check Backend API patterns
  for (const pattern of BACKEND_URL_PATTERNS) {
    if (pattern.test(lowerUrl)) {
      // Determine specific backend system
      let sourceSystem: Classification['sourceSystem'] = 'GOKWIK_BE';
      if (/gokwik/i.test(lowerUrl)) {
        sourceSystem = 'GOKWIK_BE';
      } else if (/shopify|myshopify/i.test(lowerUrl)) {
        sourceSystem = 'SHOPIFY';
      }

      return {
        domain: 'BACKEND',
        sourceSystem,
        confidence: 90,
        reasoning: `API endpoint error: ${statusCode >= 500 ? 'Server error' : 'Client/request error'} on ${url.split('/').slice(0, 4).join('/')}`,
      };
    }
  }

  // Check for 5xx errors (always backend)
  if (statusCode >= 500) {
    return {
      domain: 'BACKEND',
      sourceSystem: 'GOKWIK_BE',
      confidence: 95,
      reasoning: `HTTP ${statusCode} server error indicates backend issue`,
    };
  }

  // Check CORS errors (backend configuration)
  if (lowerError.includes('cors') || lowerError.includes('cross-origin')) {
    return {
      domain: 'BACKEND',
      sourceSystem: 'GOKWIK_BE',
      confidence: 90,
      reasoning: `CORS error - backend needs to allow cross-origin requests`,
    };
  }

  // Check frontend resources
  for (const pattern of FRONTEND_RESOURCE_PATTERNS) {
    if (pattern.test(lowerUrl)) {
      return {
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        confidence: 85,
        reasoning: `Frontend resource failed to load: ${url.split('/').pop()?.split('?')[0]}`,
      };
    }
  }

  // 4xx on API-like paths
  if (statusCode >= 400 && statusCode < 500) {
    if (/\/(api|graphql|cart|checkout|order|payment)/i.test(lowerUrl)) {
      return {
        domain: 'BACKEND',
        sourceSystem: 'GOKWIK_BE',
        confidence: 80,
        reasoning: `HTTP ${statusCode} on API endpoint - likely backend validation or auth issue`,
      };
    }
  }

  // Default: check URL structure
  if (/\.(js|css|png|jpg|svg|woff|ttf)(\?|$)/i.test(lowerUrl)) {
    return {
      domain: 'FRONTEND',
      sourceSystem: 'STOREFRONT_FE',
      confidence: 70,
      reasoning: `Static asset error`,
    };
  }

  return {
    domain: 'UNKNOWN',
    sourceSystem: undefined,
    confidence: 50,
    reasoning: `Unable to determine domain from URL pattern`,
  };
}

function classifyConsoleErrorDomain(error: ConsoleError): DomainMatch {
  const { text, stackTrace } = error;
  const lowerText = text.toLowerCase();
  const lowerStack = (stackTrace || '').toLowerCase();
  const combined = `${lowerText} ${lowerStack}`;

  // Check for backend-related errors first
  for (const pattern of BE_CONSOLE_PATTERNS) {
    if (pattern.test(combined)) {
      // Check if it's a CORS issue (backend config)
      if (/cors|cross-origin|preflight/i.test(combined)) {
        return {
          domain: 'BACKEND',
          sourceSystem: 'GOKWIK_BE',
          confidence: 90,
          reasoning: `CORS/cross-origin error - backend configuration issue`,
        };
      }

      // Check for specific API failures
      if (/api|fetch|network|graphql/i.test(combined)) {
        return {
          domain: 'BACKEND',
          sourceSystem: 'GOKWIK_BE',
          confidence: 85,
          reasoning: `API/Network error in console - backend service issue`,
        };
      }
    }
  }

  // Check for frontend errors
  for (const pattern of FE_CONSOLE_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        confidence: 90,
        reasoning: `JavaScript runtime error - frontend code issue`,
      };
    }
  }

  // Check stack trace for clues
  if (lowerStack) {
    if (/node_modules\/(react|next|vue|angular)/i.test(lowerStack)) {
      return {
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        confidence: 85,
        reasoning: `Error in frontend framework`,
      };
    }

    if (/webpack|bundle|chunk/i.test(lowerStack)) {
      return {
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        confidence: 85,
        reasoning: `Build/bundling related error`,
      };
    }
  }

  // Payment gateway errors in console
  for (const pattern of PAYMENT_GATEWAY_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        domain: 'THIRD_PARTY',
        sourceSystem: 'PAYMENT_GATEWAY',
        confidence: 85,
        reasoning: `Payment gateway SDK error`,
      };
    }
  }

  // Analytics errors
  for (const pattern of ANALYTICS_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        domain: 'THIRD_PARTY',
        sourceSystem: 'ANALYTICS',
        confidence: 80,
        reasoning: `Analytics/tracking script error - usually non-critical`,
      };
    }
  }

  // Default to frontend for console errors
  return {
    domain: 'FRONTEND',
    sourceSystem: 'STOREFRONT_FE',
    confidence: 60,
    reasoning: `Console error - likely frontend issue`,
  };
}

// ============================================================================
// Main Classification Functions
// ============================================================================

export function classifyErrors(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[]
): Classification[] {
  const classifications: Classification[] = [];

  // Process network errors
  networkErrors.forEach((error) => {
    const scores = classifyNetworkError(error);
    const domainMatch = classifyNetworkErrorDomain(error);
    const classification = resolveClassification(scores, 'network', domainMatch);
    classifications.push(classification);
  });

  // Process console errors
  consoleErrors.forEach((error) => {
    const scores = classifyConsoleError(error);
    const domainMatch = classifyConsoleErrorDomain(error);
    const classification = resolveClassification(scores, 'console', domainMatch);
    classifications.push(classification);
  });

  return classifications;
}

function classifyNetworkError(error: NetworkError): RuleScore[] {
  const scores: RuleScore[] = [];
  const { statusCode, statusText, errorMessage, url } = error;

  // HTTP 4xx errors
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    scores.push({
      category: 'network_4xx',
      score: 10,
      confidence: 0.95,
    });
  }

  // HTTP 5xx errors
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    scores.push({
      category: 'network_5xx',
      score: 15,
      confidence: 0.95,
    });
  }

  // Timeout or failed requests
  if (
    (errorMessage && errorMessage.toLowerCase().includes('timeout')) ||
    (errorMessage && errorMessage.toLowerCase().includes('failed')) ||
    statusText?.toLowerCase().includes('timeout')
  ) {
    scores.push({
      category: 'network_timeout',
      score: 14,
      confidence: 0.9,
    });
  }

  // CORS errors
  if (errorMessage && errorMessage.toLowerCase().includes('cors')) {
    scores.push({
      category: 'network_cors',
      score: 15,
      confidence: 0.92,
    });
  }

  // Resource 404s
  if (statusCode === 404) {
    if (url) {
      if (
        url.endsWith('.js') ||
        url.includes('.chunk.js') ||
        (errorMessage && errorMessage.toLowerCase().includes('chunk'))
      ) {
        scores.push({
          category: 'resource_error',
          score: 12,
          confidence: 0.88,
        });
      } else if (url.endsWith('.css') || url.endsWith('.jpg') || url.endsWith('.png')) {
        scores.push({
          category: 'resource_error',
          score: 8,
          confidence: 0.85,
        });
      }
    }
  }

  return scores.length > 0
    ? scores
    : [{ category: 'network_4xx', score: 5, confidence: 0.5 }];
}

function classifyConsoleError(error: ConsoleError): RuleScore[] {
  const scores: RuleScore[] = [];
  const { text, type, stackTrace } = error;
  const lowerMessage = text.toLowerCase();

  // Hydration errors
  if (lowerMessage.includes('hydration')) {
    scores.push({
      category: 'hydration_error',
      score: 12,
      confidence: 0.9,
    });
  }

  // JS Runtime errors
  if (
    lowerMessage.includes('typeerror') ||
    lowerMessage.includes('referenceerror') ||
    lowerMessage.includes('syntaxerror')
  ) {
    scores.push({
      category: 'js_runtime_error',
      score: 14,
      confidence: 0.92,
    });
  }

  // Chunk load errors
  if (
    lowerMessage.includes('chunkloaderror') ||
    lowerMessage.includes('chunk failed')
  ) {
    scores.push({
      category: 'resource_error',
      score: 13,
      confidence: 0.9,
    });
  }

  // Console error level
  if (type === 'error') {
    scores.push({
      category: 'console_error',
      score: 10,
      confidence: 0.85,
    });
  }

  // Console warning level
  if (type === 'warning') {
    scores.push({
      category: 'console_warning',
      score: 4,
      confidence: 0.8,
    });
  }

  return scores.length > 0
    ? scores
    : [{ category: 'console_error', score: 5, confidence: 0.5 }];
}

function resolveClassification(
  scores: RuleScore[],
  source: 'network' | 'console',
  domainMatch: DomainMatch
): Classification {
  if (scores.length === 0) {
    return {
      category: 'console_error',
      severity: 'low',
      confidence: 0,
      reasoning: 'Default classification',
      suggestedOwner: 'Frontend Team',
      domain: 'UNKNOWN',
    };
  }

  // Calculate weighted score for each category
  const categoryScores: { [key in ErrorCategory]?: number } = {};
  const categoryConfidence: { [key in ErrorCategory]?: number } = {};

  scores.forEach(({ category, score, confidence }) => {
    categoryScores[category] = (categoryScores[category] || 0) + score;
    categoryConfidence[category] = Math.max(
      categoryConfidence[category] || 0,
      confidence
    );
  });

  // Find highest scoring category
  let topCategory: ErrorCategory = 'console_error';
  let topScore = 0;

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score > topScore) {
      topScore = score;
      topCategory = category as ErrorCategory;
    }
  }

  const finalConfidence = categoryConfidence[topCategory] || 0;
  const severity = SEVERITY_MAP[topCategory];

  // Adjust owner based on domain
  let suggestedOwner = OWNER_MAP[topCategory];
  if (domainMatch.domain === 'BACKEND') {
    suggestedOwner = 'Backend / API Team';
  } else if (domainMatch.domain === 'FRONTEND') {
    suggestedOwner = 'Frontend Team';
  } else if (domainMatch.domain === 'INFRASTRUCTURE') {
    suggestedOwner = 'DevOps / Infrastructure';
  } else if (domainMatch.domain === 'THIRD_PARTY') {
    suggestedOwner = 'Integration Team';
  }

  return {
    category: topCategory,
    severity,
    confidence: Math.round(finalConfidence * 100),
    reasoning: `Classified as ${topCategory}`,
    suggestedOwner,
    domain: domainMatch.domain,
    sourceSystem: domainMatch.sourceSystem,
    domainReasoning: domainMatch.reasoning,
  };
}

// ============================================================================
// Helper Functions for External Use
// ============================================================================

export function getDomainLabel(domain: IssueDomain): string {
  const labels: Record<IssueDomain, string> = {
    FRONTEND: '🎨 FE',
    BACKEND: '⚙️ BE',
    INFRASTRUCTURE: '🏗️ INFRA',
    THIRD_PARTY: '🔌 3RD PARTY',
    PAYMENT: '💳 PAYMENT',
    CDN: '🌐 CDN',
    SDK: '📦 SDK',
    SHOPIFY: '🛍️ SHOPIFY',
    UNKNOWN: '❓ UNKNOWN',
  };
  return labels[domain] || '❓ UNKNOWN';
}

export function getDomainEmoji(domain: IssueDomain): string {
  const emojis: Record<IssueDomain, string> = {
    FRONTEND: '🎨',
    BACKEND: '⚙️',
    INFRASTRUCTURE: '🏗️',
    THIRD_PARTY: '🔌',
    PAYMENT: '💳',
    CDN: '🌐',
    SDK: '📦',
    SHOPIFY: '🛍️',
    UNKNOWN: '❓',
  };
  return emojis[domain] || '❓';
}

export function getDomainColor(domain: IssueDomain): string {
  const colors: Record<IssueDomain, string> = {
    FRONTEND: '#61dafb',  // React blue
    BACKEND: '#68d391',   // Green
    INFRASTRUCTURE: '#f6ad55', // Orange
    THIRD_PARTY: '#a78bfa',  // Purple
    PAYMENT: '#f56565',   // Red
    CDN: '#4fd1c5',       // Teal
    SDK: '#ed8936',       // Orange
    SHOPIFY: '#95bf47',   // Shopify green
    UNKNOWN: '#a0aec0',   // Gray
  };
  return colors[domain] || '#a0aec0';
}
