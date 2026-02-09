/**
 * Analytics Event Tracker
 * Captures Meta Pixel, GA4, and Google Ads events via Playwright network interception.
 * Based on patterns from analytics-sanity-suite.
 */

import { Page, Request as PlaywrightRequest } from 'playwright';

export interface CapturedEvent {
  platform: 'meta' | 'ga4' | 'google_ads';
  eventName: string;
  params: Record<string, string>;
  rawUrl: string;
  timestamp: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface EventTrackingResult {
  meta: {
    events: CapturedEvent[];
    failures: CapturedEvent[];
    expectedEvents: string[];
    missingEvents: string[];
  };
  ga4: {
    events: CapturedEvent[];
    failures: CapturedEvent[];
    expectedEvents: string[];
    missingEvents: string[];
  };
  googleAds: {
    events: CapturedEvent[];
    failures: CapturedEvent[];
  };
}

// Expected events per flow stage
export const EXPECTED_EVENTS = {
  homepage: {
    meta: ['PageView'],
    ga4: ['page_view'],
  },
  product_page: {
    meta: ['PageView', 'ViewContent'],
    ga4: ['page_view', 'view_item', 'viewed_product'],
  },
  add_to_cart: {
    meta: ['AddToCart'],
    ga4: ['add_to_cart'],
  },
  cart: {
    meta: ['ViewCart'],
    ga4: ['view_cart'],
  },
  checkout_init: {
    meta: ['InitiateCheckout'],
    ga4: ['begin_checkout', 'gokwik_checkout_initiated'],
  },
  payment: {
    meta: ['AddPaymentInfo'],
    ga4: ['add_payment_info'],
  },
  purchase: {
    meta: ['Purchase'],
    ga4: ['purchase'],
  },
};

/**
 * Unified Analytics Event Tracker
 * Intercepts network requests for Meta Pixel, GA4, and Google Ads
 */
export class AnalyticsEventTracker {
  private page: Page;
  private captured: CapturedEvent[] = [];
  private listening: boolean = false;
  private handler: ((request: PlaywrightRequest) => void) | null = null;
  private responseHandler: ((response: any) => void) | null = null;
  private requestFailedHandler: ((request: PlaywrightRequest) => void) | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Start tracking analytics events
   */
  startTracking(): void {
    if (this.listening) return;
    this.listening = true;

    this.handler = (request: PlaywrightRequest) => this.onRequest(request);
    this.requestFailedHandler = (request: PlaywrightRequest) => this.onRequestFailed(request);

    this.page.on('request', this.handler);
    this.page.on('requestfailed', this.requestFailedHandler);
  }

  /**
   * Stop tracking and detach listeners
   */
  stopTracking(): void {
    if (!this.listening) return;

    if (this.handler) {
      this.page.off('request', this.handler);
    }
    if (this.requestFailedHandler) {
      this.page.off('requestfailed', this.requestFailedHandler);
    }

    this.listening = false;
  }

  /**
   * Clear captured events
   */
  reset(): void {
    this.captured = [];
  }

  /**
   * Get all captured events
   */
  get events(): CapturedEvent[] {
    return [...this.captured];
  }

  /**
   * Get events by platform
   */
  getEventsByPlatform(platform: 'meta' | 'ga4' | 'google_ads'): CapturedEvent[] {
    return this.captured.filter((e) => e.platform === platform);
  }

  /**
   * Get failed events
   */
  getFailedEvents(): CapturedEvent[] {
    return this.captured.filter((e) => e.status === 'failed');
  }

  /**
   * Get event names by platform
   */
  getEventNames(platform: 'meta' | 'ga4' | 'google_ads'): string[] {
    return this.getEventsByPlatform(platform).map((e) => e.eventName);
  }

  /**
   * Find events by name and platform
   */
  findEvents(platform: 'meta' | 'ga4' | 'google_ads', eventName: string): CapturedEvent[] {
    return this.captured.filter(
      (e) => e.platform === platform && e.eventName === eventName
    );
  }

  /**
   * Check if an event was captured
   */
  hasEvent(platform: 'meta' | 'ga4' | 'google_ads', eventName: string): boolean {
    return this.findEvents(platform, eventName).length > 0;
  }

