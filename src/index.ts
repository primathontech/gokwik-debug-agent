/**
 * GoKwik Debug Agent - Main Entry Point
 *
 * AI-powered developer support agent that scans storefronts,
 * detects issues, classifies them, checks the knowledge base,
 * and sends structured Slack alerts.
 *
 * Usage:
 *   npm start                    - Run full scan cycle for all sites
 *   npm run scan                 - Same as above
 *   npm run scan:single <url>    - Scan a single URL
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });

import * as fs from 'fs';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import Database from 'better-sqlite3';
import { PlaywrightScanner, scanUrl } from './scanner/scanner';
import { classifyErrors } from './classifier/classifier';
import { classifyWithLLM } from './classifier/llm-classifier';
import { KnowledgeBase } from './knowledgebase/kb';
import { calculateImpact } from './scoring/impact';
import { SlackBot } from './slack/slack-bot';
import { Incident, ScanResult, Classification, SiteConfig, AgentConfig } from './models/incident';

// ─── Incidents Database ──────────────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || './data';
let incidentsDb: Database.Database;

function initIncidentsDb(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  incidentsDb = new Database(path.join(DATA_DIR, 'incidents.db'));
  incidentsDb.pragma('journal_mode = WAL');

  incidentsDb.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      site_name TEXT NOT NULL,
      site_url TEXT NOT NULL,
      environment TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      error_summary TEXT NOT NULL,
      error_detail TEXT,
      affected_page TEXT,
      classification_json TEXT,
      impact_score REAL,
      kb_match_json TEXT,
      suggested_fix TEXT,
      status TEXT DEFAULT 'open',
      resolved_by TEXT,
      resolved_at TEXT,
      resolution TEXT,
      slack_message_ts TEXT,
      slack_channel TEXT,
      slack_status TEXT DEFAULT 'pending',
      slack_error TEXT,
      network_errors_json TEXT,
      console_errors_json TEXT,
      visual_issues_json TEXT,
      screenshot_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_site_name ON incidents(site_name);
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
    CREATE INDEX IF NOT EXISTS idx_incidents_slack_status ON incidents(slack_status);
  `);

  // Migration: Add slack_status column if not exists
  try {
    incidentsDb.exec(`ALTER TABLE incidents ADD COLUMN slack_status TEXT DEFAULT 'pending'`);
  } catch (e) { /* column already exists */ }
  try {
    incidentsDb.exec(`ALTER TABLE incidents ADD COLUMN slack_error TEXT`);
  } catch (e) { /* column already exists */ }
}

