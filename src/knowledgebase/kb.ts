import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Incident } from '../models/incident';
import { KBEntry, KBStats, KnownFailurePattern } from '../models/knowledge-base';

export interface KBMatch {
  entryId: string;
  patternName: string;
  similarity: number;
  occurrences: number;
  lastSeen: string;
  resolution?: string;
  suggestedFix?: string;
}

export class KnowledgeBase {
  private db: Database.Database;
  private dbPath: string;
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'knowledge-base.db');

    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeTables();
    this.seedFromConfig();
  }

  private initializeTables(): void {
    // Create kb_entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kb_entries (
        id TEXT PRIMARY KEY,
        error_signature TEXT NOT NULL UNIQUE,
        error_category TEXT,
        error_detail TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        occurrence_count INTEGER DEFAULT 1,
        affected_stores TEXT,
        affected_pages TEXT,
        severity TEXT,
        impact_score REAL,
        is_resolved INTEGER DEFAULT 0,
        resolution TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        sample_error TEXT,
        sample_screenshot TEXT,
        ai_analysis TEXT,
        suggested_fix TEXT
      );

      CREATE TABLE IF NOT EXISTS kb_resolutions (
        id TEXT PRIMARY KEY,
        kb_entry_id TEXT NOT NULL,
        resolution_text TEXT NOT NULL,
        resolved_by TEXT,
        resolved_at TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (kb_entry_id) REFERENCES kb_entries(id)
      );

      CREATE INDEX IF NOT EXISTS idx_kb_entries_signature ON kb_entries(error_signature);
      CREATE INDEX IF NOT EXISTS idx_kb_entries_category ON kb_entries(error_category);
      CREATE INDEX IF NOT EXISTS idx_kb_entries_resolved ON kb_entries(is_resolved);
      CREATE INDEX IF NOT EXISTS idx_kb_resolutions_entry ON kb_resolutions(kb_entry_id);
    `);
  }

  private seedFromConfig(): void {
    const configPath = path.join(process.cwd(), 'config', 'known_failures.yaml');

    if (!fs.existsSync(configPath)) {
      return; // Config file doesn't exist yet, skip seeding
    }

    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const config = yaml.parse(fileContent) as { patterns?: KnownFailurePattern[] };

      if (config.patterns && Array.isArray(config.patterns)) {
        for (const pattern of config.patterns) {
          const existingStmt = this.db.prepare(
            'SELECT id FROM kb_entries WHERE error_signature = ?'
          );
          const existing = existingStmt.get(pattern.pattern);

          if (!existing) {
            const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date().toISOString();

            const insertStmt = this.db.prepare(`
              INSERT INTO kb_entries (
                id, error_signature, error_category, error_detail,
                first_seen, last_seen, occurrence_count,
                affected_stores, affected_pages, severity, impact_score,
                is_resolved, resolution, suggested_fix, ai_analysis
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insertStmt.run(
              id,
              pattern.pattern,
              pattern.error_type || 'unknown',
              pattern.description || '',
              now,
              now,
              0,
              JSON.stringify(pattern.affected_stores || []),
              JSON.stringify([]),
              pattern.severity || 'medium',
              pattern.impact_score || 0.5,
              0,
              '',
              pattern.suggested_fix || '',
              ''
            );
          }
        }
      }
    } catch (error) {
      console.warn('Failed to seed knowledge base from config:', error);
    }
  }

  private normalizeErrorSignature(errorSignature: string): string {
    // Remove timestamps (ISO 8601 and common formats)
    let normalized = errorSignature.replace(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[Z.][\d]*Z?/g,
      '[TIMESTAMP]'
    );

    // Remove UUIDs and GUIDs
    normalized = normalized.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '[UUID]'
    );

    // Remove hash values (40 char hex, 64 char hex)
    normalized = normalized.replace(/\b[a-f0-9]{40}\b/gi, '[HASH]');
    normalized = normalized.replace(/\b[a-f0-9]{64}\b/gi, '[HASH64]');

    // Remove numeric IDs (consecutive digits)
    normalized = normalized.replace(/\b\d{6,}\b/g, '[ID]');

    // Remove session/request IDs
    normalized = normalized.replace(/([Ss]ession|[Rr]equest)[_-]?[Ii]d[:\s]*[\w]+/g, '[SESSION_ID]');

    // Remove IP addresses
    normalized = normalized.replace(
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      '[IP_ADDRESS]'
    );

    return normalized.toLowerCase().trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein-inspired similarity calculation
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.includes(shorter)) return shorter.length / longer.length;

    const editDistance = this.levenshteinDistance(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);

    return 1 - editDistance / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const track = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(0));

    for (let i = 0; i <= str1.length; i += 1) {
      track[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j += 1) {
      track[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }

    return track[str2.length][str1.length];
  }

  public findMatch(
    errorSignature: string,
    errorDetail: string
  ): KBMatch | null {
    const normalizedSignature = this.normalizeErrorSignature(errorSignature);

    // Try exact signature match first
    const exactStmt = this.db.prepare(
      `SELECT id, error_signature, error_category, occurrence_count, last_seen, resolution, suggested_fix
       FROM kb_entries WHERE error_signature = ?`
    );
    const exactMatch = exactStmt.get(errorSignature) as any;

    if (exactMatch) {
      return {
        entryId: exactMatch.id,
        patternName: exactMatch.error_category,
        similarity: 1.0,
        occurrences: exactMatch.occurrence_count,
        lastSeen: exactMatch.last_seen,
        resolution: exactMatch.resolution,
        suggestedFix: exactMatch.suggested_fix,
      };
    }

    // Try normalized signature match
    const allEntriesStmt = this.db.prepare(
      `SELECT id, error_signature, error_category, occurrence_count, last_seen, resolution, suggested_fix
       FROM kb_entries`
    );
    const allEntries = allEntriesStmt.all() as any[];

    let bestMatch: KBMatch | null = null;
    let bestSimilarity = 0.7; // Threshold for fuzzy match

    for (const entry of allEntries) {
      const normalizedEntrySignature = this.normalizeErrorSignature(
        entry.error_signature
      );
      const similarity = this.calculateSimilarity(
        normalizedSignature,
        normalizedEntrySignature
      );

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          entryId: entry.id,
          patternName: entry.error_category,
          similarity,
          occurrences: entry.occurrence_count,
          lastSeen: entry.last_seen,
          resolution: entry.resolution,
          suggestedFix: entry.suggested_fix,
        };
      }
    }

    return bestMatch;
  }

  public addEntry(incident: Incident): string {
    const normalizedSignature = this.normalizeErrorSignature(
      incident.errorSummary
    );

    // Check if entry exists by normalized signature
    const existingStmt = this.db.prepare(
      'SELECT id, occurrence_count, last_seen FROM kb_entries WHERE error_signature = ?'
    );
    const existing = existingStmt.get(incident.errorSummary) as any;

    const now = new Date().toISOString();

    if (existing) {
      // Update existing entry
      const updateStmt = this.db.prepare(`
        UPDATE kb_entries
        SET occurrence_count = occurrence_count + 1,
            last_seen = ?,
            affected_stores = ?,
            affected_pages = ?
        WHERE id = ?
      `);

      const stores = new Set(
        JSON.parse(existing.affected_stores || '[]') as string[]
      );
      stores.add(incident.siteName);

      const pages = new Set(
        JSON.parse(existing.affected_pages || '[]') as string[]
      );
      pages.add(incident.affectedPage);

      updateStmt.run(
        now,
        JSON.stringify(Array.from(stores)),
        JSON.stringify(Array.from(pages)),
        existing.id
      );

      return existing.id;
    } else {
      // Create new entry
      const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const insertStmt = this.db.prepare(`
        INSERT INTO kb_entries (
          id, error_signature, error_category, error_detail,
          first_seen, last_seen, occurrence_count,
          affected_stores, affected_pages, severity, impact_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        incident.errorSummary,
        incident.classification.category || 'unknown',
        incident.errorDetail,
        now,
        now,
        1,
        JSON.stringify([incident.siteName]),
        JSON.stringify([incident.affectedPage]),
        incident.classification.severity || 'medium',
        incident.impactScore || 0.5
      );

      return id;
    }
  }

  public resolveEntry(
    entryId: string,
    resolution: string,
    resolvedBy: string
  ): void {
    const now = new Date().toISOString();

    // Update kb_entries
    const updateStmt = this.db.prepare(`
      UPDATE kb_entries
      SET is_resolved = 1,
          resolution = ?,
          resolved_by = ?,
          resolved_at = ?
      WHERE id = ?
    `);

    updateStmt.run(resolution, resolvedBy, now, entryId);

    // Add resolution record
    const resolutionId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const insertResolutionStmt = this.db.prepare(`
      INSERT INTO kb_resolutions (
        id, kb_entry_id, resolution_text, resolved_by, resolved_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    insertResolutionStmt.run(resolutionId, entryId, resolution, resolvedBy, now);
  }

  public getStats(): KBStats {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM kb_entries');
    const total = (totalStmt.get() as any).count;

    const resolvedStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM kb_entries WHERE is_resolved = 1'
    );
    const resolved = (resolvedStmt.get() as any).count;

    const occurrencesStmt = this.db.prepare(
      'SELECT SUM(occurrence_count) as total FROM kb_entries'
    );
    const totalOccurrences = (occurrencesStmt.get() as any).total || 0;

    const categoriesStmt = this.db.prepare(
      'SELECT error_category, COUNT(*) as count FROM kb_entries GROUP BY error_category'
    );
    const categories = (categoriesStmt.all() as any[]).reduce(
      (acc, row) => {
        acc[row.error_category] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    const severitiesStmt = this.db.prepare(
      'SELECT severity, COUNT(*) as count FROM kb_entries GROUP BY severity'
    );
    const bySeverity = (severitiesStmt.all() as any[]).reduce(
      (acc, row) => {
        acc[row.severity] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      totalEntries: total,
      resolvedEntries: resolved,
      unresolvedEntries: total - resolved,
      topAffectedStores: [],
      topCategories: Object.entries(categories).map(([category, count]) => ({ category, count: count as number })),
      avgResolutionTimeHours: 0,
    };
  }

  public getAllEntries(limit?: number): KBEntry[] {
    let query = `
      SELECT id, error_signature, error_category, error_detail,
             first_seen, last_seen, occurrence_count,
             affected_stores, affected_pages, severity, impact_score,
             is_resolved, resolution, resolved_by, resolved_at,
             sample_error, sample_screenshot, ai_analysis, suggested_fix
      FROM kb_entries
      ORDER BY last_seen DESC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      errorSignature: row.error_signature,
      errorCategory: row.error_category,
      errorDetail: row.error_detail,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      occurrenceCount: row.occurrence_count,
      affectedStores: JSON.parse(row.affected_stores || '[]'),
      affectedPages: JSON.parse(row.affected_pages || '[]'),
      severity: row.severity,
      impactScore: row.impact_score,
      isResolved: row.is_resolved === 1,
      resolution: row.resolution,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      sampleError: row.sample_error,
      sampleScreenshot: row.sample_screenshot,
      aiAnalysis: row.ai_analysis,
      suggestedFix: row.suggested_fix,
    }));
  }

  public close(): void {
    this.db.close();
  }
}

export default KnowledgeBase;
