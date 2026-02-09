import {
  chromium,
  Browser,
  Page,
  BrowserContext,
  Response,
  Request as PlaywrightRequest,
} from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ScanResult,
  NetworkError,
  ConsoleError,
  SiteConfig,
  Environment,
  BackendType,
  AnalyticsTrackingResult,
  AnalyticsError,
} from '../models/incident';
import {
  AnalyticsEventTracker,
  analyzeTrackingResults,
  EXPECTED_EVENTS,
} from './analytics';
import {
  DEFAULT_FLOWS,
  ScanFlow,
  FlowStep,
  executeFlow,
} from './flows/default-flows';
import {
  getMerchantFlows,
  hasMerchantFlows,
} from './flows/merchant-flows';

interface ScannerConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  screenshotDir?: string;
  captureResponseBodies?: boolean;
  responsBodyMaxLength?: number;
}

interface PageMetrics {
  loadTime: number;
  domContentLoaded: number;
  totalRequests: number;
  failedRequests: number;
  totalResources: number;
  failedResources: number;
}

interface RequestMetadata {
  startTime: number;
  responseTime?: number;
  statusCode?: number;
  statusText?: string;
  resourceType?: string;
  errorMessage?: string;
  responseBody?: string;
}

/**
 * Playwright-based scanner for e-commerce storefronts
 * Captures network errors, console messages, and screenshots
 */