function saveIncident(incident: Incident): void {
  const stmt = incidentsDb.prepare(`
    INSERT OR REPLACE INTO incidents (
      id, scan_id, site_name, site_url, environment, timestamp,
      error_summary, error_detail, affected_page, classification_json,
      impact_score, kb_match_json, suggested_fix, status,
      slack_message_ts, slack_channel, slack_status, slack_error,
      network_errors_json, console_errors_json, visual_issues_json, screenshot_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    incident.incidentId,
    incident.scanId,
    incident.siteName,
    incident.siteUrl,
    incident.environment,
    incident.timestamp,
    incident.errorSummary,
    incident.errorDetail || null,
    incident.affectedPage || null,
    JSON.stringify(incident.classification),
    incident.impactScore,
    incident.kbMatch ? JSON.stringify(incident.kbMatch) : null,
    incident.suggestedFix || null,
    incident.status || 'open',
    incident.slackMessageTs || null,
    incident.slackChannel || null,
    incident.slackStatus || 'pending',
    incident.slackError || null,
    JSON.stringify(incident.networkErrors || []),
    JSON.stringify(incident.consoleErrors || []),
    JSON.stringify(incident.visualIssues || []),
    incident.screenshotPath || null
  );
}

// ─── Load Configuration ─────────────────────────────────────────────
function loadConfig(): AgentConfig {
  const sitesPath = path.join(__dirname, '..', 'config', 'sites.yaml');
  const content = fs.readFileSync(sitesPath, 'utf-8');
  return yaml.parse(content) as AgentConfig;
}

function loadOwnership(): Record<string, any> {
  const ownerPath = path.join(__dirname, '..', 'config', 'ownership.yaml');
  const content = fs.readFileSync(ownerPath, 'utf-8');
  return yaml.parse(content);
}

// ─── Banner ─────────────────────────────────────────────────────────
function printBanner() {
  console.log(chalk.cyan.bold('\n╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║         🤖  GoKwik Debug Agent v1.0.0                ║'));
  console.log(chalk.cyan.bold('║   AI-Powered FE Issue Detection & Knowledge Base     ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝\n'));
}

// ─── Process Scan Results into Incidents ─────────────────────────────
async function processScanResult(
  scanResult: ScanResult,
  kb: KnowledgeBase,
  slackBot: SlackBot,
  ownership: Record<string, any>
): Promise<Incident[]> {
  const incidents: Incident[] = [];

  // Skip if no errors found
  if (
    scanResult.networkErrors.length === 0 &&
    scanResult.consoleErrors.length === 0 &&
    scanResult.visualIssues.length === 0
  ) {
    console.log(chalk.green(`  ✅ No issues found on ${scanResult.siteName}`));
    return incidents;
  }

  // 1. Classify errors
  const classifications = classifyErrors(scanResult.networkErrors, scanResult.consoleErrors);

  // 2. Group errors by classification category for incident creation
  const errorGroups = groupErrorsByCategory(scanResult, classifications);

  for (const group of errorGroups) {
    // 3. Calculate impact score
    const impact = calculateImpact(
      group.networkErrors,
      group.consoleErrors,
      scanResult.visualIssues,
      group.affectedPage
    );

    // 4. Build error summary
    const errorSummary = buildErrorSummary(group);
    const errorDetail = buildErrorDetail(group);

    // 5. Generate error signature for KB matching
    const errorSignature = generateSignature(errorSummary, group.classification.category);

    // 6. Check knowledge base
    const kbMatch = kb.findMatch(errorSignature, errorDetail);

    // 7. If confidence < 70% and not in mock mode, try LLM
    let finalClassification = group.classification;
    if (group.classification.confidence < 70 && process.env.MOCK_MODE !== 'true') {
      try {
        const llmResult = await classifyWithLLM(
          group.networkErrors,
          group.consoleErrors,
          group.affectedPage,
          scanResult.siteName
        );
        if (llmResult.confidence > finalClassification.confidence) {
          finalClassification = llmResult;
        }
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ LLM classification failed, using rule-based result`));
      }
    }

    // 8. Determine suggested fix
    const suggestedFix = kbMatch?.suggestedFix || kbMatch?.resolution || finalClassification.reasoning;

    // 9. Check severity threshold for staging sites
    const site = loadConfig().sites.find(s => s.name === scanResult.siteName);
    if (site?.severity_threshold && !meetsThreshold(finalClassification.severity, site.severity_threshold)) {
      console.log(chalk.gray(`  ⏭ Skipping ${finalClassification.severity} alert for staging site ${scanResult.siteName}`));
      continue;
    }

    // 10. Create incident
    const incident: Incident = {
      incidentId: `INC-${Date.now()}-${uuidv4().slice(0, 6)}`,
      scanId: scanResult.scanId,
      siteName: scanResult.siteName,
      siteUrl: scanResult.siteUrl,
      environment: scanResult.environment,
      timestamp: new Date().toISOString(),
      errorSummary,
      errorDetail,
      affectedPage: group.affectedPage,
      networkErrors: group.networkErrors,
      consoleErrors: group.consoleErrors,
      visualIssues: scanResult.visualIssues,
      screenshotPath: scanResult.screenshotPaths[0],
      classification: finalClassification,
      impactScore: impact.score,
      kbMatch: kbMatch ? {
        matchId: kbMatch.entryId,
        patternId: kbMatch.entryId,
        patternName: kbMatch.patternName,
        similarity: kbMatch.similarity,
        previousOccurrences: kbMatch.occurrences,
        lastSeen: kbMatch.lastSeen,
        knownResolution: kbMatch.resolution,
      } : undefined,
      suggestedFix,
      status: 'open',
    };

    // 11. Add to knowledge base
    kb.addEntry(incident);

    // 12. Set Slack channel (but don't send automatically - user triggers from dashboard)
    const alertChannel = site?.alert_channel || ownership.default_channel || '#agent-fe-alerts';
    incident.slackChannel = alertChannel;
    incident.slackStatus = 'pending';  // Will be sent when user triggers from dashboard

    // Save incident to database
    saveIncident(incident);
    console.log(chalk.yellow(`  📋 Incident saved: ${incident.incidentId} (Slack: pending - trigger from dashboard)`));
    incidents.push(incident);
  }

  return incidents;
}

