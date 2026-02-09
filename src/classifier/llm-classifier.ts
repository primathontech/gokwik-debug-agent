import Anthropic from '@anthropic-ai/sdk';
import {
  Classification,
  NetworkError,
  ConsoleError,
  ErrorCategory,
  IssueDomain,
} from '../models/incident';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

interface LLMResponse {
  category: ErrorCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: number;
  reasoning: string;
  suggestedFix: string;
  domain?: IssueDomain;
  sourceSystem?: string;
}

interface AISettings {
  provider: 'anthropic' | 'openai' | 'gemini' | 'grok';
  apiKey: string | null;
}

// Get AI settings from database
function getAISettings(): AISettings {
  try {
    const dataDir = process.env.DATA_DIR || './data';
    const dbPath = path.join(dataDir, 'incidents.db');

    if (!fs.existsSync(dbPath)) {
      return { provider: 'anthropic', apiKey: null };
    }

    const db = new Database(dbPath, { readonly: true });
    const providerRow = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get() as { value: string } | undefined;
    const keyRow = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'").get() as { value: string } | undefined;
    db.close();

    return {
      provider: (providerRow?.value as AISettings['provider']) || 'anthropic',
      apiKey: keyRow?.value || null,
    };
  } catch (error) {
    console.error('Failed to get AI settings:', error);
    return { provider: 'anthropic', apiKey: null };
  }
}

// Build the classification prompt
function buildClassificationPrompt(errorSummary: string, siteName: string): string {
  return `You are a frontend error classification expert for an e-commerce platform. Analyze the following errors and classify them.

Tech Stack Context:
- Platform: Next.js
- Payment System: KwikCheckout with GoKwik SDK
- CDN: Shopify CDN
- API: Custom REST API
- Site: ${siteName}

Errors to Classify:
${errorSummary}

Respond with a JSON object containing:
{
  "category": one of: network_4xx, network_5xx, network_timeout, network_cors, console_error, console_warning, js_runtime_error, resource_error, visual_issue, hydration_error, rendering_issue,
  "severity": one of: critical, high, medium, low, info,
  "confidence": number between 0 and 100,
  "reasoning": brief explanation of the classification,
  "suggestedFix": brief suggestion for fixing the issue,
  "domain": one of: FRONTEND, BACKEND, INFRASTRUCTURE, THIRD_PARTY, UNKNOWN,
  "sourceSystem": one of: SHOPIFY, GOKWIK_BE, STOREFRONT_FE, THIRD_PARTY, PAYMENT_GATEWAY, CDN, ANALYTICS
}

Domain classification rules:
- FRONTEND: JavaScript errors, hydration issues, rendering problems, React/Next.js errors
- BACKEND: API errors (4xx/5xx), CORS issues, GraphQL errors, cart/checkout API failures
- INFRASTRUCTURE: CDN failures, timeout issues, DNS problems
- THIRD_PARTY: Analytics errors, payment gateway SDK errors, external service failures

Respond ONLY with the JSON object, no markdown formatting.`;
}