  /**
   * Generate tracking result with missing events analysis
   */
  generateResult(flowStage?: keyof typeof EXPECTED_EVENTS): EventTrackingResult {
    const metaEvents = this.getEventsByPlatform('meta');
    const ga4Events = this.getEventsByPlatform('ga4');
    const googleAdsEvents = this.getEventsByPlatform('google_ads');

    const metaEventNames = metaEvents.map((e) => e.eventName);
    const ga4EventNames = ga4Events.map((e) => e.eventName);

    let expectedMeta: string[] = [];
    let expectedGa4: string[] = [];

    if (flowStage && EXPECTED_EVENTS[flowStage]) {
      expectedMeta = EXPECTED_EVENTS[flowStage].meta;
      expectedGa4 = EXPECTED_EVENTS[flowStage].ga4;
    }

    // Find missing events (expected but not captured)
    const missingMeta = expectedMeta.filter((e) => !metaEventNames.includes(e));
    const missingGa4 = expectedGa4.filter(
      (e) => !ga4EventNames.includes(e) && !ga4EventNames.some((captured) => captured.includes(e))
    );

    return {
      meta: {
        events: metaEvents.filter((e) => e.status === 'success'),
        failures: metaEvents.filter((e) => e.status === 'failed'),
        expectedEvents: expectedMeta,
        missingEvents: missingMeta,
      },
      ga4: {
        events: ga4Events.filter((e) => e.status === 'success'),
        failures: ga4Events.filter((e) => e.status === 'failed'),
        expectedEvents: expectedGa4,
        missingEvents: missingGa4,
      },
      googleAds: {
        events: googleAdsEvents.filter((e) => e.status === 'success'),
        failures: googleAdsEvents.filter((e) => e.status === 'failed'),
      },
    };
  }

  // ──────────────────────────────────────────────
  // Internal handlers
  // ──────────────────────────────────────────────

  private onRequest(request: PlaywrightRequest): void {
    const url = request.url();

    // Check Meta Pixel
    if (this.isMetaPixelRequest(url)) {
      const params = this.parseParams(url);
      if (params.ev) {
        this.captured.push({
          platform: 'meta',
          eventName: params.ev,
          params,
          rawUrl: this.redactUrl(url, 'meta'),
          timestamp: Date.now(),
          status: 'success',
        });
      }
      return;
    }

    // Check GA4
    if (this.isGA4Request(url)) {
      const params = this.parseParams(url);
      if (params.en) {
        this.captured.push({
          platform: 'ga4',
          eventName: params.en,
          params,
          rawUrl: this.redactUrl(url, 'ga4'),
          timestamp: Date.now(),
          status: 'success',
        });
      }
      return;
    }

    // Check Google Ads
    if (this.isGoogleAdsRequest(url)) {
      const params = this.parseParams(url);
      const eventName = params.label || params.awcid || 'conversion';
      this.captured.push({
        platform: 'google_ads',
        eventName,
        params,
        rawUrl: this.redactUrl(url, 'google_ads'),
        timestamp: Date.now(),
        status: 'success',
      });
      return;
    }
  }

  private onRequestFailed(request: PlaywrightRequest): void {
    const url = request.url();
    const failure = request.failure();
    const errorMessage = failure?.errorText || 'Unknown error';

    // Check if it's an analytics request that failed
    if (this.isMetaPixelRequest(url)) {
      const params = this.parseParams(url);
      this.captured.push({
        platform: 'meta',
        eventName: params.ev || 'unknown',
        params,
        rawUrl: this.redactUrl(url, 'meta'),
        timestamp: Date.now(),
        status: 'failed',
        errorMessage,
      });
      return;
    }

    if (this.isGA4Request(url)) {
      const params = this.parseParams(url);
      this.captured.push({
        platform: 'ga4',
        eventName: params.en || 'unknown',
        params,
        rawUrl: this.redactUrl(url, 'ga4'),
        timestamp: Date.now(),
        status: 'failed',
        errorMessage,
      });
      return;
    }

    if (this.isGoogleAdsRequest(url)) {
      const params = this.parseParams(url);
      this.captured.push({
        platform: 'google_ads',
        eventName: params.label || 'conversion',
        params,
        rawUrl: this.redactUrl(url, 'google_ads'),
        timestamp: Date.now(),
        status: 'failed',
        errorMessage,
      });
      return;
    }
  }