// ─── Helper Functions ────────────────────────────────────────────────

interface ErrorGroup {
  classification: Classification;
  networkErrors: import('./models/incident').NetworkError[];
  consoleErrors: import('./models/incident').ConsoleError[];
  affectedPage: string;
}

function groupErrorsByCategory(scanResult: ScanResult, classifications: Classification[]): ErrorGroup[] {
  const groups: Map<string, ErrorGroup> = new Map();

  // Group network errors
  for (let i = 0; i < scanResult.networkErrors.length; i++) {
    const err = scanResult.networkErrors[i];
    const cls = classifications[i] || classifications[0];
    const key = cls.category;

    if (!groups.has(key)) {
      groups.set(key, {
        classification: cls,
        networkErrors: [],
        consoleErrors: [],
        affectedPage: err.url,
      });
    }
    groups.get(key)!.networkErrors.push(err);
  }

  // Group console errors
  const consoleClassifications = classifyErrors([], scanResult.consoleErrors);
  for (let i = 0; i < scanResult.consoleErrors.length; i++) {
    const err = scanResult.consoleErrors[i];
    const cls = consoleClassifications[i] || consoleClassifications[0];
    const key = cls?.category || 'console_error';

    if (!groups.has(key)) {
      groups.set(key, {
        classification: cls || { category: 'console_error', severity: 'medium', confidence: 50, reasoning: 'Console error', suggestedOwner: 'Frontend Team', domain: 'FRONTEND' as const },
        networkErrors: [],
        consoleErrors: [],
        affectedPage: err.url || scanResult.siteUrl,
      });
    }
    groups.get(key)!.consoleErrors.push(err);
  }

  return Array.from(groups.values());
}

function buildErrorSummary(group: ErrorGroup): string {
  const parts: string[] = [];

  if (group.networkErrors.length > 0) {
    const err = group.networkErrors[0];
    parts.push(`${err.method} ${err.url} → ${err.statusCode} ${err.statusText}`);
  }

  if (group.consoleErrors.length > 0) {
    const err = group.consoleErrors[0];
    parts.push(err.text.slice(0, 200));
  }

  return parts.join(' | ') || 'Unknown error';
}

function buildErrorDetail(group: ErrorGroup): string {
  const lines: string[] = [];

  for (const err of group.networkErrors.slice(0, 5)) {
    lines.push(`[NETWORK] ${err.method} ${err.url} → ${err.statusCode} (${err.responseTime}ms)`);
    if (err.errorMessage) lines.push(`  Message: ${err.errorMessage}`);
  }

  for (const err of group.consoleErrors.slice(0, 5)) {
    lines.push(`[CONSOLE:${err.type.toUpperCase()}] ${err.text.slice(0, 300)}`);
    if (err.stackTrace) lines.push(`  Stack: ${err.stackTrace.slice(0, 200)}`);
  }

  return lines.join('\n');
}

function generateSignature(summary: string, category: string): string {
  // Remove dynamic parts: timestamps, UUIDs, hashes, numeric IDs
  const normalized = summary
    .replace(/\d{10,}/g, '{ID}')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{UUID}')
    .replace(/[0-9a-f]{16,}/gi, '{HASH}')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '{TIMESTAMP}')
    .replace(/:\d{4,5}/g, ':{PORT}')
    .trim();

  return `${category}::${normalized}`;
}

function meetsThreshold(severity: string, threshold: string): boolean {
  const levels: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return (levels[severity] || 0) >= (levels[threshold] || 0);
}

// ─── Main Execution ──────────────────────────────────────────────────

