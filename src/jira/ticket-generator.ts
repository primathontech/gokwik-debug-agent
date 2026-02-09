import { Incident } from '../models/incident';

export interface JiraTicket {
  title: string;
  description: string;
  expectedResult: string;
  actualResult: string;
  stepsToReproduce: string[];
  curl?: string;
  environment: string;
  severity: string;
  labels: string[];
  component: string;
  affectedUrl: string;
  screenshotPath?: string;
  // Full formatted text for copy-paste
  formattedText: string;
}

/**
 * Generates a complete, copy-paste-ready Jira ticket from an Incident
 * QA can copy the formattedText directly into Jira's description field
 */
export function generateJiraTicket(incident: Incident): JiraTicket {
  const title = generateTitle(incident);
  const expectedResult = generateExpectedResult(incident);
  const actualResult = generateActualResult(incident);
  const stepsToReproduce = generateStepsToReproduce(incident);
  const curl = generateCurl(incident);
  const description = generateDescription(incident, expectedResult, actualResult);
  const formattedText = generateFormattedText(
    incident,
    expectedResult,
    actualResult,
    stepsToReproduce,
    curl
  );

  return {
    title,
    description,
    expectedResult,
    actualResult,
    stepsToReproduce,
    curl,
    environment: incident.environment,
    severity: mapSeverityToJira(incident.classification.severity),
    labels: generateLabels(incident),
    component: mapComponentFromClassification(incident.classification),
    affectedUrl: incident.siteUrl,
    screenshotPath: incident.screenshotPath,
    formattedText,
  };
}

/**
 * Generate concise Jira title
 * Format: [StoreName][SEVERITY] Brief error description
 */
function generateTitle(incident: Incident): string {
  const storeName = incident.siteName.toUpperCase().substring(0, 20);
  const severity = incident.classification.severity.toUpperCase();
  const errorSummary = truncate(incident.errorSummary, 60);

  return `[${storeName}][${severity}] ${errorSummary}`;
}

/**
 * Generate expected result based on error category and context
 */
function generateExpectedResult(incident: Incident): string {
  const { category } = incident.classification;

  switch (category) {
    case 'network_4xx':
    case 'network_5xx':
      return 'API request should complete successfully with appropriate HTTP status code (2xx) and return expected response data.';
    case 'network_timeout':
      return 'API request should complete within acceptable timeout period (< 30s) and return response data.';
    case 'network_cors':
      return 'API request should be allowed by CORS policy with proper headers from the browser.';
    case 'console_error':
      return 'Console should not display any JavaScript errors or exceptions.';
    case 'js_runtime_error':
      return 'JavaScript should execute without runtime errors or exceptions.';
    case 'resource_error':
      return 'All required resources (JS, CSS, images) should load successfully with HTTP 200 status.';
    case 'visual_issue':
      return 'Page elements should render correctly without visual glitches, misalignment, or display issues.';
    case 'hydration_error':
      return 'Server-side rendered HTML should match client-side rendered content without hydration mismatches.';
    case 'rendering_issue':
      return 'Page should render completely and correctly with all content visible and properly styled.';
    default:
      return 'Application should function normally without errors.';
  }
}

/**
 * Generate actual result describing what went wrong
 */
function generateActualResult(incident: Incident): string {
  const parts: string[] = [];

  parts.push(incident.errorDetail);

  if (incident.networkErrors.length > 0) {
    const netErr = incident.networkErrors[0];
    parts.push(
      `Network error: ${netErr.method} ${netErr.url} returned ${netErr.statusCode} ${netErr.statusText}`
    );
    if (netErr.responseTime) {
      parts.push(`Response time: ${netErr.responseTime}ms`);
    }
  }

  if (incident.consoleErrors.length > 0) {
    const consErr = incident.consoleErrors[0];
    parts.push(`Console ${consErr.type}: ${consErr.text}`);
    if (consErr.stackTrace) {
      parts.push(`Stack trace: ${truncate(consErr.stackTrace, 200)}`);
    }
  }

  if (incident.visualIssues.length > 0) {
    const vizIssue = incident.visualIssues[0];
    parts.push(`Visual issue: ${vizIssue.description}`);
  }

  parts.push(`Impact Score: ${incident.impactScore}/100`);

  return parts.join('\n');
}

/**
 * Generate step-by-step reproduction steps
 */
