import { WebClient } from '@slack/web-api';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Incident, ScanResult, IssueDomain } from '../models/incident';
import { getDomainLabel, getDomainEmoji } from '../classifier/classifier';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
  info: 'ℹ️',
};

// Domain tag styling
const DOMAIN_TAG: Record<IssueDomain, { label: string; emoji: string }> = {
  FRONTEND: { label: 'FE ISSUE', emoji: '🎨' },
  BACKEND: { label: 'BE ISSUE', emoji: '⚙️' },
  INFRASTRUCTURE: { label: 'INFRA ISSUE', emoji: '🏗️' },
  THIRD_PARTY: { label: '3RD PARTY', emoji: '🔌' },
  PAYMENT: { label: 'PAYMENT ISSUE', emoji: '💳' },
  CDN: { label: 'CDN ISSUE', emoji: '🌐' },
  SDK: { label: 'SDK ISSUE', emoji: '📦' },
  SHOPIFY: { label: 'SHOPIFY ISSUE', emoji: '🛍️' },
  UNKNOWN: { label: 'UNKNOWN', emoji: '❓' },
};

// Knowledge source levels
const KNOWLEDGE_LEVEL: Record<string, { label: string; emoji: string }> = {
  seeded: { label: 'Seeded Pattern', emoji: '📚' },
  ai_learned: { label: 'AI-Learned', emoji: '🤖' },
  human_verified: { label: 'Human-Verified', emoji: '✅' },
};

interface BlockKitBlock {
  type: string;
  [key: string]: any;
}

interface DomainOwner {
  name: string;
  slack_id: string;
}

interface OwnershipConfig {
  domain_owners?: Record<string, DomainOwner>;
  teams: Record<string, {
    slack_channel: string;
    owners: string[];
    owns: string[];
  }>;
  store_overrides?: Record<string, {
    default_channel: string;
    severity_threshold?: string;
  }>;
  default_channel: string;
}

export interface KBMatchExtended {
  entryId: string;
  patternName: string;
  similarity: number;
  occurrences: number;
  lastSeen: string;
  resolution?: string;
  suggestedFix?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  source?: 'seeded' | 'ai_learned' | 'human_verified';
}

export class SlackBot {
  private client: WebClient | null = null;
  private ownershipConfig: OwnershipConfig | null = null;
  private mockMode: boolean;

  constructor(slackToken?: string) {
    // Read environment variables at construction time (after dotenv.config has run)
    this.mockMode = process.env.MOCK_MODE !== 'false';
    const envToken = process.env.SLACK_BOT_TOKEN;
    const token = slackToken || envToken;

    console.log(chalk.gray(`[SlackBot] MOCK_MODE=${process.env.MOCK_MODE}, mockMode=${this.mockMode}, hasToken=${!!token}`));

    if (!this.mockMode && token) {
      this.client = new WebClient(token);
      console.log(chalk.green('✓ Slack client initialized (live mode)'));
    } else if (this.mockMode) {
      console.log(chalk.yellow('⚠ Running in MOCK_MODE - Slack messages will be logged to console'));
    } else {
      console.warn(chalk.red('✗ No SLACK_BOT_TOKEN provided and MOCK_MODE=false'));
    }

    this.loadOwnershipConfig();
  }

  private loadOwnershipConfig(): void {
    try {
      const configPath = path.join(process.cwd(), 'config', 'ownership.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        this.ownershipConfig = yaml.parse(content) as OwnershipConfig;
      }
    } catch (error) {
      console.warn('Failed to load ownership config:', error);
    }
  }

  private getOwnerForDomain(domain: IssueDomain): DomainOwner | null {
    if (!this.ownershipConfig?.domain_owners) return null;
    return this.ownershipConfig.domain_owners[domain] || null;
  }

  private getTeamForCategory(category: string): { channel: string; owners: string[] } | null {
    if (!this.ownershipConfig) return null;

    for (const [teamName, team] of Object.entries(this.ownershipConfig.teams)) {
      if (team.owns.includes(category)) {
        return {
          channel: team.slack_channel,
          owners: team.owners || [],
        };
      }
    }

    return {
      channel: this.ownershipConfig.default_channel,
      owners: [],
    };
  }

  private formatOwnerTags(owners: string[]): string {
    if (!owners || owners.length === 0) return '';
    // Filter out placeholder values
    const validOwners = owners.filter(id => id && !id.includes('XXXXXXXXX'));
    if (validOwners.length === 0) return '';
    return validOwners.map(id => `<@${id}>`).join(' ');
  }

