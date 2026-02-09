import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', 'config', '.env') });

import express, { Request, Response } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { spawn, ChildProcess } from 'child_process';
import { KnowledgeBase } from '../knowledgebase/kb';
import { generateJiraTicket, JiraTicket } from '../jira/ticket-generator';
import { Incident, Environment, Severity, SlackStatus, IssueDomain, SiteConfig, AgentConfig } from '../models/incident';
import { SlackBot } from '../slack/slack-bot';
import { classifyErrors } from '../classifier/classifier';

// Track running scans
interface ScanJob {
  id: string;
  siteName: string | 'all';
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
  process?: ChildProcess;
  output: string[];
}

const runningScans: Map<string, ScanJob> = new Map();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || './data';

// Initialize database for incidents
let incidentsDb: Database.Database;
let kb: KnowledgeBase;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize databases
function initializeDatabases(): void {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initialize incidents database
  const incidentsDbPath = path.join(DATA_DIR, 'incidents.db');
  incidentsDb = new Database(incidentsDbPath);
  incidentsDb.pragma('journal_mode = WAL');

  // Create incidents table
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
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(impact_score);
    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
    CREATE INDEX IF NOT EXISTS idx_incidents_slack_status ON incidents(slack_status);
  `);

  // Migration: Add slack_status and slack_error columns if they don't exist
  try {
    incidentsDb.exec(`ALTER TABLE incidents ADD COLUMN slack_status TEXT DEFAULT 'pending'`);
  } catch (e) { /* column already exists */ }
  try {
    incidentsDb.exec(`ALTER TABLE incidents ADD COLUMN slack_error TEXT`);
  } catch (e) { /* column already exists */ }

  // Migrate existing data: if slack_message_ts exists, set status to 'sent'
  incidentsDb.exec(`
    UPDATE incidents
    SET slack_status = 'sent'
    WHERE slack_message_ts IS NOT NULL AND slack_message_ts != '' AND (slack_status IS NULL OR slack_status = 'pending')
  `);

  // Initialize knowledge base
  kb = new KnowledgeBase(DATA_DIR);

  // Create settings table for AI configuration
  incidentsDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

// Slack workspace URL for generating message links
const SLACK_WORKSPACE_URL = process.env.SLACK_WORKSPACE_URL || '';

// Helper function to generate Slack message URL
function generateSlackMessageUrl(channel: string, messageTs: string): string | undefined {
  if (!channel || !messageTs || !SLACK_WORKSPACE_URL) return undefined;
  // Slack message URLs use the format: https://workspace.slack.com/archives/CHANNEL/pTIMESTAMP
  // The timestamp needs to have the dot removed
  const tsForUrl = messageTs.replace('.', '');
  return `${SLACK_WORKSPACE_URL}/archives/${channel}/p${tsForUrl}`;
}

// Helper function to convert DB row to Incident object
function rowToIncident(row: any): Incident {
  const slackMessageUrl = generateSlackMessageUrl(row.slack_channel, row.slack_message_ts);

  return {
    incidentId: row.id,
    scanId: row.scan_id,
    siteName: row.site_name,
    siteUrl: row.site_url,
    environment: row.environment as Environment,
    timestamp: row.timestamp,
    errorSummary: row.error_summary,
    errorDetail: row.error_detail,
    affectedPage: row.affected_page,
    classification: row.classification_json ? JSON.parse(row.classification_json) : {},
    impactScore: row.impact_score,
    kbMatch: row.kb_match_json ? JSON.parse(row.kb_match_json) : undefined,
    suggestedFix: row.suggested_fix,
    status: row.status,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    slackMessageTs: row.slack_message_ts,
    slackChannel: row.slack_channel,
    slackStatus: (row.slack_status as SlackStatus) || 'pending',
    slackError: row.slack_error,
    slackMessageUrl,
    networkErrors: row.network_errors_json ? JSON.parse(row.network_errors_json) : [],
    consoleErrors: row.console_errors_json ? JSON.parse(row.console_errors_json) : [],
    visualIssues: row.visual_issues_json ? JSON.parse(row.visual_issues_json) : [],
    screenshotPath: row.screenshot_path,
  };
}

// Helper function to convert Incident to DB row
function incidentToRow(incident: Incident): any {
  return {
    id: incident.incidentId,
    scan_id: incident.scanId,
    site_name: incident.siteName,
    site_url: incident.siteUrl,
    environment: incident.environment,
    timestamp: incident.timestamp,
    error_summary: incident.errorSummary,
    error_detail: incident.errorDetail,
    affected_page: incident.affectedPage,
    classification_json: JSON.stringify(incident.classification),
    impact_score: incident.impactScore,
    kb_match_json: incident.kbMatch ? JSON.stringify(incident.kbMatch) : null,
    suggested_fix: incident.suggestedFix,
    status: incident.status,
    resolved_by: incident.resolvedBy,
    resolved_at: incident.resolvedAt,
    resolution: incident.resolution,
    slack_message_ts: incident.slackMessageTs,
    slack_channel: incident.slackChannel,
    slack_status: incident.slackStatus || 'pending',
    slack_error: incident.slackError,
    network_errors_json: JSON.stringify(incident.networkErrors),
    console_errors_json: JSON.stringify(incident.consoleErrors),
    visual_issues_json: JSON.stringify(incident.visualIssues),
    screenshot_path: incident.screenshotPath,
  };
}

// Serve static React dashboard
// When running from dist, we need to reference src/dashboard/public for static files
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', '..', 'src', 'dashboard', 'public');
app.use(express.static(publicDir));

// REST API Endpoints

// GET /api/incidents - List all incidents
app.get('/api/incidents', (req: Request, res: Response) => {
  try {
    const { site, severity, status, limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10) || 50;

    let query = 'SELECT * FROM incidents WHERE 1=1';
    const params: any[] = [];

    if (site) {
      query += ' AND site_name = ?';
      params.push(site);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limitNum);

    const stmt = incidentsDb.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Filter by severity if needed (since it's computed from impact score)
    let incidents = rows.map(rowToIncident);
    if (severity) {
      incidents = incidents.filter((inc) => {
        const sevMap = getSeverityFromImpactScore(inc.impactScore);
        return sevMap === severity;
      });
    }

    res.json({
      incidents,
      total: incidents.length,
    });
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// GET /api/incidents/:id - Get single incident
app.get('/api/incidents/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = incidentsDb.prepare('SELECT * FROM incidents WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = rowToIncident(row);
    res.json(incident);
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// GET /api/incidents/:id/jira - Get Jira ticket content
app.get('/api/incidents/:id/jira', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = incidentsDb.prepare('SELECT * FROM incidents WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = rowToIncident(row);
    const jiraTicket = generateJiraTicket(incident);

    res.json(jiraTicket);
  } catch (error) {
    console.error('Error generating Jira ticket:', error);
    res.status(500).json({ error: 'Failed to generate Jira ticket' });
  }
});

// GET /api/sites - List all configured sites with health summary
app.get('/api/sites', (req: Request, res: Response) => {
  try {
    const sitesStmt = incidentsDb.prepare(
      'SELECT DISTINCT site_name, site_url, environment FROM incidents ORDER BY site_name'
    );
    const sites = sitesStmt.all() as any[];

    const siteSummaries = sites.map((site) => {
      const countStmt = incidentsDb.prepare(
        'SELECT COUNT(*) as total FROM incidents WHERE site_name = ?'
      );
      const statusResult = countStmt.get(site.site_name) as any;

      const criticalStmt = incidentsDb.prepare(
        'SELECT COUNT(*) as critical FROM incidents WHERE site_name = ? AND impact_score >= 80'
      );
      const criticalResult = criticalStmt.get(site.site_name) as any;

      const lastScanStmt = incidentsDb.prepare(
        'SELECT timestamp FROM incidents WHERE site_name = ? ORDER BY timestamp DESC LIMIT 1'
      );
      const lastScanResult = lastScanStmt.get(site.site_name) as any;

      return {
        name: site.site_name,
        url: site.site_url,
        environment: site.environment,
        totalIncidents: statusResult.total,
        criticalCount: criticalResult.critical,
        lastScanTime: lastScanResult?.timestamp || null,
      };
    });

    res.json(siteSummaries);
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// GET /api/kb/stats - Knowledge base statistics
app.get('/api/kb/stats', (req: Request, res: Response) => {
  try {
    const stats = kb.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching KB stats:', error);
    res.status(500).json({ error: 'Failed to fetch KB stats' });
  }
});

// GET /api/kb/entries - List KB entries
app.get('/api/kb/entries', (req: Request, res: Response) => {
  try {
    const { resolved, limit = '50' } = req.query;
    const limitNum = parseInt(limit as string, 10) || 50;

    let entries = kb.getAllEntries(limitNum);

    if (resolved !== undefined) {
      const isResolved = resolved === 'true';
      entries = entries.filter((e) => e.isResolved === isResolved);
    }

    res.json(entries);
  } catch (error) {
    console.error('Error fetching KB entries:', error);
    res.status(500).json({ error: 'Failed to fetch KB entries' });
  }
});

// POST /api/incidents/:id/resolve - Mark incident as resolved
app.post('/api/incidents/:id/resolve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution, resolvedBy } = req.body;

    if (!resolution || !resolvedBy) {
      return res.status(400).json({ error: 'Missing required fields: resolution, resolvedBy' });
    }

    const now = new Date().toISOString();

    // Update incident
    const updateStmt = incidentsDb.prepare(
      `UPDATE incidents
       SET status = 'resolved', resolved_by = ?, resolved_at = ?, resolution = ?
       WHERE id = ?`
    );
    updateStmt.run(resolvedBy, now, resolution, id);

    // Get incident to update KB
    const getStmt = incidentsDb.prepare('SELECT * FROM incidents WHERE id = ?');
    const row = getStmt.get(id) as any;

    if (row) {
      const incident = rowToIncident(row);
      // Try to resolve the KB entry if there's a match
      if (incident.kbMatch) {
        kb.resolveEntry(incident.kbMatch.matchId, resolution, resolvedBy);
      }
    }

    res.json({ success: true, message: 'Incident resolved' });
  } catch (error) {
    console.error('Error resolving incident:', error);
    res.status(500).json({ error: 'Failed to resolve incident' });
  }
});

// POST /api/incidents/:id/false-positive - Mark as false positive
app.post('/api/incidents/:id/false-positive', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updateStmt = incidentsDb.prepare(
      "UPDATE incidents SET status = 'false_positive', slack_status = 'skipped' WHERE id = ?"
    );
    updateStmt.run(id);

    res.json({ success: true, message: 'Incident marked as false positive' });
  } catch (error) {
    console.error('Error marking false positive:', error);
    res.status(500).json({ error: 'Failed to mark false positive' });
  }
});

// POST /api/incidents/:id/resend-slack - Resend Slack notification
app.post('/api/incidents/:id/resend-slack', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the incident
    const getStmt = incidentsDb.prepare('SELECT * FROM incidents WHERE id = ?');
    const row = getStmt.get(id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = rowToIncident(row);

    // Re-classify to add domain if missing
    if (!incident.classification.domain || incident.classification.domain === 'UNKNOWN') {
      const classifications = classifyErrors(
        incident.networkErrors || [],
        incident.consoleErrors || []
      );
      if (classifications.length > 0) {
        const newClassification = classifications[0];
        incident.classification = {
          ...incident.classification,
          domain: newClassification.domain,
          sourceSystem: newClassification.sourceSystem,
          domainReasoning: newClassification.domainReasoning,
        };

        // Update the database with new classification
        const updateClassStmt = incidentsDb.prepare(`
          UPDATE incidents SET classification_json = ? WHERE id = ?
        `);
        updateClassStmt.run(JSON.stringify(incident.classification), id);
      }
    }

    // Initialize Slack bot
    const slackBot = new SlackBot();

    // Get KB match if available
    let kbMatch = incident.kbMatch;
    if (!kbMatch) {
      const match = kb.findMatch(incident.errorSummary, incident.errorDetail);
      if (match) {
        kbMatch = {
          matchId: match.entryId,
          patternId: match.entryId,
          patternName: match.patternName,
          similarity: match.similarity * 100,
          previousOccurrences: match.occurrences,
          lastSeen: match.lastSeen,
          knownResolution: match.resolution,
        };
      }
    }

    // Determine channel
    const channel = incident.slackChannel || process.env.DEFAULT_SLACK_CHANNEL || '#agent-fe-alerts';

    // Send alert - throws on error, returns message timestamp on success
    const result = await slackBot.sendIncidentAlert(incident, channel, kbMatch as any);

    if (!result) {
      throw new Error('No message timestamp returned from Slack');
    }

    // Success - update database
    const updateStmt = incidentsDb.prepare(`
      UPDATE incidents
      SET slack_status = 'sent',
          slack_message_ts = ?,
          slack_channel = ?,
          slack_error = NULL
      WHERE id = ?
    `);
    updateStmt.run(result, channel, id);

    const slackMessageUrl = generateSlackMessageUrl(channel, result);

    slackBot.close();

    res.json({
      success: true,
      message: 'Slack notification sent successfully',
      slackMessageTs: result,
      slackChannel: channel,
      slackMessageUrl,
    });
  } catch (error: any) {
    console.error('Error resending Slack notification:', error);

    // Update status to failed
    const updateStmt = incidentsDb.prepare(`
      UPDATE incidents
      SET slack_status = 'failed',
          slack_error = ?
      WHERE id = ?
    `);
    updateStmt.run(error.message || 'Unknown error', req.params.id);

    res.status(500).json({ error: 'Failed to resend Slack notification', details: error.message });
  }
});

// POST /api/incidents/send-all-pending-slack - Send Slack notifications for all pending incidents
app.post('/api/incidents/send-all-pending-slack', async (req: Request, res: Response) => {
  try {
    // Get all pending and failed incidents
    const getStmt = incidentsDb.prepare(`
      SELECT * FROM incidents
      WHERE slack_status IN ('pending', 'failed')
      AND status != 'false_positive'
      ORDER BY timestamp DESC
    `);
    const rows = getStmt.all() as any[];

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: 'No pending incidents to send',
        sent: 0,
        failed: 0,
        results: [],
      });
    }

    // Initialize Slack bot once for all messages
    const slackBot = new SlackBot();
    const results: Array<{ incidentId: string; success: boolean; error?: string }> = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      const incident = rowToIncident(row);

      try {
        // Re-classify to add domain if missing
        if (!incident.classification.domain || incident.classification.domain === 'UNKNOWN') {
          const classifications = classifyErrors(
            incident.networkErrors || [],
            incident.consoleErrors || []
          );
          if (classifications.length > 0) {
            const newClassification = classifications[0];
            incident.classification = {
              ...incident.classification,
              domain: newClassification.domain,
              sourceSystem: newClassification.sourceSystem,
              domainReasoning: newClassification.domainReasoning,
            };

            // Update the database with new classification
            const updateClassStmt = incidentsDb.prepare(`
              UPDATE incidents SET classification_json = ? WHERE id = ?
            `);
            updateClassStmt.run(JSON.stringify(incident.classification), incident.incidentId);
          }
        }

        // Get KB match if available
        let kbMatch = incident.kbMatch;
        if (!kbMatch) {
          const match = kb.findMatch(incident.errorSummary, incident.errorDetail);
          if (match) {
            kbMatch = {
              matchId: match.entryId,
              patternId: match.entryId,
              patternName: match.patternName,
              similarity: match.similarity * 100,
              previousOccurrences: match.occurrences,
              lastSeen: match.lastSeen,
              knownResolution: match.resolution,
            };
          }
        }

        // Determine channel
        const channel = incident.slackChannel || process.env.DEFAULT_SLACK_CHANNEL || '#agent-fe-alerts';

        // Send alert
        const messageTs = await slackBot.sendIncidentAlert(incident, channel, kbMatch as any);

        if (messageTs) {
          // Success - update database
          const updateStmt = incidentsDb.prepare(`
            UPDATE incidents
            SET slack_status = 'sent',
                slack_message_ts = ?,
                slack_channel = ?,
                slack_error = NULL
            WHERE id = ?
          `);
          updateStmt.run(messageTs, channel, incident.incidentId);

          results.push({ incidentId: incident.incidentId, success: true });
          sentCount++;
        } else {
          throw new Error('No message timestamp returned');
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        // Update status to failed
        const updateStmt = incidentsDb.prepare(`
          UPDATE incidents
          SET slack_status = 'failed',
              slack_error = ?
          WHERE id = ?
        `);
        updateStmt.run(error.message || 'Unknown error', incident.incidentId);

        results.push({ incidentId: incident.incidentId, success: false, error: error.message });
        failedCount++;
      }
    }

    slackBot.close();

    res.json({
      success: true,
      message: `Sent ${sentCount} notifications, ${failedCount} failed`,
      sent: sentCount,
      failed: failedCount,
      total: rows.length,
      results,
    });
  } catch (error: any) {
    console.error('Error sending bulk Slack notifications:', error);
    res.status(500).json({ error: 'Failed to send bulk Slack notifications', details: error.message });
  }
});

// GET /api/settings - Get all settings
app.get('/api/settings', (req: Request, res: Response) => {
  try {
    const stmt = incidentsDb.prepare('SELECT key, value FROM settings');
    const rows = stmt.all() as { key: string; value: string }[];

    const settings: Record<string, string> = {};
    for (const row of rows) {
      // Mask API keys for security - only show last 4 chars
      if (row.key === 'ai_api_key' && row.value.length > 8) {
        settings[row.key] = '••••••••' + row.value.slice(-4);
        settings['ai_api_key_set'] = 'true';
      } else {
        settings[row.key] = row.value;
      }
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings - Save settings
app.post('/api/settings', (req: Request, res: Response) => {
  try {
    const { ai_provider, ai_api_key } = req.body;
    const now = new Date().toISOString();

    const upsertStmt = incidentsDb.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (ai_provider) {
      upsertStmt.run('ai_provider', ai_provider, now);
    }

    // Only update API key if provided (not masked value)
    if (ai_api_key && !ai_api_key.startsWith('••••')) {
      upsertStmt.run('ai_api_key', ai_api_key, now);
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// GET /api/settings/ai-key - Get raw AI API key (for internal use by classifier)
app.get('/api/settings/ai-key', (req: Request, res: Response) => {
  try {
    const providerStmt = incidentsDb.prepare("SELECT value FROM settings WHERE key = 'ai_provider'");
    const keyStmt = incidentsDb.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'");

    const providerRow = providerStmt.get() as { value: string } | undefined;
    const keyRow = keyStmt.get() as { value: string } | undefined;

    res.json({
      provider: providerRow?.value || 'anthropic',
      apiKey: keyRow?.value || null,
    });
  } catch (error) {
    console.error('Error fetching AI key:', error);
    res.status(500).json({ error: 'Failed to fetch AI key' });
  }
});

// ─── Scan API Endpoints ─────────────────────────────────────────────────

// Load sites configuration
function loadSitesConfig(): AgentConfig {
  const defaultConfig: AgentConfig = {
    sites: [],
    scan_settings: {
      scheduled_interval_minutes: 30,
      screenshot_on_error: true,
      viewport: { width: 1440, height: 900 },
      mobile_viewport: { width: 375, height: 812 },
      timeout_ms: 30000,
      max_retries: 2,
    },
  };

  const sitesPath = path.join(__dirname, '..', '..', 'config', 'sites.yaml');
  if (!fs.existsSync(sitesPath)) {
    // Try from src directory
    const srcSitesPath = path.join(__dirname, '..', 'config', 'sites.yaml');
    if (fs.existsSync(srcSitesPath)) {
      const content = fs.readFileSync(srcSitesPath, 'utf-8');
      return yaml.parse(content) as AgentConfig;
    }
    return defaultConfig;
  }
  const content = fs.readFileSync(sitesPath, 'utf-8');
  return yaml.parse(content) as AgentConfig;
}

// GET /api/scan/sites - Get list of configured sites for scanning
app.get('/api/scan/sites', (req: Request, res: Response) => {
  try {
    const config = loadSitesConfig();
    res.json({
      sites: config.sites.map(site => ({
        name: site.name,
        url: site.url,
        environment: site.environment,
        backend_type: site.backend_type,
        scan_flows: site.scan_flows,
      })),
    });
  } catch (error) {
    console.error('Error loading sites config:', error);
    res.status(500).json({ error: 'Failed to load sites configuration' });
  }
});

// GET /api/scan/status - Get status of all running/recent scans
app.get('/api/scan/status', (req: Request, res: Response) => {
  try {
    const scans = Array.from(runningScans.values()).map(scan => ({
      id: scan.id,
      siteName: scan.siteName,
      status: scan.status,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      error: scan.error,
      outputLines: scan.output.slice(-20), // Last 20 lines
    }));
    res.json({ scans });
  } catch (error) {
    console.error('Error fetching scan status:', error);
    res.status(500).json({ error: 'Failed to fetch scan status' });
  }
});

// GET /api/scan/status/:scanId - Get status of a specific scan
app.get('/api/scan/status/:scanId', (req: Request, res: Response) => {
  try {
    const scanId = req.params.scanId as string;
    const scan = runningScans.get(scanId);

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({
      id: scan.id,
      siteName: scan.siteName,
      status: scan.status,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      error: scan.error,
      output: scan.output,
    });
  } catch (error) {
    console.error('Error fetching scan status:', error);
    res.status(500).json({ error: 'Failed to fetch scan status' });
  }
});

// POST /api/scan - Start a full scan of all sites
app.post('/api/scan', (req: Request, res: Response) => {
  try {
    // Check if a scan is already running
    const runningScan = Array.from(runningScans.values()).find(s => s.status === 'running');
    if (runningScan) {
      return res.status(409).json({
        error: 'A scan is already running',
        scanId: runningScan.id,
        siteName: runningScan.siteName,
      });
    }

    const scanId = `scan-${Date.now()}`;
    const scanJob: ScanJob = {
      id: scanId,
      siteName: 'all',
      status: 'running',
      startedAt: new Date().toISOString(),
      output: [],
    };

    // Spawn the scan process
    const projectRoot = path.join(__dirname, '..', '..');
    const scanProcess = spawn('node', ['dist/index.js'], {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    scanJob.process = scanProcess;

    scanProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      scanJob.output.push(...lines);
      // Keep only last 100 lines
      if (scanJob.output.length > 100) {
        scanJob.output = scanJob.output.slice(-100);
      }
    });

    scanProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      scanJob.output.push(...lines.map((l: string) => `[ERROR] ${l}`));
    });

    scanProcess.on('close', (code) => {
      scanJob.status = code === 0 ? 'completed' : 'failed';
      scanJob.completedAt = new Date().toISOString();
      if (code !== 0) {
        scanJob.error = `Process exited with code ${code}`;
      }
      scanJob.process = undefined;
    });

    scanProcess.on('error', (err) => {
      scanJob.status = 'failed';
      scanJob.completedAt = new Date().toISOString();
      scanJob.error = err.message;
      scanJob.process = undefined;
    });

    runningScans.set(scanId, scanJob);

    // Clean up old scans (keep last 10)
    const scanIds = Array.from(runningScans.keys());
    if (scanIds.length > 10) {
      const toDelete = scanIds.slice(0, scanIds.length - 10);
      toDelete.forEach(id => {
        const scan = runningScans.get(id);
        if (scan?.process) {
          scan.process.kill();
        }
        runningScans.delete(id);
      });
    }

    res.json({
      success: true,
      message: 'Scan started',
      scanId,
      siteName: 'all',
    });
  } catch (error: any) {
    console.error('Error starting scan:', error);
    res.status(500).json({ error: 'Failed to start scan', details: error.message });
  }
});

// POST /api/scan/:siteName - Start a scan for a specific site
app.post('/api/scan/:siteName', (req: Request, res: Response) => {
  try {
    const siteName = req.params.siteName as string;

    // Validate site exists
    const config = loadSitesConfig();
    const site = config.sites.find(s => s.name.toLowerCase() === siteName.toLowerCase());

    if (!site) {
      return res.status(404).json({ error: `Site '${siteName}' not found in configuration` });
    }

    // Check if a scan is already running
    const runningScan = Array.from(runningScans.values()).find(s => s.status === 'running');
    if (runningScan) {
      return res.status(409).json({
        error: 'A scan is already running',
        scanId: runningScan.id,
        siteName: runningScan.siteName,
      });
    }

    const scanId = `scan-${Date.now()}`;
    const scanJob: ScanJob = {
      id: scanId,
      siteName: site.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: [],
    };

    // Create a temporary script to scan just this site
    const projectRoot = path.join(__dirname, '..', '..');
    const scanScript = `
      const { PlaywrightScanner } = require('./dist/scanner/scanner');
      const { classifyErrors } = require('./dist/classifier/classifier');
      const { classifyWithLLM } = require('./dist/classifier/llm-classifier');
      const { KnowledgeBase } = require('./dist/knowledgebase/kb');
      const { calculateImpact } = require('./dist/scoring/impact');
      const Database = require('better-sqlite3');
      const { v4: uuidv4 } = require('uuid');
      const path = require('path');

      async function scanSingleSite() {
        const site = ${JSON.stringify(site)};
        console.log('Starting scan for:', site.name);

        const scanner = new PlaywrightScanner();
        const kb = new KnowledgeBase();
        const DATA_DIR = process.env.DATA_DIR || './data';
        const incidentsDb = new Database(path.join(DATA_DIR, 'incidents.db'));

        try {
          const result = await scanner.scanSite(site);
          console.log('Scan completed for:', site.name);
          console.log('Network errors:', result.networkErrors.length);
          console.log('Console errors:', result.consoleErrors.length);

          // Process results
          if (result.networkErrors.length > 0 || result.consoleErrors.length > 0) {
            const classifications = classifyErrors(result.networkErrors, result.consoleErrors);
            console.log('Classifications:', classifications.length);

            // Create incidents
            for (let i = 0; i < Math.min(classifications.length, 10); i++) {
              const cls = classifications[i];
              const impact = calculateImpact(
                result.networkErrors.slice(i, i + 1),
                result.consoleErrors.slice(i, i + 1),
                [],
                site.url
              );

              const incident = {
                id: 'INC-' + Date.now() + '-' + uuidv4().slice(0, 6),
                scan_id: result.scanId,
                site_name: site.name,
                site_url: site.url,
                environment: site.environment,
                timestamp: new Date().toISOString(),
                error_summary: result.networkErrors[i]?.url || result.consoleErrors[i]?.text?.slice(0, 100) || 'Unknown',
                error_detail: JSON.stringify(result.networkErrors[i] || result.consoleErrors[i]),
                affected_page: site.url,
                classification_json: JSON.stringify(cls),
                impact_score: impact.score,
                status: 'open',
                slack_status: 'pending',
                network_errors_json: JSON.stringify(result.networkErrors.slice(i, i + 1)),
                console_errors_json: JSON.stringify(result.consoleErrors.slice(i, i + 1)),
                visual_issues_json: '[]',
              };

              const stmt = incidentsDb.prepare(\`
                INSERT OR REPLACE INTO incidents (
                  id, scan_id, site_name, site_url, environment, timestamp,
                  error_summary, error_detail, affected_page, classification_json,
                  impact_score, status, slack_status, network_errors_json,
                  console_errors_json, visual_issues_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              \`);

              stmt.run(
                incident.id, incident.scan_id, incident.site_name, incident.site_url,
                incident.environment, incident.timestamp, incident.error_summary,
                incident.error_detail, incident.affected_page, incident.classification_json,
                incident.impact_score, incident.status, incident.slack_status,
                incident.network_errors_json, incident.console_errors_json, incident.visual_issues_json
              );

              console.log('Incident saved:', incident.id);
            }
          }

          console.log('Scan complete!');
        } catch (err) {
          console.error('Scan failed:', err);
          process.exit(1);
        } finally {
          await scanner.cleanup();
          incidentsDb.close();
        }
      }

      scanSingleSite();
    `;

    const tempScriptPath = path.join(projectRoot, 'temp-scan.js');
    fs.writeFileSync(tempScriptPath, scanScript);

    const scanProcess = spawn('node', ['temp-scan.js'], {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    scanJob.process = scanProcess;

    scanProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      scanJob.output.push(...lines);
      if (scanJob.output.length > 100) {
        scanJob.output = scanJob.output.slice(-100);
      }
    });

    scanProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim());
      scanJob.output.push(...lines.map((l: string) => `[ERROR] ${l}`));
    });

    scanProcess.on('close', (code) => {
      scanJob.status = code === 0 ? 'completed' : 'failed';
      scanJob.completedAt = new Date().toISOString();
      if (code !== 0) {
        scanJob.error = `Process exited with code ${code}`;
      }
      scanJob.process = undefined;
      // Clean up temp script
      try { fs.unlinkSync(tempScriptPath); } catch {}
    });

    scanProcess.on('error', (err) => {
      scanJob.status = 'failed';
      scanJob.completedAt = new Date().toISOString();
      scanJob.error = err.message;
      scanJob.process = undefined;
      try { fs.unlinkSync(tempScriptPath); } catch {}
    });

    runningScans.set(scanId, scanJob);

    res.json({
      success: true,
      message: `Scan started for ${site.name}`,
      scanId,
      siteName: site.name,
    });
  } catch (error: any) {
    console.error('Error starting site scan:', error);
    res.status(500).json({ error: 'Failed to start scan', details: error.message });
  }
});

