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

### Other Commands

```bash
# Run the full debug agent
npm start

# Run a site scan
npm run scan

# Scan a single URL
npm run scan:single -- <URL>

# Start the dashboard
npm run dashboard

# Development mode with hot reload
npm run dev
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