  private getKnowledgeLevel(kbMatch?: KBMatchExtended): { label: string; emoji: string } {
    if (!kbMatch) return { label: 'New Issue', emoji: '🆕' };

    if (kbMatch.source) {
      return KNOWLEDGE_LEVEL[kbMatch.source] || KNOWLEDGE_LEVEL.ai_learned;
    }

    // Infer source from data
    if (kbMatch.resolvedBy && kbMatch.resolution) {
      return KNOWLEDGE_LEVEL.human_verified;
    } else if (kbMatch.suggestedFix) {
      return KNOWLEDGE_LEVEL.ai_learned;
    } else {
      return KNOWLEDGE_LEVEL.seeded;
    }
  }

  private getSeverityEmoji(severity: string): string {
    return SEVERITY_EMOJI[severity.toLowerCase()] || '🔵';
  }

  private getDomainTag(domain: IssueDomain): { label: string; emoji: string } {
    return DOMAIN_TAG[domain] || DOMAIN_TAG.UNKNOWN;
  }

  private buildIncidentBlocks(incident: Incident, kbMatch?: KBMatchExtended): BlockKitBlock[] {
    const blocks: BlockKitBlock[] = [];
    const category = incident.classification.category || 'unknown';
    const domain = incident.classification.domain || 'UNKNOWN';
    const knowledgeLevel = this.getKnowledgeLevel(kbMatch);
    const domainTag = this.getDomainTag(domain);

    // Get domain-based owner
    const domainOwner = this.getOwnerForDomain(domain);

    // Header block with domain tag prominently displayed
    const severityEmoji = this.getSeverityEmoji(incident.classification.severity);
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${domainTag.emoji} ${domainTag.label} | ${severityEmoji} ${incident.classification.category || 'Error'}`,
        emoji: true,
      },
    });

    // Domain classification context block
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Domain:* ${domainTag.emoji} ${domain} | *Source:* ${incident.classification.sourceSystem || 'Unknown'} | *Reason:* ${incident.classification.domainReasoning || 'N/A'}`,
        },
      ],
    });

    // Owner tagging section - based on domain
    if (domainOwner) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Assigned to:* <@${domainOwner.slack_id}> (${domainOwner.name} - ${domain} Owner)`,
        },
      });
    }

    // Store and page info
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Site:*\n${incident.siteName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Page:*\n${incident.affectedPage}`,
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${new Date(incident.timestamp).toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Severity:*\n${incident.classification.severity}`,
        },
      ],
    });

    // Classification, confidence, and knowledge level
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Classification:* ${incident.classification.category || 'Unknown'}\n*Confidence:* ${incident.classification.confidence}%\n*Impact Score:* ${incident.impactScore?.toFixed(2) || 'N/A'}\n*Knowledge:* ${knowledgeLevel.emoji} ${knowledgeLevel.label}`,
      },
    });

    // Error details in code block
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error Details:*\n\`\`\`${incident.errorDetail.substring(0, 500)}${incident.errorDetail.length > 500 ? '...' : ''}\`\`\``,
      },
    });

    // KB Match info with historical solution
    if (kbMatch) {
      let kbText = `*${knowledgeLevel.emoji} Known Pattern:* Seen ${kbMatch.occurrences} times\n_Last seen: ${new Date(kbMatch.lastSeen).toLocaleString()}_`;

      // Show previous resolution if available (human-verified fix)
      if (kbMatch.resolution && kbMatch.resolvedBy) {
        kbText += `\n\n*✅ Previous Solution (by ${kbMatch.resolvedBy}):*\n>${kbMatch.resolution}`;
        if (kbMatch.resolvedAt) {
          kbText += `\n_Resolved on: ${new Date(kbMatch.resolvedAt).toLocaleString()}_`;
        }
      }
      // Show AI-suggested fix if no human resolution
      else if (kbMatch.suggestedFix) {
        kbText += `\n\n*🤖 Suggested Fix:*\n>${kbMatch.suggestedFix}`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: kbText,
        },
      });
    } else {
      // New issue - no known pattern
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🆕 New Issue:* This error has not been seen before. Once resolved, the solution will be stored for future reference.`,
        },
      });
    }

    // Divider before actions
    blocks.push({ type: 'divider' });

    // Screenshot section (if available)
    if (incident.screenshotPath) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '📸 Screenshot attached as thread reply',
          },
        ],
      });
    }

    // Action buttons
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✓ Mark Resolved',
            emoji: true,
          },
          value: `resolve_${incident.incidentId}`,
          action_id: `resolve_${incident.incidentId}`,
          style: 'primary',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✗ False Positive',
            emoji: true,
          },
          value: `dismiss_${incident.incidentId}`,
          action_id: `dismiss_${incident.incidentId}`,
          style: 'danger',
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔍 View Details',
            emoji: true,
          },
          url: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/incident/${incident.incidentId}`,
          action_id: `view_${incident.incidentId}`,
        },
      ],
    });

    return blocks;
  }

  private logMockMessage(
    title: string,
    incident: Incident,
    kbMatch?: KBMatchExtended
  ): void {
    const severityEmoji = this.getSeverityEmoji(incident.classification.severity);
    const domain = incident.classification.domain || 'UNKNOWN';
    const domainTag = this.getDomainTag(domain);
    const knowledgeLevel = this.getKnowledgeLevel(kbMatch);
    const domainOwner = this.getOwnerForDomain(domain);

    console.log('\n');
    console.log(chalk.blue('════════════════════════════════════════════════════════'));
    console.log(chalk.bold(`${domainTag.emoji} ${domainTag.label} | ${severityEmoji} ${title}`));
    console.log(chalk.blue('════════════════════════════════════════════════════════'));

    // Domain info
    console.log(chalk.cyan('Domain:'), `${domainTag.emoji} ${domain}`);
    console.log(chalk.cyan('Source System:'), incident.classification.sourceSystem || 'Unknown');
    console.log(chalk.cyan('Domain Reason:'), incident.classification.domainReasoning || 'N/A');

    // Owner based on domain
    if (domainOwner) {
      console.log(chalk.magenta('Assigned to:'), `@${domainOwner.slack_id} (${domainOwner.name} - ${domain} Owner)`);
    }

    console.log(chalk.cyan('Site:'), incident.siteName);
    console.log(chalk.cyan('Page:'), incident.affectedPage);
    console.log(chalk.cyan('Time:'), new Date(incident.timestamp).toLocaleString());
    console.log(chalk.cyan('Severity:'), this.getSeverityColor(incident.classification.severity)(incident.classification.severity));
    console.log(chalk.cyan('Classification:'), incident.classification.category || 'Unknown');
    console.log(chalk.cyan('Confidence:'), `${incident.classification.confidence}%`);
    console.log(chalk.cyan('Impact Score:'), incident.impactScore?.toFixed(2) || 'N/A');
    console.log(chalk.cyan('Knowledge:'), `${knowledgeLevel.emoji} ${knowledgeLevel.label}`);

    console.log(chalk.cyan('\nError:'));
    console.log(chalk.gray(incident.errorDetail.substring(0, 500)));
    if (incident.errorDetail.length > 500) {
      console.log(chalk.gray('...'));
    }

    if (kbMatch) {
      console.log(chalk.yellow(`\n${knowledgeLevel.emoji} Known Pattern:`));
      console.log(chalk.gray(`  Seen ${kbMatch.occurrences} times`));
      console.log(chalk.gray(`  Last seen: ${new Date(kbMatch.lastSeen).toLocaleString()}`));

      if (kbMatch.resolution && kbMatch.resolvedBy) {
        console.log(chalk.green(`\n  ✅ Previous Solution (by ${kbMatch.resolvedBy}):`));
        console.log(chalk.white(`     ${kbMatch.resolution}`));
        if (kbMatch.resolvedAt) {
          console.log(chalk.gray(`     Resolved on: ${new Date(kbMatch.resolvedAt).toLocaleString()}`));
        }
      } else if (kbMatch.suggestedFix) {
        console.log(chalk.blue(`\n  🤖 Suggested Fix:`));
        console.log(chalk.white(`     ${kbMatch.suggestedFix}`));
      }
    } else {
      console.log(chalk.cyan('\n🆕 New Issue:'));
      console.log(chalk.gray('  This error has not been seen before.'));
    }

    console.log(chalk.cyan('\nActions:'));
    console.log(chalk.gray('  • ✓ Mark Resolved'));
    console.log(chalk.gray('  • ✗ False Positive'));
    console.log(chalk.gray('  • 🔍 View Details'));
    console.log(chalk.blue('════════════════════════════════════════════════════════\n'));
  }

  private getSeverityColor(severity: string): (text: string) => string {
    switch (severity.toLowerCase()) {
      case 'critical':
        return chalk.red;
      case 'high':
        return chalk.yellow;
      case 'medium':
        return chalk.blue;
      case 'low':
        return chalk.green;
      default:
        return chalk.gray;
    }
  }

  async sendIncidentAlert(
    incident: Incident,
    channel: string,
    kbMatch?: KBMatchExtended
  ): Promise<string | null> {
    // Determine the correct channel based on error category
    const category = incident.classification.category || 'unknown';
    const teamInfo = this.getTeamForCategory(category);
    const targetChannel = teamInfo?.channel || channel;
    const domain = incident.classification.domain || 'UNKNOWN';
    const domainTag = this.getDomainTag(domain);

    if (this.mockMode) {
      this.logMockMessage(
        incident.classification.category || 'Error Alert',
        incident,
        kbMatch
      );
      return `mock_${incident.incidentId}_${Date.now()}`;
    }

    if (!this.client) {
      console.warn('Slack client not initialized. Set MOCK_MODE=false and provide SLACK_BOT_TOKEN.');
      return null;
    }

    try {
      const blocks = this.buildIncidentBlocks(incident, kbMatch);

      const response = await this.client.chat.postMessage({
        channel: targetChannel,
        blocks,
        text: `${domainTag.emoji} ${domainTag.label} | ${this.getSeverityEmoji(incident.classification.severity)} ${incident.classification.category} on ${incident.siteName}`,
      });

      const messageTs = response.ts || null;

      // Upload screenshot as thread reply if available
      if (incident.screenshotPath && messageTs) {
        try {
          const fileContent = fs.readFileSync(incident.screenshotPath);
          await this.client.files.uploadV2({
            channel_id: targetChannel,
            thread_ts: messageTs,
            file: fileContent,
            filename: `screenshot_${incident.incidentId}.png`,
            initial_comment: '📸 Screenshot at time of error',
          });
        } catch (uploadError) {
          console.warn('Failed to upload screenshot:', uploadError);
        }
      }

      return messageTs;
    } catch (error: any) {
      console.error('Failed to send incident alert to Slack:', error);
      // Throw the error so the caller can see the actual Slack error message
      throw new Error(error?.data?.error || error?.message || 'Unknown Slack error');
    }
  }

  async sendScanSummary(
    results: ScanResult[],
    channel: string
  ): Promise<void> {
    const totalIssues = results.reduce(
      (sum, r) => sum + r.networkErrors.length + r.consoleErrors.length,
      0
    );

    const blocks: BlockKitBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Scan Summary',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Sites Scanned:*\n${results.length}`,
          },
          {
            type: 'mrkdwn',
            text: `*Total Issues:*\n${totalIssues}`,
          },
          {
            type: 'mrkdwn',
            text: `*Scan Time:*\n${new Date().toLocaleString()}`,
          },
        ],
      },
    ];

    if (this.mockMode) {
      console.log('\n');
      console.log(chalk.blue('════════════════════════════════════════'));
      console.log(chalk.bold('📊 Scan Summary'));
      console.log(chalk.blue('════════════════════════════════════════'));
      console.log(chalk.cyan('Sites Scanned:'), results.length);
      console.log(chalk.cyan('Total Issues:'), totalIssues);
      console.log(chalk.cyan('Scan Time:'), new Date().toLocaleString());
      console.log(chalk.blue('════════════════════════════════════════\n'));
      return;
    }

    if (!this.client) {
      console.warn('Slack client not initialized.');
      return;
    }

    try {
      await this.client.chat.postMessage({
        channel,
        blocks,
        text: `Scan Summary: ${totalIssues} issues found across ${results.length} sites`,
      });
    } catch (error) {
      console.error('Failed to send scan summary to Slack:', error);
    }
  }

  /**
   * Send a test message to verify Slack integration is working
   */
  async sendTestMessage(channel: string): Promise<boolean> {
    const testBlocks: BlockKitBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🧪 Slack Integration Test',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Status:* ✅ Connection successful!\n*Time:* ${new Date().toLocaleString()}\n*Mode:* ${this.mockMode ? 'Mock' : 'Live'}`,
        },
      },
    ];

    if (this.mockMode) {
      console.log('\n');
      console.log(chalk.green('════════════════════════════════════════'));
      console.log(chalk.bold('🧪 Slack Integration Test'));
      console.log(chalk.green('════════════════════════════════════════'));
      console.log(chalk.green('Status: ✅ Mock mode - would send to Slack'));
      console.log(chalk.cyan('Channel:'), channel);
      console.log(chalk.cyan('Time:'), new Date().toLocaleString());
      console.log(chalk.green('════════════════════════════════════════\n'));
      return true;
    }

    if (!this.client) {
      console.error('Slack client not initialized. Check SLACK_BOT_TOKEN.');
      return false;
    }

    try {
      await this.client.chat.postMessage({
        channel,
        blocks: testBlocks,
        text: 'Slack integration test successful!',
      });
      console.log(chalk.green('✅ Test message sent successfully!'));
      return true;
    } catch (error) {
      console.error('Failed to send test message:', error);
      return false;
    }
  }

  close(): void {
    // Cleanup if needed
  }
}

export default SlackBot;
