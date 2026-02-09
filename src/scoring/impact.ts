import {
  NetworkError,
  ConsoleError,
  VisualIssue,
} from '../models/incident';

export interface ImpactResult {
  score: number;
  reasoning: string;
  isConversionBlocking: boolean;
}

interface ErrorImpact {
  category: string;
  baseScore: number;
  isConversionBlocking: boolean;
}

export function calculateImpact(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  visualIssues: VisualIssue[],
  pageUrl: string
): ImpactResult {
  const pageType = getPageType(pageUrl);
  let totalScore = 0;
  let blockingErrorCount = 0;
  const reasoningParts: string[] = [];

  // Process network errors
  networkErrors.forEach((error) => {
    const impact = scoreNetworkError(error, pageType);
    totalScore += impact.baseScore;
    if (impact.isConversionBlocking) {
      blockingErrorCount++;
    }
    reasoningParts.push(`Network error: ${impact.category}`);
  });

  // Process console errors
  consoleErrors.forEach((error) => {
    const impact = scoreConsoleError(error, pageType);
    totalScore += impact.baseScore;
    if (impact.isConversionBlocking) {
      blockingErrorCount++;
    }
    reasoningParts.push(`Console error: ${impact.category}`);
  });

  // Process visual issues
  visualIssues.forEach((issue) => {
    const impact = scoreVisualIssue(issue, pageType);
    totalScore += impact.baseScore;
    if (impact.isConversionBlocking) {
      blockingErrorCount++;
    }
    reasoningParts.push(`Visual issue: ${impact.category}`);
  });

  // Apply frequency multiplier
  const totalErrors = networkErrors.length + consoleErrors.length;
  const frequencyMultiplier = Math.min(1 + totalErrors * 0.1, 1.5);
  totalScore = Math.min(totalScore * frequencyMultiplier, 100);

  // Apply page importance multiplier
  const pageImportanceMultiplier = getPageImportanceMultiplier(pageType);
  totalScore = Math.min(totalScore * pageImportanceMultiplier, 100);

  // Ensure score is in range [0, 100]
  totalScore = Math.max(0, Math.min(totalScore, 100));

  const isConversionBlocking = blockingErrorCount > 0;
  const reasoning = buildReasoningString(
    Math.round(totalScore),
    pageType,
    blockingErrorCount,
    totalErrors
  );

  return {
    score: Math.round(totalScore),
    reasoning,
    isConversionBlocking,
  };
}

function getPageType(pageUrl: string): string {
  const url = new URL(pageUrl);
  const pathname = url.pathname.toLowerCase();

  if (pathname.includes('/checkout') || pathname.includes('/cart')) {
    return 'checkout';
  }
  if (
    pathname.includes('/product') ||
    pathname.includes('/p/') ||
    pathname === '/'
  ) {
    return 'product';
  }
  if (pathname.includes('/category') || pathname.includes('/collections')) {
    return 'listing';
  }

  return 'other';
}

function scoreNetworkError(error: NetworkError, pageType: string): ErrorImpact {
  const { statusCode, errorMessage, url } = error;

  // Checkout flow blocked (5xx on checkout API)
  if (pageType === 'checkout' && statusCode && statusCode >= 500) {
    return {
      category: 'Checkout API 5xx',
      baseScore: 95,
      isConversionBlocking: true,
    };
  }

  // Checkout flow blocked (4xx on checkout API)
  if (pageType === 'checkout' && statusCode === 401) {
    return {
      category: 'Checkout Auth Error',
      baseScore: 90,
      isConversionBlocking: true,
    };
  }

  // Cart API failures (add/get cart)
  if (url && (url.includes('/cart') || url.includes('/api/cart'))) {
    if (statusCode && statusCode >= 500) {
      return {
        category: 'Cart API 5xx',
        baseScore: 85,
        isConversionBlocking: true,
      };
    }
    if (statusCode === 400) {
      return {
        category: 'Cart API 4xx',
        baseScore: 80,
        isConversionBlocking: true,
      };
    }
  }

  // KwikPass/GoKwik SDK failure
  if (
    url &&
    (url.includes('kwik') ||
      url.includes('gokwik') ||
      (errorMessage && errorMessage.includes('KwikCheckout')) ||
      (errorMessage && errorMessage.includes('GoKwik')))
  ) {
    if (statusCode && statusCode >= 500) {
      return {
        category: 'Payment SDK 5xx',
        baseScore: 88,
        isConversionBlocking: true,
      };
    }
    return {
      category: 'Payment SDK Error',
      baseScore: 82,
      isConversionBlocking: true,
    };
  }

  // CORS on critical API
  if (errorMessage && errorMessage.includes('CORS')) {
    if (pageType === 'checkout') {
      return {
        category: 'CORS on Checkout',
        baseScore: 80,
        isConversionBlocking: true,
      };
    }
    return {
      category: 'CORS Error',
      baseScore: 78,
      isConversionBlocking: false,
    };
  }

  // JS chunk load failure
  if ((errorMessage && errorMessage.includes('ChunkLoadError')) || (errorMessage && errorMessage.includes('chunk'))) {
    return {
      category: 'Chunk Load Error',
      baseScore: 65,
      isConversionBlocking: true,
    };
  }

  // Product page crash (5xx on PDP)
  if (pageType === 'product' && statusCode && statusCode >= 500) {
    return {
      category: 'Product Page 5xx',
      baseScore: 70,
      isConversionBlocking: true,
    };
  }

  // Image 404 on PDP
  if (pageType === 'product' && statusCode === 404 && url?.match(/\.(jpg|png|webp)/i)) {
    return {
      category: 'Product Image 404',
      baseScore: 55,
      isConversionBlocking: false,
    };
  }

  // Generic 5xx
  if (statusCode && statusCode >= 500) {
    return {
      category: 'Server Error',
      baseScore: 70,
      isConversionBlocking: false,
    };
  }

  // Generic 4xx
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return {
      category: 'Client Error',
      baseScore: 50,
      isConversionBlocking: false,
    };
  }

  // Request timeout
  if (errorMessage && errorMessage.includes('timeout')) {
    return {
      category: 'Request Timeout',
      baseScore: 60,
      isConversionBlocking: false,
    };
  }

  // Analytics script failure
  if (url && (url.includes('analytics') || url.includes('gtag'))) {
    return {
      category: 'Analytics Script Error',
      baseScore: 15,
      isConversionBlocking: false,
    };
  }

  // Non-critical resource failure
  if (url && (url.includes('/fonts') || url.includes('/css'))) {
    return {
      category: 'Non-critical Resource',
      baseScore: 20,
      isConversionBlocking: false,
    };
  }

  return {
    category: 'Network Error',
    baseScore: 40,
    isConversionBlocking: false,
  };
}

