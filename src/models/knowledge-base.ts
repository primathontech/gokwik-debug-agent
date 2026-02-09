import { IssueDomain, AffectedFlow } from './incident';

export interface KnownFailurePattern {
  id: string;
  pattern: string;
  description: string;
  error_type: string;
  match_regex: string;
  severity: string;
  impact_score: number;
  suggested_fix: string;
  affected_stores?: string[];
  affected_flow?: string;
  domain?: string;
  is_conversion_blocking?: boolean;
}

export interface KBEntry {
  id: string;
  errorSignature: string;        // normalized error fingerprint
  errorCategory: string;
  errorDetail?: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  affectedStores: string[];
  affectedPages: string[];
  severity: string;
  impactScore: number;

  // Resolution
  isResolved: boolean;
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: string;

  // Sample data
  sampleError?: string;
  sampleScreenshot?: string;
  sampleNetworkCall?: string;

  // AI analysis
  aiAnalysis?: string;
  suggestedFix?: string;

  // Enhanced GoKwik-specific fields
  affectedFlow?: AffectedFlow | string;  // checkout, cart, browse, login, etc.
  domain?: IssueDomain | string;  // FRONTEND, BACKEND, PAYMENT, etc.
  rootCause?: string;
  fixVerification?: string;  // How to verify the fix worked
  relatedPatterns?: string[];  // IDs of errors that often appear together
  customerImpactEstimate?: string;
  isConversionBlocking?: boolean;
  timeToFixMinutes?: number;  // Historical average
  sourceSystem?: string;  // SHOPIFY, GOKWIK_BE, etc.
}

export interface KBStats {
  totalEntries: number;
  resolvedEntries: number;
  unresolvedEntries: number;
  topAffectedStores: { store: string; count: number }[];
  topCategories: { category: string; count: number }[];
  avgResolutionTimeHours: number;
  conversionBlockingCount?: number;
  byDomain?: { domain: string; count: number }[];
  byAffectedFlow?: { flow: string; count: number }[];
}

// Knowledge source - how the pattern was learned
export type KnowledgeSource = 'seeded' | 'ai_learned' | 'human_verified';

export interface KBResolution {
  id: string;
  kbEntryId: string;
  resolutionText: string;
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
  verificationSteps?: string;
  preventionSuggestion?: string;
}