function generateStepsToReproduce(incident: Incident): string[] {
  const steps: string[] = [];

  steps.push(`Navigate to: ${incident.siteUrl}`);
  steps.push(`Go to page: ${incident.affectedPage}`);
  steps.push(`Observe: ${incident.errorSummary}`);

  if (incident.classification.category.startsWith('network')) {
    steps.push(`Open browser DevTools (F12 or Cmd+Opt+I)`);
    steps.push(`Go to Network tab`);
    steps.push(`Look for failed requests (red status codes like 4xx, 5xx, or "timeout")`);
    steps.push(`Check the request URL, method, status code, and response body`);
  }

  if (incident.classification.category.includes('console') || incident.consoleErrors.length > 0) {
    steps.push(`Open browser DevTools (F12 or Cmd+Opt+I)`);
    steps.push(`Go to Console tab`);
    steps.push(`Look for errors: ${incident.consoleErrors[0]?.text || 'JavaScript error'}`);
  }

  if (incident.visualIssues.length > 0) {
    steps.push(`Check the page layout and visual rendering`);
    steps.push(`Compare against expected design - look for misalignment, missing elements, or styling issues`);
  }

  steps.push(`Environment: ${incident.environment.toUpperCase()}`);
  steps.push(`Timestamp: ${incident.timestamp}`);

  return steps;
}

/**
 * Generate curl command to reproduce API failures
 */
function generateCurl(incident: Incident): string | undefined {
  if (incident.networkErrors.length === 0) {
    return undefined;
  }

  const netErr = incident.networkErrors[0];
  const method = netErr.method.toUpperCase();

  let curl = `curl -X ${method} '${netErr.url}'`;

  // Add common headers
  curl += ` -H 'Content-Type: application/json'`;
  if (netErr.requestHeaders) {
    Object.entries(netErr.requestHeaders).forEach(([key, value]) => {
      if (!['content-type', 'content-length', 'host'].includes(key.toLowerCase())) {
        curl += ` -H '${key}: ${value}'`;
      }
    });
  }

  curl += ` -v`;

  return curl;
}

/**
 * Generate detailed description section
 */
function generateDescription(
  incident: Incident,
  expectedResult: string,
  actualResult: string
): string {
  const parts: string[] = [];

  parts.push('DETECTED BY: Gokwik Debug Agent');
  parts.push('');

  parts.push('ERROR DETAILS:');
  parts.push(`- Category: ${incident.classification.category}`);
  parts.push(`- Classification Confidence: ${incident.classification.confidence}%`);
  parts.push(`- Reasoning: ${incident.classification.reasoning}`);
  parts.push('');

  parts.push('IMPACT ASSESSMENT:');
  parts.push(`- Impact Score: ${incident.impactScore}/100`);
  const isBlockingCheckout =
    incident.impactScore >= 80 ||
    incident.classification.severity === 'critical' ||
    incident.classification.severity === 'high';
  parts.push(`- Conversion Blocking: ${isBlockingCheckout ? 'YES - URGENT' : 'NO'}`);
  parts.push(`- Affected Page: ${incident.affectedPage}`);
  parts.push('');

  if (incident.kbMatch) {
    parts.push('KNOWLEDGE BASE MATCH:');
    parts.push(`- Pattern: ${incident.kbMatch.patternName}`);
    parts.push(`- Similarity: ${incident.kbMatch.similarity}%`);
    parts.push(`- Previous Occurrences: ${incident.kbMatch.previousOccurrences} times`);
    parts.push(`- Last Seen: ${incident.kbMatch.lastSeen}`);
    if (incident.kbMatch.knownResolution) {
      parts.push(`- Known Resolution: ${incident.kbMatch.knownResolution}`);
    }
    parts.push('');
  }

  parts.push('TECHNICAL DETAILS:');
  if (incident.classification.sourceSystem) {
    parts.push(`- Source System: ${incident.classification.sourceSystem}`);
  }
  parts.push(`- Suggested Owner: ${incident.classification.suggestedOwner}`);
  parts.push(`- Timestamp: ${incident.timestamp}`);

  if (incident.networkErrors.length > 0) {
    parts.push('');
    parts.push('NETWORK ERRORS:');
    incident.networkErrors.forEach((err, i) => {
      parts.push(`  Error ${i + 1}:`);
      parts.push(`    - URL: ${err.url}`);
      parts.push(`    - Method: ${err.method}`);
      parts.push(`    - Status: ${err.statusCode} ${err.statusText}`);
      parts.push(`    - Response Time: ${err.responseTime}ms`);
      if (err.errorMessage) {
        parts.push(`    - Message: ${err.errorMessage}`);
      }
      if (err.responseBody) {
        parts.push(`    - Response: ${truncate(err.responseBody, 500)}`);
      }
    });
  }

  if (incident.consoleErrors.length > 0) {
    parts.push('');
    parts.push('CONSOLE ERRORS:');
    incident.consoleErrors.forEach((err, i) => {
      parts.push(`  Error ${i + 1}:`);
      parts.push(`    - Type: ${err.type.toUpperCase()}`);
      parts.push(`    - Message: ${err.text}`);
      if (err.url) parts.push(`    - URL: ${err.url}`);
      if (err.lineNumber) parts.push(`    - Line: ${err.lineNumber}`);
      if (err.stackTrace) {
        parts.push(`    - Stack: ${truncate(err.stackTrace, 300)}`);
      }
    });
  }

  if (incident.suggestedFix) {
    parts.push('');
    parts.push('SUGGESTED FIX:');
    parts.push(incident.suggestedFix);
  }

  return parts.join('\n');
}