function scoreConsoleError(error: ConsoleError, pageType: string): ErrorImpact {
  const { text, type } = error;
  const lowerMessage = text.toLowerCase();

  // Hydration mismatch
  if (lowerMessage.includes('hydration')) {
    return {
      category: 'Hydration Mismatch',
      baseScore: 35,
      isConversionBlocking: false,
    };
  }

  // JS runtime errors
  if (
    lowerMessage.includes('typeerror') ||
    lowerMessage.includes('referenceerror') ||
    lowerMessage.includes('syntaxerror')
  ) {
    if (pageType === 'checkout') {
      return {
        category: 'Runtime Error (Checkout)',
        baseScore: 75,
        isConversionBlocking: true,
      };
    }
    return {
      category: 'Runtime Error',
      baseScore: 55,
      isConversionBlocking: false,
    };
  }

  // Rendering issues
  if (
    lowerMessage.includes('render') ||
    lowerMessage.includes('rendering')
  ) {
    return {
      category: 'Rendering Issue',
      baseScore: 45,
      isConversionBlocking: false,
    };
  }

  // Console error level
  if (type === 'error') {
    return {
      category: 'Console Error',
      baseScore: 50,
      isConversionBlocking: false,
    };
  }

  // Console warning level
  if (type === 'warning') {
    return {
      category: 'Console Warning',
      baseScore: 10,
      isConversionBlocking: false,
    };
  }

  return {
    category: 'Unknown Console Issue',
    baseScore: 25,
    isConversionBlocking: false,
  };
}

function scoreVisualIssue(issue: VisualIssue, pageType: string): ErrorImpact {
  // Checkout page visual issues are more critical
  if (pageType === 'checkout') {
    return {
      category: 'Checkout Visual Issue',
      baseScore: 60,
      isConversionBlocking: false,
    };
  }

  // Product page visual issues
  if (pageType === 'product') {
    return {
      category: 'Product Visual Issue',
      baseScore: 40,
      isConversionBlocking: false,
    };
  }

  return {
    category: 'Visual Issue',
    baseScore: 25,
    isConversionBlocking: false,
  };
}

function getPageImportanceMultiplier(pageType: string): number {
  switch (pageType) {
    case 'checkout':
      return 1.3;
    case 'product':
      return 1.15;
    case 'listing':
      return 1.05;
    default:
      return 1.0;
  }
}

function buildReasoningString(
  score: number,
  pageType: string,
  blockingErrorCount: number,
  totalErrors: number
): string {
  let reasoning = `Impact Score: ${score}/100. `;

  if (score >= 90) {
    reasoning += 'Critical impact on conversion flow. ';
  } else if (score >= 70) {
    reasoning += 'High impact on user experience and conversions. ';
  } else if (score >= 50) {
    reasoning += 'Moderate impact on functionality. ';
  } else if (score >= 25) {
    reasoning += 'Low impact, minor issues detected. ';
  } else {
    reasoning += 'Minimal impact detected. ';
  }

  if (blockingErrorCount > 0) {
    reasoning += `${blockingErrorCount} conversion-blocking error(s) found. `;
  }

  reasoning += `${totalErrors} total error(s) on ${pageType} page.`;

  return reasoning;
}
