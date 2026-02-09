// Enhanced ErrorCategory with GoKwik e-commerce specific types
export type ErrorCategory =
  // Network errors
  | 'network_4xx'
  | 'network_5xx'
  | 'network_timeout'
  | 'network_cors'
  // Console/JS errors
  | 'console_error'
  | 'console_warning'
  | 'js_runtime_error'
  | 'resource_error'
  | 'visual_issue'
  | 'hydration_error'
  | 'rendering_issue'
  // GoKwik/E-commerce specific
  | 'payment_error'
  | 'checkout_error'
  | 'cart_error'
  | 'auth_error'
  | 'sdk_load_error'
  | 'third_party_error'
  | 'cdn_error'
  | 'api_schema_error'
  | 'performance_degradation'
  | 'security_error'
  | 'seo_error'
  | 'websocket_error'
  // Shopify-specific
  | 'shopify_api_error'
  | 'shopify_theme_error'
  | 'shopify_app_error'
  | 'shopify_rate_limit'
  | 'shopify_checkout_error'
  // Analytics/Tracking errors
  | 'analytics_meta_missing'
  | 'analytics_meta_failed'
  | 'analytics_ga4_missing'
  | 'analytics_ga4_failed'
  | 'analytics_google_ads_failed'
  | 'analytics_pixel_not_loaded'
  // Next.js SSR/SSG errors
  | 'nextjs_ssr_error'
  | 'nextjs_routing_error'
  | 'nextjs_build_error'
  // Web Vitals performance errors
  | 'web_vitals_lcp'
  | 'web_vitals_cls'
  | 'web_vitals_fid'
  | 'web_vitals_inp'
  | 'web_vitals_ttfb'
  // Additional Shopify purchase funnel errors
  | 'shopify_inventory_error'
  | 'shopify_discount_error'
  | 'shopify_shipping_error'
  | 'shopify_webhook_error'
  | 'unknown';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Enhanced domain classification
export type IssueDomain =
  | 'FRONTEND'
  | 'BACKEND'
  | 'PAYMENT'
  | 'THIRD_PARTY'
  | 'CDN'
  | 'SDK'
  | 'SHOPIFY'
  | 'INFRASTRUCTURE'
  | 'UNKNOWN';

// Which user journey is impacted
export type AffectedFlow =
  | 'checkout'
  | 'cart'
  | 'browse'
  | 'login'
  | 'search'
  | 'product_page'
  | 'homepage'
  | 'payment'
  | 'order_tracking'
  | 'unknown';

export type Environment = 'production' | 'staging';

export type BackendType = 'shopify_gokwik' | 'custom_gokwik' | 'shopify_only';

// Source system for better routing
export type SourceSystem =
  | 'SHOPIFY'
  | 'GOKWIK_BE'
  | 'STOREFRONT_FE'
  | 'THIRD_PARTY'
  | 'PAYMENT_GATEWAY'
  | 'CDN'
  | 'ANALYTICS'
  | 'KWIKPASS'
  | 'KWIKCHECKOUT';

export interface NetworkError {
  url: string;
  method: string;
  statusCode: number;
  statusText: string;
  responseTime: number;
  requestHeaders?: Record<string, string>;
  responseBody?: string;
  errorMessage?: string;
  resourceType: string;
}

export interface ConsoleError {
  type: 'error' | 'warning' | 'log' | 'info';
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: string;
  timestamp: number;
}

export interface VisualIssue {
  description: string;
  screenshotPath: string;
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  elementSelector?: string;
}

// Analytics event tracking
export interface AnalyticsEvent {
  platform: 'meta' | 'ga4' | 'google_ads';
  eventName: string;
  params: Record<string, string>;
  timestamp: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface AnalyticsError {
  type: 'missing_event' | 'failed_request' | 'pixel_not_loaded';
  platform: 'meta' | 'ga4' | 'google_ads';
  eventName?: string;
  flowStage?: string;
  errorMessage?: string;
  url?: string;
}

export interface AnalyticsTrackingResult {
  meta: {
    events: AnalyticsEvent[];
    failures: AnalyticsEvent[];
    expectedEvents: string[];
    missingEvents: string[];
  };
  ga4: {
    events: AnalyticsEvent[];
    failures: AnalyticsEvent[];
    expectedEvents: string[];
    missingEvents: string[];
  };
  googleAds: {
    events: AnalyticsEvent[];
    failures: AnalyticsEvent[];
  };
  errors: AnalyticsError[];
}

export interface ScanResult {
  scanId: string;
  siteUrl: string;
  siteName: string;
  environment: Environment;
  backendType: BackendType;
  timestamp: string;
  duration: number;
  pagesScanned: string[];
  networkErrors: NetworkError[];
  consoleErrors: ConsoleError[];
  visualIssues: VisualIssue[];
  screenshotPaths: string[];
  pageMetrics: {
    loadTime: number;
    domContentLoaded: number;
    totalRequests: number;
    failedRequests: number;
    totalResources: number;
    failedResources: number;
  };
  // Analytics tracking results
  analyticsTracking?: AnalyticsTrackingResult;
}

export interface Classification {
  category: ErrorCategory;
  severity: Severity;
  confidence: number;  // 0-100
  reasoning: string;
  suggestedOwner: string;
  domain: IssueDomain;
  sourceSystem?: SourceSystem;
  domainReasoning?: string;
  affectedFlow?: AffectedFlow;
  suggestedFix?: string;
  isConversionBlocking?: boolean;
}

export interface KnowledgeBaseMatch {
  matchId: string;
  patternId: string;
  patternName: string;
  similarity: number;  // 0-100
  previousOccurrences: number;
  lastSeen: string;
  knownResolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export type SlackStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface Incident {
  incidentId: string;
  scanId: string;
  siteName: string;
  siteUrl: string;
  environment: Environment;
  timestamp: string;

  // What was found
  errorSummary: string;
  errorDetail: string;
  affectedPage: string;

  // Raw signals
  networkErrors: NetworkError[];
  consoleErrors: ConsoleError[];
  visualIssues: VisualIssue[];
  screenshotPath?: string;

  // Classification
  classification: Classification;
  impactScore: number;  // 0-100

  // Knowledge base
  kbMatch?: KnowledgeBaseMatch;
  suggestedFix?: string;

  // Enhanced fields for GoKwik
  domain?: IssueDomain;
  affectedFlow?: AffectedFlow;
  rootCause?: string;
  fixVerification?: string;  // How to verify the fix worked
  relatedIncidentIds?: string[];  // Errors that appear together
  customerImpactEstimate?: string;  // e.g., "~500 users affected"
  isConversionBlocking?: boolean;

  // Lifecycle
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;

  // Slack notification
  slackMessageTs?: string;
  slackChannel?: string;
  slackStatus?: SlackStatus;
  slackError?: string;
  slackMessageUrl?: string;
}

export interface SiteConfig {
  name: string;
  url: string;
  environment: Environment;
  backend_type: BackendType;
  scan_flows: string[];
  alert_channel: string;
  severity_threshold?: Severity;
}

export interface AgentConfig {
  sites: SiteConfig[];
  scan_settings: {
    scheduled_interval_minutes: number;
    screenshot_on_error: boolean;
    viewport: { width: number; height: number };
    mobile_viewport: { width: number; height: number };
    timeout_ms: number;
    max_retries: number;
  };
}