async function main() {
  printBanner();

  const args = process.argv.slice(2);
  const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'scan';

  // Initialize components
  console.log(chalk.blue('🔧 Initializing agent components...'));
  initIncidentsDb();
  const config = loadConfig();
  const ownership = loadOwnership();
  const kb = new KnowledgeBase();
  const slackBot = new SlackBot();
  const scanner = new PlaywrightScanner();

  console.log(chalk.blue(`📋 Loaded ${config.sites.length} sites to scan`));
  console.log(chalk.blue(`📚 Knowledge base: ${kb.getStats().totalEntries} entries`));
  console.log(chalk.blue(`🔔 Mode: ${process.env.MOCK_MODE !== 'false' ? 'MOCK (console output)' : 'LIVE (Slack alerts)'}`));
  console.log('');

  if (mode === 'scan-single') {
    // Single URL scan
    const urlIndex = args.indexOf('--url');
    const url = urlIndex !== -1 ? args[urlIndex + 1] : args[args.length - 1];
    if (!url || url.startsWith('--')) {
      console.log(chalk.red('❌ Please provide a URL: npm run scan:single -- --url https://store.example.com'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n🔍 Scanning single URL: ${url}\n`));
    const result = await scanUrl(url, 'Manual Scan');
    const incidents = await processScanResult(result, kb, slackBot, ownership);
    printScanSummary([result], incidents);

  } else {
    // Full scan of all configured sites
    console.log(chalk.cyan('🔍 Starting full scan of all configured storefronts...\n'));
    const allResults: ScanResult[] = [];
    const allIncidents: Incident[] = [];

    for (const site of config.sites) {
      console.log(chalk.cyan.bold(`\n━━━ Scanning: ${site.name} (${site.url}) ━━━`));
      console.log(chalk.gray(`   Environment: ${site.environment} | Backend: ${site.backend_type}`));
      console.log(chalk.gray(`   Flows: ${site.scan_flows.join(', ')}\n`));

      try {
        const result = await scanner.scanSite({
          name: site.name,
          url: site.url,
          environment: site.environment,
          backend_type: site.backend_type,
          scan_flows: site.scan_flows,
          alert_channel: site.alert_channel,
        });
        allResults.push(result);

        const incidents = await processScanResult(result, kb, slackBot, ownership);
        allIncidents.push(...incidents);

      } catch (err: any) {
        console.log(chalk.red(`  ❌ Failed to scan ${site.name}: ${err.message}`));
      }
    }

    // Send scan summary to Slack
    await slackBot.sendScanSummary(allResults, '#agent-all-alerts');

    // Print final summary
    printScanSummary(allResults, allIncidents);
  }

  // Print KB stats
  const stats = kb.getStats();
  console.log(chalk.blue('\n📚 Knowledge Base Stats:'));
  console.log(chalk.gray(`   Total entries: ${stats.totalEntries}`));
  console.log(chalk.gray(`   Resolved: ${stats.resolvedEntries}`));
  console.log(chalk.gray(`   Unresolved: ${stats.unresolvedEntries}`));

  // Cleanup
  await scanner.cleanup();
  console.log(chalk.green('\n✅ Agent scan complete.\n'));
}

function printScanSummary(results: ScanResult[], incidents: Incident[]) {
  console.log(chalk.cyan.bold('\n╔══════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║          📊  SCAN SUMMARY           ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════╝'));

  for (const result of results) {
    const errors = result.networkErrors.length + result.consoleErrors.length + result.visualIssues.length;
    const status = errors === 0 ? chalk.green('✅ CLEAN') : chalk.red(`⚠ ${errors} issues`);
    console.log(`  ${result.siteName.padEnd(20)} ${status}`);
    console.log(chalk.gray(`    Network: ${result.networkErrors.length} | Console: ${result.consoleErrors.length} | Visual: ${result.visualIssues.length} | Load: ${result.pageMetrics.loadTime}ms`));
  }

  console.log(chalk.cyan(`\n  Total incidents created: ${incidents.length}`));

  const critical = incidents.filter(i => i.classification.severity === 'critical').length;
  const high = incidents.filter(i => i.classification.severity === 'high').length;
  if (critical > 0) console.log(chalk.red(`  🔴 Critical: ${critical}`));
  if (high > 0) console.log(chalk.yellow(`  🟠 High: ${high}`));

  const withKB = incidents.filter(i => i.kbMatch).length;
  if (withKB > 0) console.log(chalk.blue(`  📚 KB matches: ${withKB} (known patterns)`));
}

// Run
main().catch(err => {
  console.error(chalk.red(`\n💥 Agent crashed: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
