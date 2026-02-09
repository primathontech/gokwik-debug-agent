# GoKwik Debug Agent

AI-powered developer support agent for GoKwik storefronts - detects, classifies, and routes FE issues with a self-learning knowledge base.

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/primathontech/gokwik-debug-agent.git
cd gokwik-debug-agent

# Install dependencies (this will also install Playwright browsers)
npm install
```

### Open Aqualogica Website (Headed Mode)

```bash
npm run open:aqualogica
```

This will launch a Chromium browser in headed (visible) mode and navigate to the Aqualogica website.

### Configuration (Optional)

For full agent functionality, copy the environment template and configure:

```bash
cp config/.env.example config/.env
```

Edit `config/.env` with your API keys (Slack, Anthropic, etc.)

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run open:aqualogica` | Open Aqualogica website in headed browser |
| `npm run dashboard` | Start the web dashboard |
| `npm start` | Run the full debug agent |
| `npm run scan` | Run site scan on all configured sites |
| `npm run scan:single -- <URL>` | Scan a single URL |
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm test` | Run tests |
| `npm run kb:list` | List knowledge base entries |
| `npm run kb:stats` | Show knowledge base statistics |

### Examples

```bash
# Open Aqualogica in browser
npm run open:aqualogica

# Start the dashboard
npm run dashboard

# Scan a specific website
npm run scan:single -- https://aqualogica.in

# Run the full agent (scans all configured sites)
npm start
```

## Project Structure

```
├── src/                  # Source code
│   ├── scanner/          # Playwright-based site scanner
│   ├── classifier/       # AI classification logic
│   ├── slack/            # Slack integration
│   └── dashboard/        # Web dashboard
├── config/               # Configuration files
│   ├── .env.example      # Environment template
│   ├── sites.yaml        # Sites to monitor
│   └── ownership.yaml    # Team routing config
└── open-aqualogica.ts    # Quick script to open Aqualogica site
```

## Documentation

- [SETUP.md](./SETUP.md) - Slack integration setup guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture details