/**
 * Generate formatted Jira markdown text for direct copy-paste
 */
function generateFormattedText(
  incident: Incident,
  expectedResult: string,
  actualResult: string,
  stepsToReproduce: string[],
  curl: string | undefined
): string {
  const lines: string[] = [];

  lines.push('h2. Issue Summary');
  lines.push(`{color:#FF0000}*DETECTED BY AGENT*{color} - Gokwik Debug Agent`);
  lines.push('');

  lines.push('h3. Error Details');
  lines.push(`||Field||Value||`);
  lines.push(`|Category|${incident.classification.category}|`);
  lines.push(`|Severity|${incident.classification.severity.toUpperCase()}|`);
  lines.push(`|Confidence|${incident.classification.confidence}%|`);
  lines.push(`|Impact Score|${incident.impactScore}/100|`);
  lines.push('');

  lines.push('h3. Impact Assessment');
  const isBlockingCheckout =
    incident.impactScore >= 80 ||
    incident.classification.severity === 'critical' ||
    incident.classification.severity === 'high';
  lines.push(`||Metric||Status||`);
  lines.push(
    `|Conversion Blocking|${isBlockingCheckout ? '{color:#FF0000}YES - URGENT{color}' : 'NO'}|`
  );
  lines.push(`|Affected Page|${incident.affectedPage}|`);
  lines.push(`|Environment|${incident.environment.toUpperCase()}|`);
  lines.push('');

  lines.push('h3. Expected Result');
  lines.push(expectedResult);
  lines.push('');

  lines.push('h3. Actual Result');
  lines.push('{code}');
  lines.push(actualResult);
  lines.push('{code}');
  lines.push('');

  lines.push('h3. Steps to Reproduce');
  lines.push('{noformat}');
  stepsToReproduce.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push('{noformat}');
  lines.push('');

  if (curl) {
    lines.push('h3. API Test Command');
    lines.push('{code:bash}');
    lines.push(curl);
    lines.push('{code}');
    lines.push('');
  }

  if (incident.classification.reasoning) {
    lines.push('h3. Classification Reasoning');
    lines.push(incident.classification.reasoning);
    lines.push('');
  }

  if (incident.kbMatch) {
    lines.push('h3. Knowledge Base Match');
    lines.push(`||Metric||Value||`);
    lines.push(`|Pattern|${incident.kbMatch.patternName}|`);
    lines.push(`|Similarity|${incident.kbMatch.similarity}%|`);
    lines.push(`|Previous Occurrences|${incident.kbMatch.previousOccurrences}|`);
    lines.push(`|Last Seen|${incident.kbMatch.lastSeen}|`);
    if (incident.kbMatch.knownResolution) {
      lines.push(`|Known Resolution|${incident.kbMatch.knownResolution}|`);
    }
    lines.push('');
  }

  if (incident.networkErrors.length > 0) {
    lines.push('h3. Network Errors');
    incident.networkErrors.forEach((err, i) => {
      lines.push(`*Error ${i + 1}:*`);
      lines.push(`||Property||Value||`);
      lines.push(`|URL|${err.url}|`);
      lines.push(`|Method|${err.method}|`);
      lines.push(`|Status|${err.statusCode} ${err.statusText}|`);
      lines.push(`|Response Time|${err.responseTime}ms|`);
      if (err.errorMessage) {
        lines.push(`|Message|${err.errorMessage}|`);
      }
      if (err.responseBody) {
        lines.push('{code}');
        lines.push(truncate(err.responseBody, 500));
        lines.push('{code}');
      }
      lines.push('');
    });
  }

  if (incident.consoleErrors.length > 0) {
    lines.push('h3. Console Errors');
    incident.consoleErrors.forEach((err, i) => {
      lines.push(`*Error ${i + 1}:*`);
      lines.push(`||Property||Value||`);
      lines.push(`|Type|${err.type.toUpperCase()}|`);
      lines.push(`|Message|${err.text}|`);
      if (err.url) lines.push(`|URL|${err.url}|`);
      if (err.lineNumber) lines.push(`|Line|${err.lineNumber}|`);
      if (err.columnNumber) lines.push(`|Column|${err.columnNumber}|`);
      if (err.stackTrace) {
        lines.push('{code}');
        lines.push(truncate(err.stackTrace, 500));
        lines.push('{code}');
      }
      lines.push('');
    });
  }

  if (incident.visualIssues.length > 0) {
    lines.push('h3. Visual Issues');
    incident.visualIssues.forEach((issue, i) => {
      lines.push(`*Issue ${i + 1}:*`);
      lines.push(`||Property||Value||`);
      lines.push(`|Description|${issue.description}|`);
      lines.push(`|Confidence|${(issue.confidence * 100).toFixed(0)}%|`);
      if (issue.elementSelector) {
        lines.push(`|Element|${issue.elementSelector}|`);
      }
      if (issue.screenshotPath) {
        lines.push(`|Screenshot|${issue.screenshotPath}|`);
      }
      lines.push('');
    });
  }

  if (incident.suggestedFix) {
    lines.push('h3. Suggested Resolution');
    lines.push(incident.suggestedFix);
    lines.push('');
  }

  lines.push('h3. Technical Metadata');
  lines.push(`||Field||Value||`);
  lines.push(`|Incident ID|${incident.incidentId}|`);
  lines.push(`|Scan ID|${incident.scanId}|`);
  lines.push(`|Site Name|${incident.siteName}|`);
  lines.push(`|Timestamp|${incident.timestamp}|`);
  lines.push(`|Source System|${incident.classification.sourceSystem || 'Unknown'}|`);
  lines.push(`|Suggested Owner|${incident.classification.suggestedOwner}|`);
  if (incident.screenshotPath) {
    lines.push(`|Screenshot|${incident.screenshotPath}|`);
  }

  return lines.join('\n');
}

