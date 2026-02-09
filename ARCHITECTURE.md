# GoKwik Debug Agent - Technical Architecture Documentation

> **Version:** 1.0.0
> **Last Updated:** February 2026
> **Audience:** SDET, Developers, QA Engineers

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Data Flow Pipeline](#4-data-flow-pipeline)
5. [Component Deep Dive](#5-component-deep-dive)
6. [Database Schema](#6-database-schema)
7. [REST API Reference](#7-rest-api-reference)
8. [Configuration Files](#8-configuration-files)
9. [npm Scripts](#9-npm-scripts)
10. [Testing Guide](#10-testing-guide)
11. [Dashboard Features](#11-dashboard-features)
12. [Key Files Reference](#12-key-files-reference)

---

## 1. Project Overview

### What is GoKwik Debug Agent?

The **GoKwik Debug Agent** is an AI-powered **automated issue detection and alerting system** for e-commerce storefronts. It acts as a "synthetic monitoring + intelligent triage" tool that:

- **Scans** e-commerce storefronts using headless browser automation
- **Detects** network errors, console errors, and visual issues
- **Classifies** issues by category, severity, and domain (FE/BE/Payment/3P)
- **Scores** business impact (0-100) with conversion-blocking detection
- **Matches** against a self-learning knowledge base of known patterns
- **Alerts** via Slack with @mentions to the right team owners
- **Provides** a web dashboard for incident management

### Core Workflow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────┐
│  Scheduled  │────▶│  Playwright │────▶│  Classifier  │────▶│  Knowledge  │────▶│   Slack   │
│    Scan     │     │   Scanner   │     │  (Rule+LLM)  │     │    Base     │     │   Alert   │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘     └───────────┘
     │                    │                    │                    │                  │
     ▼                    ▼                    ▼                    ▼                  ▼
  sites.yaml         Network Errors      Category/Domain       Match Known        @mention
  (5 stores)        Console Errors        FE vs BE            Patterns           Owner
                     Screenshots         Severity Score        Suggest Fix
```

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Runtime** | Node.js | 18+ | Core platform |
| **Language** | TypeScript | 5.7 | Type-safe development |
| **Browser Automation** | Playwright | 1.49 | Headless Chromium scanning |
| **AI/LLM** | Anthropic Claude | 3.5 Sonnet | Smart classification fallback |
| **Database** | SQLite | better-sqlite3 11.7 | Incidents + KB storage (WAL mode) |
| **Messaging** | Slack Bolt | 4.1 | Alert delivery with @mentions |
| **Messaging API** | Slack Web API | 7.7 | Message formatting |
| **Web Server** | Express.js | 4.21 | Dashboard REST API |
| **Frontend** | React | 18.2 (CDN) | Dashboard UI |
| **Frontend Transpiler** | Babel | 7.23 (CDN) | JSX in browser |
| **Config Parser** | YAML | 2.6 | Configuration files |
| **Scheduling** | node-cron | 3.0 | 30-min scan intervals |
| **CLI** | Commander | 13.0 | Command-line interface |
| **Logging** | Chalk + Ora | 4.1 / 5.4 | Colored console output |

### Dependencies (package.json)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@slack/bolt": "^4.1.0",
    "@slack/web-api": "^7.7.0",
    "better-sqlite3": "^11.7.0",
    "chalk": "^4.1.2",
    "commander": "^13.0.0",
    "cors": "^2.8.5",
    "dotenv": "^17.2.4",
    "express": "^4.21.0",
    "node-cron": "^3.0.3",
    "ora": "^5.4.1",
    "playwright": "^1.49.0",
    "uuid": "^11.0.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.10.0",
    "@types/uuid": "^10.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## 3. Project Structure

```
gokwik-debug-agent/
│
├── src/                              # Source code
│   ├── index.ts                      # Main entry point - orchestrates pipeline
│   │
│   ├── models/                       # Data models & TypeScript interfaces
│   │   ├── incident.ts               # Incident, Classification, ScanResult types
│   │   └── knowledge-base.ts         # KBEntry, KBStats types
│   │
│   ├── scanner/                      # Browser automation layer
│   │   ├── scanner.ts                # PlaywrightScanner class
│   │   ├── flows/
│   │   │   ├── default-flows.ts      # Generic e-commerce flows
│   │   │   └── merchant-flows.ts     # Store-specific selectors
│   │   └── analytics/
│   │       ├── index.ts              # Analytics exports
│   │       └── event-tracker.ts      # Meta/GA4/Google Ads tracking
│   │
│   ├── classifier/                   # Error classification engine
│   │   ├── classifier.ts             # Rule-based classification
│   │   └── llm-classifier.ts         # Claude AI fallback
│   │
│   ├── scoring/                      # Business impact scoring
│   │   └── impact.ts                 # calculateImpact() function
│   │
│   ├── knowledgebase/                # Self-learning knowledge base
│   │   └── kb.ts                     # KnowledgeBase class (SQLite)
│   │
│   ├── slack/                        # Slack integration
│   │   └── slack-bot.ts              # SlackBot class
│   │
│   ├── jira/                         # Jira integration
│   │   └── ticket-generator.ts       # Jira ticket generation
│   │
│   ├── dashboard/                    # Web dashboard
│   │   ├── server.ts                 # Express REST API server
│   │   └── public/
│   │       └── index.html            # React dashboard UI
│   │
│   └── cli/                          # CLI utilities
│       ├── kb-list.ts                # List KB entries
│       └── kb-stats.ts               # Show KB statistics
│
├── config/                           # Configuration files
│   ├── .env                          # Environment variables (secrets)
│   ├── .env.example                  # Example env template
│   ├── sites.yaml                    # Stores to scan
│   ├── ownership.yaml                # Team ownership routing
│   └── known_failures.yaml           # Seeded KB patterns
│
├── data/                             # SQLite databases
│   ├── incidents.db                  # Incident history
│   ├── incidents.db-shm              # SQLite shared memory
│   ├── incidents.db-wal              # SQLite write-ahead log
│   ├── knowledge-base.db             # KB entries
│   ├── knowledge-base.db-shm
│   └── knowledge-base.db-wal
│
├── screenshots/                      # Error screenshots
├── dist/                             # Compiled JavaScript
├── tests/                            # Test files
│
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript config
├── jest.config.js                    # Jest test config
├── SETUP.md                          # Slack setup guide
├── ARCHITECTURE.md                   # This file
└── README.md                         # Project readme
```

---

## 4. Data Flow Pipeline

### Phase 1: Scanning (Playwright)

```typescript
// src/scanner/scanner.ts
PlaywrightScanner.scan(url, flows) → ScanResult {
  scanId: string,
  siteUrl: string,
  siteName: string,
  timestamp: string,
  duration: number,
  pagesScanned: string[],
  networkErrors: NetworkError[],     // 4xx, 5xx, CORS, timeout
  consoleErrors: ConsoleError[],     // errors, warnings, logs
  visualIssues: VisualIssue[],       // (future: visual regression)
  screenshotPaths: string[],
  pageMetrics: {
    loadTime: number,
    domContentLoaded: number,
    totalRequests: number,
    failedRequests: number
  }
}
```

**What gets captured:**
- HTTP responses with status >= 400
- Network timeouts and CORS errors
- Console errors, warnings, and logs
- Page load performance metrics
- Screenshots on error

### Phase 2: Classification (Rule-based + LLM)

```typescript
// src/classifier/classifier.ts
classifyErrors(networkErrors, consoleErrors) → Classification[] {
  category: ErrorCategory,      // 42+ categories
  severity: Severity,           // critical | high | medium | low | info
  domain: IssueDomain,          // FRONTEND | BACKEND | PAYMENT | THIRD_PARTY | CDN | SDK | SHOPIFY | INFRASTRUCTURE
  sourceSystem: SourceSystem,   // SHOPIFY | GOKWIK_BE | STOREFRONT_FE | ANALYTICS | ...
  confidence: number,           // 0-100
  reasoning: string,
  suggestedOwner: string,
  domainReasoning: string
}
```

**Error Categories (42+):**

| Category | Type |
|----------|------|
| `network_4xx` | Network |
| `network_5xx` | Network |
| `network_timeout` | Network |
| `network_cors` | Network |
| `console_error` | Console |
| `console_warning` | Console |
| `js_runtime_error` | JavaScript |
| `resource_error` | Resources |
| `visual_issue` | Visual |
| `hydration_error` | React/Next.js |
| `rendering_issue` | React/Next.js |
| `payment_error` | GoKwik |
| `checkout_error` | GoKwik |
| `cart_error` | GoKwik |
| `auth_error` | Security |
| `sdk_load_error` | SDK |
| `third_party_error` | 3rd Party |
| `cdn_error` | CDN |
| `api_schema_error` | API |
| `performance_degradation` | Performance |
| `security_error` | Security |
| `seo_error` | SEO |
| `websocket_error` | WebSocket |
| `shopify_api_error` | Shopify |
| `shopify_theme_error` | Shopify |
| `shopify_app_error` | Shopify |
| `shopify_rate_limit` | Shopify |
| `shopify_checkout_error` | Shopify |
| `unknown` | Unknown |

**Domain Classification Rules:**

| Pattern | Domain | Owner |
|---------|--------|-------|
| API 4xx/5xx, CORS, timeout | BACKEND | Sumit |
| JS errors, hydration, rendering | FRONTEND | Umang |
| GoKwik SDK, payment iframe | PAYMENT/SDK | GoKwik Team |
| Analytics scripts, pixels | THIRD_PARTY | Umang |
| CDN failures, image 404 | CDN/INFRA | DevOps |
| Shopify API errors | SHOPIFY | Shopify Team |

### Phase 3: Impact Scoring

```typescript
// src/scoring/impact.ts
calculateImpact(networkErrors, consoleErrors, visualIssues, pageUrl) → ImpactResult {
  score: number,              // 0-100
  reasoning: string,
  isConversionBlocking: boolean
}
```

**Scoring Matrix:**

| Error Type | Page | Score | Conversion Blocking |
|------------|------|-------|---------------------|
| Checkout API 5xx | /checkout | 95 | Yes |
| Payment SDK failure | /checkout | 88 | Yes |
| Cart API timeout | /cart | 85 | Yes |
| Cart API 4xx | /cart | 80 | Yes |
| Product page 5xx | /product | 70 | No |
| Generic 5xx | any | 70 | No |
| JS runtime error on checkout | /checkout | 75 | Yes |
| Generic 4xx | any | 50 | No |
| Hydration error | any | 35 | No |
| Image 404 | any | 25 | No |
| Analytics script 404 | any | 15 | No |
| Console warning | any | 10 | No |

**Multipliers:**
- Frequency: `1 + (errorCount × 0.1)` (max 1.5x)
- Page importance: checkout 1.3x, product 1.15x, listing 1.05x

### Phase 4: Knowledge Base Matching

```typescript
// src/knowledgebase/kb.ts
kb.findMatch(errorSignature, errorDetail) → KBMatch | null {
  matchId: string,
  patternId: string,
  patternName: string,
  similarity: number,           // 0-100
  previousOccurrences: number,
  lastSeen: string,
  knownResolution?: string,
  resolvedBy?: string,
  resolvedAt?: string
}
```

**KB Features:**
- Fuzzy string matching for error signatures
- Learning from resolved incidents
- Seeded patterns from `known_failures.yaml`
- Resolution tracking with timestamps

### Phase 5: Incident Creation

```typescript
// Stored in SQLite: data/incidents.db
Incident {
  incidentId: string,
  scanId: string,
  siteName: string,
  siteUrl: string,
  environment: 'production' | 'staging',
  timestamp: string,

  // Error details
  errorSummary: string,
  errorDetail: string,
  affectedPage: string,
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  visualIssues: VisualIssue[],
  screenshotPath?: string,

  // Classification
  classification: Classification,
  impactScore: number,

  // Knowledge base
  kbMatch?: KBMatch,
  suggestedFix?: string,

  // Lifecycle
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive',
  resolvedBy?: string,
  resolvedAt?: string,
  resolution?: string,

  // Slack
  slackChannel?: string,
  slackMessageTs?: string,
  slackStatus: 'pending' | 'sent' | 'failed' | 'skipped',
  slackError?: string,
  slackMessageUrl?: string
}
```

### Phase 6: Slack Notification

```typescript
// src/slack/slack-bot.ts
slackBot.sendIncidentAlert(incident, channel, kbMatch) → messageTs: string
```

**Slack Message Format:**

```
🔴 [CRITICAL] checkout API returned 503
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Store: Wellversed | Page: /checkout
Domain: ⚙️ BACKEND | Source: GOKWIK_BE
Impact: 95/100 ⚠️ Conversion Blocking

📚 Known Pattern: "Cloud Run 503 - Backend overload"
   Seen 12 times | Last: 2h ago
   ✅ Known Fix: Scale up Cloud Run instances

👤 Assigned to: @Sumit (Backend Owner)

[Mark Resolved] [False Positive] [View Details]
```

**Domain Emoji Mapping:**
| Domain | Emoji | Label |
|--------|-------|-------|
| FRONTEND | 🎨 | FE |
| BACKEND | ⚙️ | BE |
| INFRASTRUCTURE | 🏗️ | INFRA |
| THIRD_PARTY | 🔌 | 3RD PARTY |
| PAYMENT | 💳 | PAYMENT |
| CDN | 🌐 | CDN |
| SDK | 📦 | SDK |
| SHOPIFY | 🛍️ | SHOPIFY |

---

## 5. Component Deep Dive

### 5.1 Scanner (`src/scanner/scanner.ts`)

**Class:** `PlaywrightScanner`

**Responsibilities:**
- Launch headless Chromium browser
- Intercept network requests/responses
- Monitor console messages
- Execute flow steps (navigate, click, wait, scroll, type)
- Take screenshots on errors
- Track page load metrics
- Capture analytics events

**Key Methods:**
```typescript
class PlaywrightScanner {
  constructor(config: ScanConfig)
  async scan(siteConfig: SiteConfig): Promise<ScanResult>
  async scanUrl(url: string): Promise<ScanResult>
  private async executeFlow(flow: Flow): Promise<void>
  private captureNetworkError(response: Response): void
  private captureConsoleMessage(msg: ConsoleMessage): void
  close(): void
}
```

**Flow Steps:**
```typescript
type FlowStep = {
  action: 'navigate' | 'click' | 'wait' | 'scroll' | 'type' | 'fill' | 'press' | 'screenshot',
  selector?: string,
  url?: string,
  value?: string,
  timeout?: number
}
```

### 5.2 Classifier (`src/classifier/classifier.ts`)

**Key Functions:**
```typescript
// Main classification function
function classifyErrors(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[]
): Classification[]

// URL pattern matching for domain inference
function inferDomainFromUrl(url: string): IssueDomain

// Console error pattern matching
function inferDomainFromConsoleError(error: ConsoleError): IssueDomain

// Map category to severity
function getSeverityForCategory(category: ErrorCategory): Severity

// Map category to owner
function getOwnerForCategory(category: ErrorCategory): string
```

### 5.3 LLM Classifier (`src/classifier/llm-classifier.ts`)

**When Used:** When rule-based confidence < 70%

**Function:**
```typescript
async function classifyWithLLM(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  pageUrl: string,
  siteName: string
): Promise<Classification>
```

**LLM Prompt includes:**
- Tech stack context (Next.js, Shopify, GoKwik SDK)
- Error summary with details
- Expected JSON response format
- Domain classification rules

### 5.4 Knowledge Base (`src/knowledgebase/kb.ts`)

**Class:** `KnowledgeBase`

**Key Methods:**
```typescript
class KnowledgeBase {
  constructor(dataDir: string)

  // Find matching pattern
  findMatch(signature: string, detail: string): KBMatchResult | null

  // Add/update entry from incident
  addEntry(incident: Incident): string

  // Mark entry as resolved
  resolveEntry(entryId: string, resolution: string, resolvedBy: string): void

  // Get all entries
  getAllEntries(limit?: number): KBEntry[]

  // Get statistics
  getStats(): KBStats

  // Load seeded patterns
  seedFromConfig(configPath: string): void

  close(): void
}
```

### 5.5 Impact Scorer (`src/scoring/impact.ts`)

**Function:**
```typescript
function calculateImpact(
  networkErrors: NetworkError[],
  consoleErrors: ConsoleError[],
  visualIssues: VisualIssue[],
  pageUrl: string
): ImpactResult

interface ImpactResult {
  score: number,              // 0-100
  reasoning: string,
  isConversionBlocking: boolean,
  breakdown: {
    networkScore: number,
    consoleScore: number,
    visualScore: number,
    frequencyMultiplier: number,
    pageMultiplier: number
  }
}
```

### 5.6 Slack Bot (`src/slack/slack-bot.ts`)

**Class:** `SlackBot`

**Key Methods:**
```typescript
class SlackBot {
  constructor(token?: string)

  // Send incident alert
  async sendIncidentAlert(
    incident: Incident,
    channel: string,
    kbMatch?: KBMatch
  ): Promise<string>  // Returns message timestamp

  // Upload screenshot
  async uploadScreenshot(
    filePath: string,
    channel: string,
    threadTs: string
  ): Promise<void>

  // Get owner for domain
  private getOwnerForDomain(domain: IssueDomain): DomainOwner | null

  // Build Block Kit message
  private buildBlocks(incident: Incident, kbMatch?: KBMatch): Block[]

  close(): void
}
```

### 5.7 Dashboard Server (`src/dashboard/server.ts`)

**Framework:** Express.js

**Initialization:**
```typescript
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static('public'))

// Initialize databases
initializeDatabases()

// Start server
app.listen(PORT)
```

---

## 6. Database Schema

### 6.1 incidents.db

```sql
CREATE TABLE incidents (
  -- Primary key
  id TEXT PRIMARY KEY,

  -- Scan reference
  scan_id TEXT NOT NULL,

  -- Site info
  site_name TEXT NOT NULL,
  site_url TEXT NOT NULL,
  environment TEXT NOT NULL,

  -- Timing
  timestamp TEXT NOT NULL,

  -- Error details
  error_summary TEXT NOT NULL,
  error_detail TEXT,
  affected_page TEXT,

  -- Classification (JSON)
  classification_json TEXT,

  -- Scoring
  impact_score REAL,

  -- Knowledge base match (JSON)
  kb_match_json TEXT,
  suggested_fix TEXT,

  -- Lifecycle
  status TEXT DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TEXT,
  resolution TEXT,

  -- Slack integration
  slack_message_ts TEXT,
  slack_channel TEXT,
  slack_status TEXT DEFAULT 'pending',
  slack_error TEXT,

  -- Raw error data (JSON arrays)
  network_errors_json TEXT,
  console_errors_json TEXT,
  visual_issues_json TEXT,

  -- Screenshot
  screenshot_path TEXT
);

-- Indexes for common queries
CREATE INDEX idx_incidents_site_name ON incidents(site_name);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX idx_incidents_slack_status ON incidents(slack_status);
```

### 6.2 knowledge-base.db

```sql
CREATE TABLE kb_entries (
  -- Primary key
  id TEXT PRIMARY KEY,

  -- Error pattern (unique for deduplication)
  error_signature TEXT UNIQUE,
  error_category TEXT,
  error_detail TEXT,

  -- Timing
  first_seen TEXT,
  last_seen TEXT,

  -- Statistics
  occurrence_count INTEGER DEFAULT 1,

  -- Affected scope (JSON arrays)
  affected_stores TEXT,
  affected_pages TEXT,

  -- Classification
  severity TEXT,
  impact_score REAL,

  -- Resolution
  is_resolved INTEGER DEFAULT 0,
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,

  -- AI analysis
  suggested_fix TEXT,
  ai_analysis TEXT,

  -- Sample data
  sample_error TEXT,
  sample_screenshot TEXT
);

CREATE TABLE kb_resolutions (
  id TEXT PRIMARY KEY,
  kb_entry_id TEXT,
  resolution_text TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  notes TEXT,
  FOREIGN KEY (kb_entry_id) REFERENCES kb_entries(id)
);

-- Indexes
CREATE INDEX idx_kb_entries_category ON kb_entries(error_category);
CREATE INDEX idx_kb_entries_is_resolved ON kb_entries(is_resolved);
```

---

## 7. REST API Reference

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Incidents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/incidents` | List all incidents |
| `GET` | `/incidents/:id` | Get single incident |
| `POST` | `/incidents/:id/resolve` | Mark as resolved |
| `POST` | `/incidents/:id/false-positive` | Mark as false positive |
| `POST` | `/incidents/:id/resend-slack` | Resend Slack notification |
| `POST` | `/incidents/send-all-pending-slack` | Bulk send all pending |
| `GET` | `/incidents/:id/jira` | Generate Jira ticket |

#### Sites

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sites` | List configured sites with health |

#### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dashboard/summary` | Overall statistics |

#### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/kb/stats` | KB statistics |
| `GET` | `/kb/entries` | List KB patterns |

### Request/Response Examples

#### GET /api/incidents
```bash
GET /api/incidents?site=Wellversed&status=open&limit=50
```

**Response:**
```json
{
  "incidents": [
    {
      "incidentId": "inc_abc123",
      "siteName": "Wellversed",
      "errorSummary": "API returned 503 on checkout",
      "classification": {
        "category": "network_5xx",
        "severity": "critical",
        "domain": "BACKEND",
        "confidence": 95
      },
      "impactScore": 92,
      "status": "open",
      "slackStatus": "sent",
      "timestamp": "2026-02-07T10:30:00Z"
    }
  ],
  "total": 1
}
```

#### POST /api/incidents/:id/resolve
```bash
POST /api/incidents/inc_abc123/resolve
Content-Type: application/json

{
  "resolution": "Scaled up Cloud Run instances",
  "resolvedBy": "Sumit"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Incident resolved"
}
```

#### POST /api/incidents/send-all-pending-slack
```bash
POST /api/incidents/send-all-pending-slack
```

**Response:**
```json
{
  "success": true,
  "message": "Sent 5 notifications, 1 failed",
  "sent": 5,
  "failed": 1,
  "total": 6,
  "results": [
    { "incidentId": "inc_abc123", "success": true },
    { "incidentId": "inc_def456", "success": false, "error": "channel_not_found" }
  ]
}
```

#### GET /api/dashboard/summary
```bash
GET /api/dashboard/summary
```

**Response:**
```json
{
  "totalIncidents": {
    "open": 12,
    "resolved": 45,
    "total": 57
  },
  "severityDistribution": {
    "critical": 3,
    "high": 8,
    "medium": 25,
    "low": 21
  },
  "kbMatchRate": 68.5,
  "slackNotifications": {
    "sent": 42,
    "pending": 8,
    "failed": 2,
    "skipped": 5
  }
}
```

---

## 8. Configuration Files

### 8.1 sites.yaml

**Location:** `config/sites.yaml`

**Purpose:** Define which stores to scan

```yaml
sites:
  - name: "Wellversed"
    url: "https://store.wellversed.in"
    environment: "production"
    backend_type: "shopify_gokwik"
    scan_flows:
      - homepage
      - product_page
      - cart
      - checkout_init
    alert_channel: "C0ADMPKDP42"

  - name: "PlixKids"
    url: "https://store.plixkids.com"
    environment: "production"
    backend_type: "custom_gokwik"
    scan_flows:
      - homepage
      - product_page
      - cart
      - checkout_init
    alert_channel: "C0ADMPKDP42"

  - name: "BBLUNT Dev"
    url: "https://bblunt-dev-custom.primathontech.co.in"
    environment: "staging"
    backend_type: "custom_gokwik"
    scan_flows:
      - homepage
      - product_page
    alert_channel: "C0ADMPKDP42"
    severity_threshold: "high"

  - name: "Aqualogica"
    url: "https://store.aqualogica.in"
    environment: "production"
    backend_type: "shopify_gokwik"
    scan_flows:
      - homepage
      - product_page
      - cart
      - checkout_init
    alert_channel: "C0ADMPKDP42"

  - name: "Weryze"
    url: "https://weryze.com"
    environment: "production"
    backend_type: "shopify_only"
    scan_flows:
      - homepage
      - product_page
      - cart
      - checkout_init
    alert_channel: "C0ADMPKDP42"

scan_settings:
  scheduled_interval_minutes: 30
  screenshot_on_error: true
  viewport:
    width: 1440
    height: 900
  mobile_viewport:
    width: 375
    height: 812
  timeout_ms: 30000
  max_retries: 2
```

**Backend Types:**
- `shopify_gokwik` - Shopify store with GoKwik checkout
- `custom_gokwik` - Custom storefront with GoKwik checkout
- `shopify_only` - Pure Shopify store

### 8.2 ownership.yaml

**Location:** `config/ownership.yaml`

**Purpose:** Team ownership routing for Slack @mentions

```yaml
domain_owners:
  FRONTEND:
    name: "Umang"
    slack_id: "U09CNKASRC0"
  BACKEND:
    name: "Sumit"
    slack_id: "U08MVKMARNX"
  INFRASTRUCTURE:
    name: "Sumit"
    slack_id: "U08MVKMARNX"
  THIRD_PARTY:
    name: "Umang"
    slack_id: "U09CNKASRC0"
  PAYMENT:
    name: "GoKwik Team"
    slack_id: "U_GOKWIK"
  SDK:
    name: "GoKwik SDK Team"
    slack_id: "U_SDK"
  SHOPIFY:
    name: "Shopify Team"
    slack_id: "U_SHOPIFY"
  CDN:
    name: "DevOps"
    slack_id: "U_DEVOPS"

teams:
  frontend:
    slack_channel: "C0ADMPKDP42"
    owners: ["U09CNKASRC0"]
    owns:
      - console_error
      - console_warning
      - js_runtime_error
      - visual_issue
      - rendering_issue
      - hydration_error
      - resource_error

  backend:
    slack_channel: "C0ADMPKDP42"
    owners: ["U08MVKMARNX"]
    owns:
      - network_4xx
      - network_5xx
      - network_cors
      - network_timeout

default_channel: "C0ADMPKDP42"
```

### 8.3 known_failures.yaml

**Location:** `config/known_failures.yaml`

**Purpose:** Seeded knowledge base patterns

```yaml
patterns:
  - id: "KF-001"
    pattern: "duplicate Facebook Pixel"
    description: "Facebook Pixel SDK loaded twice causing console warnings"
    error_type: "console_warning"
    match_regex: "Facebook Pixel.*already.*loaded|fbevents\\.js.*loaded.*twice"
    severity: "low"
    impact_score: 15
    suggested_fix: "Check GTM container and hardcoded scripts for duplicate fbevents.js"
    affected_stores: ["PlixKids"]
    domain: "THIRD_PARTY"
    affected_flow: "browse"

  - id: "KF-002"
    pattern: "Cloud Run 503"
    description: "Backend service returning 503 due to cold start or overload"
    error_type: "network_5xx"
    match_regex: "503.*Service Unavailable|Cloud Run.*503"
    severity: "high"
    impact_score: 85
    suggested_fix: "Scale up Cloud Run min instances or check backend health"
    affected_stores: ["Wellversed", "PlixKids"]
    domain: "BACKEND"
    affected_flow: "checkout"

  - id: "KF-003"
    pattern: "Cart API timeout"
    description: "Cart API timing out during add-to-cart operations"
    error_type: "network_timeout"
    match_regex: "cart.*timeout|/api/cart.*ERR_TIMED_OUT"
    severity: "high"
    impact_score: 80
    suggested_fix: "Check cart service performance and database queries"
    affected_stores: []
    domain: "BACKEND"
    affected_flow: "cart"
    is_conversion_blocking: true

  - id: "KF-004"
    pattern: "Next.js Hydration Mismatch"
    description: "React hydration error due to SSR/client mismatch"
    error_type: "console_error"
    match_regex: "Hydration failed|Text content does not match|Expected server HTML"
    severity: "medium"
    impact_score: 35
    suggested_fix: "Check for browser-only APIs in SSR components, use useEffect for client-only code"
    affected_stores: []
    domain: "FRONTEND"
    affected_flow: "browse"

  # ... more patterns (KF-005 to KF-008+)
```

### 8.4 .env

**Location:** `config/.env`

**Purpose:** Environment variables (secrets)

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_WORKSPACE_URL=https://yourworkspace.slack.com
DEFAULT_SLACK_CHANNEL=C0ADMPKDP42

# Anthropic (Claude) API
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Application Settings
MOCK_MODE=false
LOG_LEVEL=info
PORT=3000

# Paths
DATA_DIR=./data
SCREENSHOT_DIR=./screenshots

# Scan Settings
SCAN_INTERVAL_MINUTES=30
```

---

## 9. npm Scripts

```bash
# Build TypeScript
npm run build              # Compile to dist/

# Run Scans
npm start                  # Full scan of all configured sites
npm run scan               # Same as npm start
npm run scan:single -- --url https://example.com  # Scan single URL

# Development
npm run dev                # Run with auto-reload (ts-node-dev)

# Dashboard
npm run dashboard          # Start web dashboard at http://localhost:3000

# Knowledge Base CLI
npm run kb:list            # List all KB entries
npm run kb:stats           # Show KB statistics

# Testing
npm test                   # Run Jest test suite
```

---

## 10. Testing Guide

### 10.1 What to Test

#### Scanner Layer
- Network error capture (mock 4xx/5xx responses)
- Console error interception
- Screenshot generation
- Flow step execution (click, wait, navigate)
- Timeout handling
- Page metrics collection

#### Classifier Layer
- Rule-based classification accuracy
- Domain assignment (FE vs BE vs 3P)
- Severity mapping
- Source system identification
- LLM fallback triggering (confidence < 70%)

#### Impact Scoring
- Conversion-blocking detection
- Page importance multipliers
- Score boundaries (0-100)
- Frequency multiplier capping

#### Knowledge Base
- Fuzzy matching accuracy
- Pattern learning from incidents
- Resolution tracking
- Seeding from config

#### Slack Integration
- Message formatting (Block Kit)
- Owner @mentions
- Status tracking (pending → sent/failed)
- Bulk send functionality
- Error handling

#### Dashboard API
- CRUD operations on incidents
- Filter/pagination
- Concurrent access handling
- Error responses

### 10.2 Mock Mode

Set in `config/.env`:
```env
MOCK_MODE=true
```

**Effects:**
- Slack: Logs to console instead of real API calls
- LLM: Uses rule-based classification only (skips Claude API)

### 10.3 Test Data

- **Incidents:** `data/incidents.db`
- **KB Patterns:** `config/known_failures.yaml`
- **Screenshots:** `screenshots/` directory

### 10.4 Test Utilities

```bash
# List current KB entries
npm run kb:list

# Show KB statistics
npm run kb:stats

# Scan single URL for testing
npm run scan:single -- --url https://store.example.com
```

---

## 11. Dashboard Features

### UI Components

- **Dark GitHub-inspired theme**
- **Header** with logo, refresh button, "Send All to Slack" button
- **Tab navigation:** Overview | All Issues | Knowledge Base
- **Stat cards:** Total, Open, Resolved, Critical, KB Match Rate, Slack Sent
- **Incident table:**
  - Columns: Severity, Domain, Issue, Store, Impact, Status, Slack, Time
  - Color-coded severity badges
  - Domain badges (FE/BE/INFRA/3P/PAYMENT/CDN/SDK/SHOPIFY)
  - Slack status badges (Sent/Pending/Failed/Skipped)
  - Tooltips on truncated text
- **Filters:** By store, severity, status
- **Incident detail modal:**
  - Full error details
  - Classification info
  - KB match with known fix
  - Slack status and resend button
  - Suggested fix
  - Action buttons: Close, Jira Ticket, Resolve
- **Resolve modal:** Resolution text + resolved by
- **Jira ticket modal:** Copy-paste ready ticket content

### Dashboard URL

```
http://localhost:3000
```

---

## 12. Key Files Reference

| Priority | File | Lines | Purpose |
|----------|------|-------|---------|
| 1 | `src/index.ts` | ~477 | Main pipeline orchestration |
| 2 | `src/classifier/classifier.ts` | ~200 | Error classification logic |
| 3 | `src/scoring/impact.ts` | ~401 | Business impact scoring |
| 4 | `src/models/incident.ts` | ~280 | All TypeScript type definitions |
| 5 | `src/slack/slack-bot.ts` | ~300 | Slack message formatting |
| 6 | `src/dashboard/server.ts` | ~700 | REST API endpoints |
| 7 | `src/knowledgebase/kb.ts` | ~250 | Knowledge base management |
| 8 | `src/scanner/scanner.ts` | ~300 | Playwright browser automation |
| 9 | `src/dashboard/public/index.html` | ~1000 | React dashboard UI |
| 10 | `config/sites.yaml` | ~60 | Store configuration |
| 11 | `config/ownership.yaml` | ~40 | Team routing |
| 12 | `config/known_failures.yaml` | ~100 | Seeded KB patterns |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp config/.env.example config/.env
# Edit .env with your Slack tokens and API keys

# 3. Build
npm run build

# 4. Run a scan
npm start

# 5. Start dashboard
npm run dashboard
# Open http://localhost:3000
```

---

> **Document maintained by:** GoKwik Debug Agent Team
> **For questions:** Check SETUP.md or create an issue