  // ──────────────────────────────────────────────
  // Request type detection
  // ──────────────────────────────────────────────

  private isMetaPixelRequest(url: string): boolean {
    return url.includes('facebook.com/tr') || url.includes('connect.facebook.net');
  }

  private isGA4Request(url: string): boolean {
    return (
      url.includes('google-analytics.com/g/collect') ||
      url.includes('analytics.google.com/g/collect') ||
      url.includes('google.com/ccm/collect')
    );
  }

  private isGoogleAdsRequest(url: string): boolean {
    return (
      url.includes('googleads.g.doubleclick.net') ||
      url.includes('pagead/conversion') ||
      url.includes('googleadservices.com/pagead')
    );
  }

  // ──────────────────────────────────────────────
  // URL parsing utilities
  // ──────────────────────────────────────────────

  private parseParams(url: string): Record<string, string> {
    try {
      const parsed = new URL(url);
      const params: Record<string, string> = {};
      for (const [key, value] of parsed.searchParams.entries()) {
        params[key] = value;
      }
      return params;
    } catch {
      return {};
    }
  }

  private redactUrl(url: string, platform: 'meta' | 'ga4' | 'google_ads'): string {
    try {
      const parsed = new URL(url);
      const safeKeys = this.getSafeKeys(platform);

      for (const key of [...parsed.searchParams.keys()]) {
        if (!safeKeys.has(key)) {
          parsed.searchParams.set(key, '[REDACTED]');
        }
      }
      return parsed.toString();
    } catch {
      return '[UNPARSABLE_URL]';
    }
  }

  private getSafeKeys(platform: 'meta' | 'ga4' | 'google_ads'): Set<string> {
    switch (platform) {
      case 'meta':
        return new Set(['ev', 'dl', 'id', 'content_ids', 'value', 'currency', 'content_type']);
      case 'ga4':
        return new Set(['en', 'dl', 'tid', 'dt', 'ep.page_type']);
      case 'google_ads':
        return new Set(['label', 'value', 'currency', 'aw_remarketing_only']);
      default:
        return new Set();
    }
  }
}

/**
 * Analytics error types for classification
 */
export interface AnalyticsError {
  type: 'missing_event' | 'failed_request' | 'pixel_not_loaded';
  platform: 'meta' | 'ga4' | 'google_ads';
  eventName?: string;
  flowStage?: string;
  errorMessage?: string;
  url?: string;
}

/**
 * Analyze tracking results and return errors
 */
export function analyzeTrackingResults(
  result: EventTrackingResult,
  flowStage?: string
): AnalyticsError[] {
  const errors: AnalyticsError[] = [];

  // Check for missing Meta events
  for (const missing of result.meta.missingEvents) {
    errors.push({
      type: 'missing_event',
      platform: 'meta',
      eventName: missing,
      flowStage,
      errorMessage: `Meta Pixel event "${missing}" was not fired during ${flowStage || 'scan'}`,
    });
  }

  // Check for missing GA4 events
  for (const missing of result.ga4.missingEvents) {
    errors.push({
      type: 'missing_event',
      platform: 'ga4',
      eventName: missing,
      flowStage,
      errorMessage: `GA4 event "${missing}" was not fired during ${flowStage || 'scan'}`,
    });
  }

  // Check for failed Meta requests
  for (const failure of result.meta.failures) {
    errors.push({
      type: 'failed_request',
      platform: 'meta',
      eventName: failure.eventName,
      errorMessage: failure.errorMessage,
      url: failure.rawUrl,
    });
  }

  // Check for failed GA4 requests
  for (const failure of result.ga4.failures) {
    errors.push({
      type: 'failed_request',
      platform: 'ga4',
      eventName: failure.eventName,
      errorMessage: failure.errorMessage,
      url: failure.rawUrl,
    });
  }

  // Check for failed Google Ads requests
  for (const failure of result.googleAds.failures) {
    errors.push({
      type: 'failed_request',
      platform: 'google_ads',
      eventName: failure.eventName,
      errorMessage: failure.errorMessage,
      url: failure.rawUrl,
    });
  }

  return errors;
}