/**
 * Map severity to Jira severity field values
 */
function mapSeverityToJira(severity: string): string {
  const severityMap: Record<string, string> = {
    critical: 'Blocker',
    high: 'Critical',
    medium: 'Major',
    low: 'Minor',
    info: 'Trivial',
  };

  return severityMap[severity.toLowerCase()] || 'Major';
}

/**
 * Map error category to Jira component
 */
function mapComponentFromClassification(classification: {
  category: string;
  sourceSystem?: string;
}): string {
  const { category, sourceSystem } = classification;

  if (category.startsWith('network')) {
    if (sourceSystem === 'SHOPIFY') return 'Shopify Integration';
    if (sourceSystem === 'GOKWIK_BE') return 'Gokwik Backend';
    if (sourceSystem === 'THIRD_PARTY') return 'Third Party API';
    return 'API / Network';
  }

  if (category.includes('console') || category.includes('js_runtime')) {
    return 'Frontend / JavaScript';
  }

  if (category.includes('hydration')) {
    return 'Server-Side Rendering';
  }

  if (category === 'visual_issue' || category === 'rendering_issue') {
    return 'UI / Styling';
  }

  if (category === 'resource_error') {
    return 'Asset Loading';
  }

  return 'General';
}

/**
 * Generate labels for the ticket
 */
function generateLabels(incident: Incident): string[] {
  const labels: Set<string> = new Set();

  // Severity label
  labels.add(`severity-${incident.classification.severity}`);

  // Category label
  labels.add(`error-${incident.classification.category}`);

  // Environment label
  labels.add(`env-${incident.environment}`);

  // Impact label
  if (incident.impactScore >= 80) {
    labels.add('high-impact');
  }

  // AI detected
  labels.add('ai-detected');
  labels.add('gokwik-agent');

  // KB match
  if (incident.kbMatch) {
    labels.add('kb-match');
    labels.add(`pattern-${incident.kbMatch.patternId.substring(0, 20)}`);
  }

  return Array.from(labels);
}

/**
 * Utility function to truncate long strings
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