// Call Anthropic API
async function callAnthropic(prompt: string, apiKey?: string | null): Promise<string> {
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  const message = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// Call OpenAI API
async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// Call Google Gemini API
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Call xAI Grok API
async function callGrok(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Main LLM classification function with multi-provider support
export async function classifyWithLLM(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  pageUrl: string,
  siteName: string
): Promise<Classification> {
  if (MOCK_MODE) {
    return mockClassification(networkErrors, consoleErrors, pageUrl);
  }

  try {
    const settings = getAISettings();
    const errorSummary = buildErrorSummary(networkErrors, consoleErrors, pageUrl, siteName);
    const prompt = buildClassificationPrompt(errorSummary, siteName);

    let responseText: string;

    switch (settings.provider) {
      case 'openai':
        if (!settings.apiKey) throw new Error('OpenAI API key not configured');
        console.log('Using OpenAI for classification...');
        responseText = await callOpenAI(prompt, settings.apiKey);
        break;

      case 'gemini':
        if (!settings.apiKey) throw new Error('Gemini API key not configured');
        console.log('Using Gemini for classification...');
        responseText = await callGemini(prompt, settings.apiKey);
        break;

      case 'grok':
        if (!settings.apiKey) throw new Error('Grok API key not configured');
        console.log('Using Grok for classification...');
        responseText = await callGrok(prompt, settings.apiKey);
        break;

      case 'anthropic':
      default:
        console.log('Using Anthropic for classification...');
        responseText = await callAnthropic(prompt, settings.apiKey);
        break;
    }

    // Clean response - remove markdown code blocks if present
    responseText = responseText.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.slice(7);
    } else if (responseText.startsWith('```')) {
      responseText = responseText.slice(3);
    }
    if (responseText.endsWith('```')) {
      responseText = responseText.slice(0, -3);
    }
    responseText = responseText.trim();

    const parsed: LLMResponse = JSON.parse(responseText);

    return {
      category: parsed.category,
      severity: parsed.severity,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      suggestedOwner: mapCategoryToOwner(parsed.category),
      domain: parsed.domain || inferDomainFromCategory(parsed.category),
      sourceSystem: parsed.sourceSystem as Classification['sourceSystem'],
      domainReasoning: parsed.reasoning,
    };
  } catch (error) {
    console.error('LLM classification failed, falling back to mock:', error);
    return mockClassification(networkErrors, consoleErrors, pageUrl);
  }
}

function mockClassification(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  pageUrl: string
): Classification {
  // Simple rule-based fallback when LLM is unavailable
  if (networkErrors.length > 0) {
    const firstNetError = networkErrors[0];
    if (firstNetError.statusCode === 503 || firstNetError.statusCode === 500) {
      return {
        category: 'network_5xx',
        severity: 'high',
        confidence: 85,
        reasoning: 'Server error detected from API response',
        suggestedOwner: 'Backend / API Team',
        domain: 'BACKEND',
        sourceSystem: 'GOKWIK_BE',
        domainReasoning: 'HTTP 5xx server error indicates backend issue',
      };
    }
    if (firstNetError.errorMessage && firstNetError.errorMessage.includes('CORS')) {
      return {
        category: 'network_cors',
        severity: 'high',
        confidence: 90,
        reasoning: 'CORS policy violation detected',
        suggestedOwner: 'Backend / DevOps',
        domain: 'BACKEND',
        sourceSystem: 'GOKWIK_BE',
        domainReasoning: 'CORS error - backend needs to allow cross-origin requests',
      };
    }
  }

  if (consoleErrors.length > 0) {
    const firstConsoleError = consoleErrors[0];
    if (firstConsoleError.text.includes('Hydration')) {
      return {
        category: 'hydration_error',
        severity: 'medium',
        confidence: 88,
        reasoning: 'Next.js hydration mismatch detected',
        suggestedOwner: 'Frontend Team',
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        domainReasoning: 'Hydration error - React SSR mismatch in frontend code',
      };
    }
    if (
      firstConsoleError.text.includes('TypeError') ||
      firstConsoleError.text.includes('ReferenceError')
    ) {
      return {
        category: 'js_runtime_error',
        severity: 'high',
        confidence: 87,
        reasoning: 'JavaScript runtime error detected',
        suggestedOwner: 'Frontend Team',
        domain: 'FRONTEND',
        sourceSystem: 'STOREFRONT_FE',
        domainReasoning: 'JavaScript runtime error - frontend code issue',
      };
    }
  }

  // Default fallback
  return {
    category: 'console_error',
    severity: 'low',
    confidence: 50,
    reasoning: 'Unable to determine specific error category',
    suggestedOwner: 'Frontend Team',
    domain: 'UNKNOWN',
    domainReasoning: 'Unable to determine domain from error pattern',
  };
}

function buildErrorSummary(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  pageUrl: string,
  siteName: string
): string {
  let summary = `Page URL: ${pageUrl}\nSite: ${siteName}\n\n`;

  if (networkErrors.length > 0) {
    summary += `Network Errors (${networkErrors.length}):\n`;
    networkErrors.slice(0, 5).forEach((error, idx) => {
      summary += `${idx + 1}. Status ${error.statusCode}: ${error.errorMessage || 'Unknown error'} (URL: ${error.url})\n`;
    });
    summary += '\n';
  }

  if (consoleErrors.length > 0) {
    summary += `Console Errors (${consoleErrors.length}):\n`;
    consoleErrors.slice(0, 5).forEach((error, idx) => {
      summary += `${idx + 1}. [${error.type}] ${error.text}\n`;
      if (error.stackTrace) {
        summary += `   Stack: ${error.stackTrace.split('\n')[0]}\n`;
      }
    });
  }

  return summary;
}

function mapCategoryToOwner(category: ErrorCategory): string {
  const ownerMap: { [key in ErrorCategory]: string } = {
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

  return ownerMap[category];
}

function inferDomainFromCategory(category: ErrorCategory): IssueDomain {
  const domainMap: { [key in ErrorCategory]: IssueDomain } = {
    // Network errors -> Backend
    network_4xx: 'BACKEND',
    network_5xx: 'BACKEND',
    network_timeout: 'BACKEND',
    network_cors: 'BACKEND',
    // Console/JS errors -> Frontend
    console_error: 'FRONTEND',
    console_warning: 'FRONTEND',
    js_runtime_error: 'FRONTEND',
    resource_error: 'FRONTEND',
    visual_issue: 'FRONTEND',
    hydration_error: 'FRONTEND',
    rendering_issue: 'FRONTEND',
    // GoKwik/E-commerce specific
    payment_error: 'PAYMENT',
    checkout_error: 'BACKEND',
    cart_error: 'BACKEND',
    auth_error: 'BACKEND',
    sdk_load_error: 'SDK',
    third_party_error: 'THIRD_PARTY',
    cdn_error: 'CDN',
    api_schema_error: 'FRONTEND',
    performance_degradation: 'INFRASTRUCTURE',
    security_error: 'INFRASTRUCTURE',
    seo_error: 'FRONTEND',
    websocket_error: 'INFRASTRUCTURE',
    // Shopify-specific -> SHOPIFY domain
    shopify_api_error: 'SHOPIFY',
    shopify_theme_error: 'SHOPIFY',
    shopify_app_error: 'SHOPIFY',
    shopify_rate_limit: 'SHOPIFY',
    shopify_checkout_error: 'SHOPIFY',
    // Analytics/Tracking errors -> THIRD_PARTY (analytics platforms)
    analytics_meta_missing: 'THIRD_PARTY',
    analytics_meta_failed: 'THIRD_PARTY',
    analytics_ga4_missing: 'THIRD_PARTY',
    analytics_ga4_failed: 'THIRD_PARTY',
    analytics_google_ads_failed: 'THIRD_PARTY',
    analytics_pixel_not_loaded: 'FRONTEND',
    // Next.js SSR/SSG errors -> FRONTEND
    nextjs_ssr_error: 'FRONTEND',
    nextjs_routing_error: 'FRONTEND',
    nextjs_build_error: 'FRONTEND',
    // Web Vitals performance errors -> FRONTEND
    web_vitals_lcp: 'FRONTEND',
    web_vitals_cls: 'FRONTEND',
    web_vitals_fid: 'FRONTEND',
    web_vitals_inp: 'FRONTEND',
    web_vitals_ttfb: 'FRONTEND',
    // Additional Shopify purchase funnel errors -> SHOPIFY
    shopify_inventory_error: 'SHOPIFY',
    shopify_discount_error: 'SHOPIFY',
    shopify_shipping_error: 'SHOPIFY',
    shopify_webhook_error: 'SHOPIFY',
    unknown: 'UNKNOWN',
  };

  return domainMap[category] || 'UNKNOWN';
}
