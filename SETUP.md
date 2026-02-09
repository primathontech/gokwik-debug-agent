# Slack Integration Setup Guide

Follow these steps to enable Slack messaging for the GoKwik Debug Agent.

---

## 1. Create a Slack App (one-time)

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From scratch**
4. App name: `QA-Alerts-Bot` (or any name)
5. Select your Slack workspace
6. Click **Create App**

---

## 2. Get Slack Credentials

### `SLACK_BOT_TOKEN` (xoxb-...)

1. Open your app in Slack API Dashboard
2. Go to **OAuth & Permissions**
3. Scroll to **Bot Token Scopes**
4. Add these scopes:
   - `chat:write`
   - `chat:write.public`
   - `files:write`
   - `users:read`
5. Scroll up → Click **Install to Workspace**
6. Allow permissions
7. Copy **Bot User OAuth Token** (starts with `xoxb-...`)

### `SLACK_SIGNING_SECRET`

1. In Slack app → **Basic Information**
2. Scroll to **App Credentials**
3. Copy **Signing Secret**

### `SLACK_APP_TOKEN` (xapp-...)

1. In Slack app → **Basic Information**
2. Scroll to **App-Level Tokens**
3. Click **Generate Token and Scopes**
4. Name: `socket-token`
5. Add scope: `connections:write`
6. Generate & copy token (starts with `xapp-...`)

---

## 3. Configure Environment

Edit `config/.env`:

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-actual-token-here
SLACK_SIGNING_SECRET=your-actual-signing-secret-here
SLACK_APP_TOKEN=xapp-your-actual-app-token-here

# Your Slack workspace URL (for generating message links in dashboard)
# Find it at: your Slack URL when logged in (e.g., https://mycompany.slack.com)
SLACK_WORKSPACE_URL=https://your-workspace.slack.com

# Default channel for alerts
DEFAULT_SLACK_CHANNEL=#agent-fe-alerts

# Enable live Slack messaging (set to false for real messages)
MOCK_MODE=false
```

---

## 4. Get Channel IDs

### Option A: Via Slack UI
1. Open Slack
2. Right-click the channel → **View channel details**
3. Scroll to bottom → Copy **Channel ID** (looks like `C01ABCDEF`)

### Option B: Using `/channelid`
1. Open the channel
2. Type: `/channelid`
3. Slack will show the ID

---

## 5. Get User IDs (for owner tagging)

### Option A: Via Slack UI
1. Click on user's profile
2. Click **⋮ More**
3. Click **Copy member ID** (looks like `U02ABCDEF`)

### Option B: Message trick
1. Type `@username` in any channel
2. Send the message
3. Edit → hover → copy user ID

---

## 6. Update `ownership.yaml`

Edit `config/ownership.yaml` with your actual IDs:

```yaml
teams:
  frontend:
    slack_channel: "C01FRONTEND"  # Your actual channel ID
    owners:
      - "U02DEV123"  # @frontend-lead
      - "U02DEV456"  # @frontend-dev
    owns:
      - "console_error"
      - "js_runtime_error"
      - "visual_issue"

  api_integration:
    slack_channel: "C01BACKEND"
    owners:
      - "U02API789"  # @api-lead
    owns:
      - "network_4xx"
      - "network_cors"
      - "network_timeout"

  infrastructure:
    slack_channel: "C01INFRA"
    owners:
      - "U02INFRA012"  # @infra-lead
    owns:
      - "network_5xx"
      - "resource_error"

default_channel: "C01FRONTEND"
```

---

## 7. Test the Integration

### Quick smoke test:

```bash
# Build the project
npm run build

# Run a test scan (mock mode)
MOCK_MODE=true npm start

# Run a test scan (live Slack)
MOCK_MODE=false npm start
```

### Send a test message programmatically:

```typescript
import SlackBot from './src/slack/slack-bot';

const bot = new SlackBot();
await bot.sendTestMessage('C01YOURCHANNEL');
```

---

## Checklist

- [ ] Slack app created
- [ ] `SLACK_BOT_TOKEN` in `.env`
- [ ] `SLACK_SIGNING_SECRET` in `.env`
- [ ] `SLACK_APP_TOKEN` in `.env`
- [ ] `MOCK_MODE=false` in `.env`
- [ ] Channel IDs in `ownership.yaml`
- [ ] User IDs in `ownership.yaml`
- [ ] Test message sent successfully

---

## What the Slack Messages Include

When an issue is detected, the Slack message will show:

1. **Owner Tags**: Team members are @mentioned based on error category
2. **Issue Details**: Site, page, severity, classification, impact score
3. **Knowledge Level**:
   - 📚 **Seeded Pattern** - From `known_failures.yaml`
   - 🤖 **AI-Learned** - Suggested by Claude AI
   - ✅ **Human-Verified** - Fixed by a developer previously
4. **Previous Solution**: If the issue was fixed before, shows who fixed it and how
5. **Suggested Fix**: AI-generated fix suggestion if no human solution exists
6. **Action Buttons**: Mark Resolved, False Positive, View Details
7. **Screenshot**: Attached as thread reply if captured

---

## Dashboard Slack Status Feature

The dashboard tracks Slack notification status for each issue:

| Status | Icon | Meaning |
|--------|------|---------|
| **Sent** | ✅ | Message delivered to Slack |
| **Pending** | ⏳ | Not yet sent (mock mode or queued) |
| **Failed** | ❌ | Send attempt failed |
| **Skipped** | ⏭ | Skipped (false positive or below threshold) |

### Features:
- **Slack Status Column**: See status at a glance in issue tables
- **Direct Link**: Click to jump to the message in Slack (requires `SLACK_WORKSPACE_URL`)
- **Resend Button**: Retry failed or pending notifications from the dashboard
- **Error Details**: See why a notification failed

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Slack client not initialized" | Check `SLACK_BOT_TOKEN` is set and `MOCK_MODE=false` |
| "channel_not_found" | Verify channel ID format (`C0...`) and bot is in channel |
| "not_in_channel" | Invite bot to channel: `/invite @QA-Alerts-Bot` |
| "missing_scope" | Add required scopes in OAuth & Permissions |
| No owner tags | Update `ownership.yaml` with real user IDs |