// DELETE /api/scan/:scanId - Stop a running scan
app.delete('/api/scan/:scanId', (req: Request, res: Response) => {
  try {
    const scanId = req.params.scanId as string;
    const scan = runningScans.get(scanId);

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    if (scan.status !== 'running') {
      return res.status(400).json({ error: 'Scan is not running' });
    }

    if (scan.process) {
      scan.process.kill('SIGTERM');
      scan.status = 'failed';
      scan.completedAt = new Date().toISOString();
      scan.error = 'Scan was stopped by user';
      scan.process = undefined;
    }

    res.json({ success: true, message: 'Scan stopped' });
  } catch (error: any) {
    console.error('Error stopping scan:', error);
    res.status(500).json({ error: 'Failed to stop scan', details: error.message });
  }
});

// GET /api/dashboard/summary - Dashboard overview
app.get('/api/dashboard/summary', (req: Request, res: Response) => {
  try {
    const totalOpenStmt = incidentsDb.prepare(
      "SELECT COUNT(*) as count FROM incidents WHERE status = 'open'"
    );
    const totalOpen = (totalOpenStmt.get() as any).count;

    const totalResolvedStmt = incidentsDb.prepare(
      "SELECT COUNT(*) as count FROM incidents WHERE status = 'resolved'"
    );
    const totalResolved = (totalResolvedStmt.get() as any).count;

    // Get per-site breakdown
    const siteBreakdownStmt = incidentsDb.prepare(`
      SELECT site_name,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open
      FROM incidents
      GROUP BY site_name
    `);
    const siteBreakdown = siteBreakdownStmt.all() as any[];

    // Get severity distribution
    const severityStmt = incidentsDb.prepare(`
      SELECT
        SUM(CASE WHEN impact_score >= 80 THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN impact_score >= 60 AND impact_score < 80 THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN impact_score >= 40 AND impact_score < 60 THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN impact_score < 40 THEN 1 ELSE 0 END) as low
      FROM incidents
    `);
    const severityDist = severityStmt.get() as any;

    // Top issues
    const topIssuesStmt = incidentsDb.prepare(`
      SELECT error_summary, COUNT(*) as occurrences, MAX(impact_score) as max_impact
      FROM incidents
      GROUP BY error_summary
      ORDER BY occurrences DESC
      LIMIT 10
    `);
    const topIssues = topIssuesStmt.all() as any[];

    // KB match rate
    const kbMatchStmt = incidentsDb.prepare(
      "SELECT COUNT(*) as matched FROM incidents WHERE kb_match_json IS NOT NULL AND kb_match_json != 'null'"
    );
    const kbMatched = (kbMatchStmt.get() as any).matched;
    const totalIncidents = totalOpen + totalResolved;
    const kbMatchRate = totalIncidents > 0 ? ((kbMatched / totalIncidents) * 100).toFixed(2) : '0.00';

    // Slack notification stats
    const slackStatsStmt = incidentsDb.prepare(`
      SELECT
        SUM(CASE WHEN slack_status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN slack_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN slack_status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN slack_status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM incidents
    `);
    const slackStats = slackStatsStmt.get() as any;

    res.json({
      totalIncidents: {
        open: totalOpen,
        resolved: totalResolved,
        total: totalIncidents,
      },
      siteBreakdown,
      severityDistribution: {
        critical: severityDist.critical || 0,
        high: severityDist.high || 0,
        medium: severityDist.medium || 0,
        low: severityDist.low || 0,
      },
      topIssues,
      kbMatchRate: parseFloat(kbMatchRate),
      slackNotifications: {
        sent: slackStats.sent || 0,
        pending: slackStats.pending || 0,
        failed: slackStats.failed || 0,
        skipped: slackStats.skipped || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Helper function to determine severity from impact score
function getSeverityFromImpactScore(impactScore: number): Severity {
  if (impactScore >= 80) return 'critical';
  if (impactScore >= 60) return 'high';
  if (impactScore >= 40) return 'medium';
  if (impactScore >= 20) return 'low';
  return 'info';
}

// Serve React app for all other routes
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Initialize and start server
initializeDatabases();

const server = app.listen(PORT, () => {
  console.log('');
  console.log('🌐 Dashboard running at http://localhost:' + PORT);
  console.log('📊 API available at http://localhost:' + PORT + '/api');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (incidentsDb) incidentsDb.close();
    if (kb) kb.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (incidentsDb) incidentsDb.close();
    if (kb) kb.close();
    process.exit(0);
  });
});

export default app;