export class PlaywrightScanner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: Required<ScannerConfig>;
  private requestMetadata: Map<string, RequestMetadata> = new Map();
  private networkErrors: NetworkError[] = [];
  private consoleErrors: ConsoleError[] = [];
  private screenshotPaths: string[] = [];
  private startTime: number = 0;
  private navigationStartTime: number = 0;
  private domContentLoadedTime: number = 0;
  private pageLoadTime: number = 0;
  private analyticsTracker: AnalyticsEventTracker | null = null;
  private analyticsResult: AnalyticsTrackingResult | null = null;

  constructor(config?: ScannerConfig) {
    this.config = {
      headless: config?.headless ?? true,
      viewport: config?.viewport ?? { width: 1440, height: 900 },
      timeout: config?.timeout ?? 30000,
      screenshotDir: config?.screenshotDir ?? './screenshots',
      captureResponseBodies: config?.captureResponseBodies ?? true,
      responsBodyMaxLength: config?.responsBodyMaxLength ?? 500,
    };

    this.ensureScreenshotDir();
  }

  /**
   * Initialize the Playwright browser instance
   */
  async initialize(): Promise<void> {
    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
      });
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error}`);
    }
  }

  /**
   * Close the browser and cleanup
   */
  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Create a new browser context with page listeners
   */
  private async createContext(): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      ignoreHTTPSErrors: false,
    });

    const page = await this.context.newPage();
    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    // Setup page listeners
    this.setupPageListeners(page);

    // Setup analytics event tracking
    this.analyticsTracker = new AnalyticsEventTracker(page);
    this.analyticsTracker.startTracking();
    console.log('Analytics event tracking started (Meta, GA4, Google Ads)');

    return page;
  }

  /**
   * Setup all listeners on a page for capturing data
   */
  private setupPageListeners(page: Page): void {
    // Capture console messages
    page.on('console', (msg) => {
      const consoleError: ConsoleError = {
        type: msg.type() as any,
        text: msg.text(),
        url: msg.location().url || undefined,
        lineNumber: msg.location().lineNumber || undefined,
        columnNumber: msg.location().columnNumber || undefined,
        stackTrace: msg.location().url ? `${msg.location().url}:${msg.location().lineNumber}` : undefined,
        timestamp: Date.now(),
      };
      this.consoleErrors.push(consoleError);
    });

    // Capture page crashes
    page.on('pageerror', (error) => {
      const consoleError: ConsoleError = {
        type: 'error',
        text: error.message || 'Unknown page error',
        stackTrace: error.stack,
        timestamp: Date.now(),
      };
      this.consoleErrors.push(consoleError);
    });

    // Capture request metrics
    page.on('request', (request: PlaywrightRequest) => {
      const url = request.url();
      const metadata: RequestMetadata = {
        startTime: Date.now(),
        resourceType: request.resourceType(),
      };
      this.requestMetadata.set(url, metadata);
    });

    // Capture responses
    page.on('response', async (response: Response) => {
      const url = response.url();
      const metadata = this.requestMetadata.get(url) || {
        startTime: Date.now(),
      };

      metadata.responseTime = Date.now() - metadata.startTime;
      metadata.statusCode = response.status();
      metadata.statusText = response.statusText();
      metadata.resourceType = response.request().resourceType();

      // Capture response bodies for failed requests
      if (
        this.config.captureResponseBodies &&
        response.status() >= 400
      ) {
        try {
          const contentType = response.headers()['content-type'] || '';
          // Only capture JSON and text responses
          if (
            contentType.includes('application/json') ||
            contentType.includes('text/')
          ) {
            const body = await response.text().catch(() => '');
            if (body) {
              metadata.responseBody = body.substring(
                0,
                this.config.responsBodyMaxLength
              );
            }
          }
        } catch {
          // Silently ignore response body capture errors
        }
      }

      this.requestMetadata.set(url, metadata);

      // Track network errors (4xx and 5xx)
      if (response.status() >= 400) {
        const networkError: NetworkError = {
          url,
          method: response.request().method(),
          statusCode: response.status(),
          statusText: response.statusText(),
          responseTime: metadata.responseTime || 0,
          resourceType: metadata.resourceType || 'unknown',
          responseBody: metadata.responseBody,
        };
        this.networkErrors.push(networkError);
      }
    });

    // Capture failed requests
    page.on('requestfailed', (request: PlaywrightRequest) => {
      const metadata = this.requestMetadata.get(request.url()) || {
        startTime: Date.now(),
      };

      metadata.responseTime = Date.now() - metadata.startTime;
      metadata.resourceType = request.resourceType();
      metadata.errorMessage = request.failure()?.errorText || 'Unknown error';

      this.requestMetadata.set(request.url(), metadata);

      const networkError: NetworkError = {
        url: request.url(),
        method: request.method(),
        statusCode: 0,
        statusText: 'Request Failed',
        responseTime: metadata.responseTime,
        resourceType: metadata.resourceType || 'unknown',
        errorMessage: metadata.errorMessage,
      };
      this.networkErrors.push(networkError);
    });

    // Track navigation timing
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.navigationStartTime = Date.now();
      }
    });

    // Capture DOMContentLoaded
    page.on('load', () => {
      this.domContentLoadedTime = Date.now() - this.navigationStartTime;
    });
  }

  /**
   * Navigate to a URL and wait for page to load
   */
  private async navigateToPage(page: Page, url: string): Promise<void> {
    this.navigationStartTime = Date.now();
    this.requestMetadata.clear();

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout,
      });
      this.pageLoadTime = Date.now() - this.navigationStartTime;
    } catch (error) {
      // Network idle timeout is acceptable for some sites
      if (error instanceof Error && error.message.includes('Timeout')) {
        this.pageLoadTime = this.config.timeout;
      } else {
        throw error;
      }
    }
  }

  /**
   * Take a screenshot of the current page
   */
  private async takeScreenshot(
    page: Page,
    siteName: string,
    flowName: string
  ): Promise<string> {
    const timestamp = Date.now();
    const filename = `${siteName}_${timestamp}_${flowName}.png`;
    const filepath = path.join(this.config.screenshotDir, filename);

    try {
      await page.screenshot({
        path: filepath,
        fullPage: true,
      });
      this.screenshotPaths.push(filepath);
      return filepath;
    } catch (error) {
      console.error(`Failed to take screenshot: ${error}`);
      return '';
    }
  }

  /**
   * Execute a scan flow on a page
   */
  private async executeFlowOnPage(
    page: Page,
    flow: ScanFlow,
    siteUrl: string
  ): Promise<void> {
    try {
      await executeFlow(page, flow, siteUrl);
    } catch (error) {
      console.warn(`Flow execution warning: ${error}`);
      // Continue with screenshot even if flow fails
    }
  }

  /**
   * Scan a single page with a flow
   */
  private async scanPage(
    page: Page,
    siteName: string,
    siteUrl: string,
    flow: ScanFlow
  ): Promise<string> {
    // Navigate to the site
    await this.navigateToPage(page, siteUrl);

    // Execute the flow
    await this.executeFlowOnPage(page, flow, siteUrl);

    // Take screenshot
    const screenshotPath = await this.takeScreenshot(page, siteName, flow.name);

    return screenshotPath;
  }

  /**
   * Calculate page metrics from collected data
   */
  private calculatePageMetrics(): PageMetrics {
    const requests = Array.from(this.requestMetadata.values());
    const failedRequests = requests.filter(
      (r) => (r.statusCode && r.statusCode >= 400) || r.errorMessage
    );

    return {
      loadTime: this.pageLoadTime,
      domContentLoaded: this.domContentLoadedTime,
      totalRequests: requests.length,
      failedRequests: failedRequests.length,
      totalResources: requests.length,
      failedResources: failedRequests.length,
    };
  }

  /**
   * Scan a site with multiple flows
   */
  async scanSite(
    siteConfig: SiteConfig,
    flows?: ScanFlow[]
  ): Promise<ScanResult> {
    const scanStartTime = Date.now();
    this.startTime = scanStartTime;

    // Reset state for new scan
    this.networkErrors = [];
    this.consoleErrors = [];
    this.screenshotPaths = [];
    this.requestMetadata.clear();
    this.analyticsResult = null;

    try {
      // Initialize browser if not already done
      if (!this.browser) {
        await this.initialize();
      }

      // Create new context and page
      const page = await this.createContext();

      // Determine which flows to use - prefer merchant-specific flows
      const flowsToExecute = flows || this.getFlowsForSite(siteConfig.name);

      // Execute each flow
      const pagesScanned: string[] = [];
      for (const flow of flowsToExecute) {
        try {
          await this.scanPage(page, siteConfig.name, siteConfig.url, flow);
          pagesScanned.push(flow.name);
        } catch (error) {
          console.error(`Error scanning flow ${flow.name}: ${error}`);
          // Take a screenshot on error
          await this.takeScreenshot(page, siteConfig.name, `${flow.name}_error`);
        }

        // Small delay between flows
        await page.waitForTimeout(500);
      }

      // Generate analytics tracking results before closing
      if (this.analyticsTracker) {
        const trackingResult = this.analyticsTracker.generateResult();
        const analyticsErrors = analyzeTrackingResults(trackingResult);

        this.analyticsResult = {
          meta: {
            events: trackingResult.meta.events.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
            failures: trackingResult.meta.failures.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
            expectedEvents: trackingResult.meta.expectedEvents,
            missingEvents: trackingResult.meta.missingEvents,
          },
          ga4: {
            events: trackingResult.ga4.events.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
            failures: trackingResult.ga4.failures.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
            expectedEvents: trackingResult.ga4.expectedEvents,
            missingEvents: trackingResult.ga4.missingEvents,
          },
          googleAds: {
            events: trackingResult.googleAds.events.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
            failures: trackingResult.googleAds.failures.map(e => ({
              platform: e.platform,
              eventName: e.eventName,
              params: e.params,
              timestamp: e.timestamp,
              status: e.status,
              errorMessage: e.errorMessage,
            })),
          },
          errors: analyticsErrors,
        };

        // Log analytics summary
        this.logAnalyticsSummary();

        // Stop tracking
        this.analyticsTracker.stopTracking();
        this.analyticsTracker = null;
      }

      // Close context
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      // Create scan result
      const scanDuration = Date.now() - scanStartTime;
      const scanResult: ScanResult = {
        scanId: uuidv4(),
        siteUrl: siteConfig.url,
        siteName: siteConfig.name,
        environment: siteConfig.environment,
        backendType: siteConfig.backend_type,
        timestamp: new Date().toISOString(),
        duration: scanDuration,
        pagesScanned,
        networkErrors: this.networkErrors,
        consoleErrors: this.consoleErrors,
        visualIssues: [],
        screenshotPaths: this.screenshotPaths,
        pageMetrics: this.calculatePageMetrics(),
        analyticsTracking: this.analyticsResult || undefined,
      };

      return scanResult;
    } catch (error) {
      throw new Error(`Failed to scan site ${siteConfig.name}: ${error}`);
    }
  }

  /**
   * Log analytics tracking summary
   */
  private logAnalyticsSummary(): void {
    if (!this.analyticsResult) return;

    const { meta, ga4, googleAds, errors } = this.analyticsResult;

    console.log('\n📊 Analytics Tracking Summary:');
    console.log(`   Meta Pixel: ${meta.events.length} events captured, ${meta.failures.length} failures`);
    if (meta.events.length > 0) {
      console.log(`      Events: ${meta.events.map(e => e.eventName).join(', ')}`);
    }

    console.log(`   GA4: ${ga4.events.length} events captured, ${ga4.failures.length} failures`);
    if (ga4.events.length > 0) {
      console.log(`      Events: ${ga4.events.map(e => e.eventName).join(', ')}`);
    }

    console.log(`   Google Ads: ${googleAds.events.length} events captured, ${googleAds.failures.length} failures`);

    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} analytics issues detected:`);
      for (const error of errors) {
        console.log(`      - [${error.platform}] ${error.type}: ${error.errorMessage}`);
      }
    }
  }

  /**
   * Get default flows for the scanner
   */
  private getDefaultFlows(): ScanFlow[] {
    return [
      DEFAULT_FLOWS.homepage,
      DEFAULT_FLOWS.product_page,
      DEFAULT_FLOWS.cart,
      DEFAULT_FLOWS.checkout_init,
    ];
  }

  /**
   * Get flows for a specific site - uses merchant-specific flows if available
   */
  private getFlowsForSite(siteName: string): ScanFlow[] {
    // Check if we have merchant-specific flows
    if (hasMerchantFlows(siteName)) {
      const merchantFlows = getMerchantFlows(siteName);
      console.log(`Using ${merchantFlows.length} merchant-specific flows for ${siteName}`);
      return merchantFlows;
    }

    // Fall back to default flows
    console.log(`Using default flows for ${siteName}`);
    return this.getDefaultFlows();
  }

  /**
   * Ensure screenshot directory exists
   */
  private ensureScreenshotDir(): void {
    if (!fs.existsSync(this.config.screenshotDir)) {
      fs.mkdirSync(this.config.screenshotDir, { recursive: true });
    }
  }

  /**
   * Scan multiple sites
   */
  async scanAllSites(siteConfigs: SiteConfig[]): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      await this.initialize();

      for (const siteConfig of siteConfigs) {
        try {
          const result = await this.scanSite(siteConfig);
          results.push(result);
        } catch (error) {
          console.error(
            `Error scanning site ${siteConfig.name}: ${error}`
          );
        }
      }

      return results;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Scan a single site URL (for CLI usage)
   */
  async scanSingleSite(
    url: string,
    siteName?: string,
    flows?: ScanFlow[]
  ): Promise<ScanResult> {
    const siteConfig: SiteConfig = {
      name: siteName || new URL(url).hostname,
      url,
      environment: 'production',
      backend_type: 'shopify_only',
      scan_flows: flows?.map((f) => f.name) || ['homepage', 'product_page'],
      alert_channel: '#debug-agent',
    };

    try {
      await this.initialize();
      return await this.scanSite(siteConfig, flows);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Get the current network errors collected
   */
  getNetworkErrors(): NetworkError[] {
    return this.networkErrors;
  }

  /**
   * Get the current console errors collected
   */
  getConsoleErrors(): ConsoleError[] {
    return this.consoleErrors;
  }

  /**
   * Get screenshot paths collected
   */
  getScreenshotPaths(): string[] {
    return this.screenshotPaths;
  }
}

/**
 * Helper function to create a scanner and scan a site
 */
export async function scanStorefront(
  siteConfig: SiteConfig,
  options?: ScannerConfig
): Promise<ScanResult> {
  const scanner = new PlaywrightScanner(options);
  try {
    return await scanner.scanSite(siteConfig);
  } finally {
    await scanner.cleanup();
  }
}

/**
 * Helper function to scan a single URL
 */
export async function scanUrl(
  url: string,
  siteName?: string,
  options?: ScannerConfig
): Promise<ScanResult> {
  const scanner = new PlaywrightScanner(options);
  try {
    return await scanner.scanSingleSite(url, siteName);
  } finally {
    await scanner.cleanup();
  }
}
