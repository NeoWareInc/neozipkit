/**
 * Multi-Calendar Timestamping Example
 * 
 * Demonstrates using multiple calendar servers for redundancy,
 * similar to OpenTimestamps' approach of submitting to multiple calendars.
 * 
 * Benefits of multi-calendar:
 * - Redundancy: If one server is unavailable, others can still timestamp
 * - Trust distribution: Multiple independent servers record your timestamp
 * - Verification flexibility: Can verify from any server that has the proof
 * 
 * Usage:
 *   ts-node examples/multi-calendar-stamp.ts stamp <digest>
 *   ts-node examples/multi-calendar-stamp.ts verify <digest> [batchId]
 *   ts-node examples/multi-calendar-stamp.ts health
 * 
 * Environment Variables:
 *   NEOZIP_CALENDAR_1     - First calendar URL (required)
 *   NEOZIP_CALENDAR_2     - Second calendar URL (optional)
 *   NEOZIP_CALENDAR_3     - Third calendar URL (optional)
 *   NEOZIP_EMAIL         - Verified email for stamping (required for stamp command)
 */

import {
  CalendarManager,
  getZipStampServerUrl,
  type CalendarConfig,
  type CalendarStatus,
} from '../src/zipstamp-server';

// =============================================================================
// Configuration
// =============================================================================

function getCalendarConfigs(): CalendarConfig[] {
  const configs: CalendarConfig[] = [];

  // Support up to 5 calendars via environment variables
  for (let i = 1; i <= 5; i++) {
    const url = process.env[`NEOZIP_CALENDAR_${i}`];
    if (url) {
      configs.push({
        url,
        priority: i,
        name: `Calendar ${i}`,
      });
    }
  }

  // Fallback to single calendar if no numbered ones configured
  if (configs.length === 0) {
    const url = getZipStampServerUrl();
    configs.push({
      url,
      priority: 1,
      name: 'Default',
    });
  }

  return configs;
}

function formatStatus(status: CalendarStatus): string {
  const icon = status.available ? '✅' : '❌';
  const latency = status.latencyMs ? `${status.latencyMs}ms` : 'N/A';
  const healthStatus = status.health?.status || 'unknown';
  return `${icon} ${status.url} [${healthStatus}, ${latency}]`;
}

// =============================================================================
// Commands
// =============================================================================

async function cmdHealth(): Promise<void> {
  console.log('Multi-Calendar Health Check');
  console.log('===========================\n');

  const configs = getCalendarConfigs();
  console.log(`Checking ${configs.length} calendar(s)...\n`);

  const manager = new CalendarManager(configs);
  const statuses = await manager.checkAllHealth();

  console.log('Calendar Status:');
  console.log('----------------');
  for (const status of statuses) {
    console.log(formatStatus(status));
    if (status.identity) {
      console.log(`   ID: ${status.identity.id}`);
      console.log(`   Version: ${status.identity.version}`);
      console.log(`   Chains: ${status.identity.chains?.map(c => c.network).join(', ') || 'N/A'}`);
    }
    if (status.error) {
      console.log(`   Error: ${status.error}`);
    }
    console.log('');
  }

  const healthy = manager.getHealthyCalendars();
  const unhealthy = manager.getUnhealthyCalendars();
  
  console.log('Summary:');
  console.log(`  Healthy: ${healthy.length}`);
  console.log(`  Unhealthy: ${unhealthy.length}`);
  
  if (unhealthy.length > 0) {
    console.log(`\n⚠️  ${unhealthy.length} calendar(s) unavailable`);
  }
}

async function cmdStamp(digest: string): Promise<void> {
  const email = process.env.NEOZIP_EMAIL;
  if (!email) {
    console.error('\n❌ NEOZIP_EMAIL environment variable not set.');
    console.error('Stamping requires a verified email. Run: yarn verify-email');
    process.exit(1);
  }

  console.log('Multi-Calendar Timestamp');
  console.log('========================\n');
  console.log(`Digest: ${digest}`);
  console.log(`Email: ${email}\n`);

  const configs = getCalendarConfigs();
  const manager = new CalendarManager(configs);

  // Check health first
  console.log('Checking calendar health...');
  await manager.checkAllHealth();
  
  const healthy = manager.getHealthyCalendars();
  if (healthy.length === 0) {
    console.error('\n❌ No healthy calendars available.');
    process.exit(1);
  }

  console.log(`Found ${healthy.length} healthy calendar(s)\n`);
  console.log('Submitting to calendars...');

  try {
    const result = await manager.submitToMultiple(digest, undefined, email);
    
    console.log('\n✅ Timestamp submitted successfully!\n');
    console.log('Results:');
    console.log('--------');
    
    for (const success of result.successes) {
      console.log(`✅ ${success.calendar}`);
      console.log(`   Batch ID: ${success.result.batchId}`);
      console.log(`   Status: ${success.result.status}`);
    }
    
    if (result.failures.length > 0) {
      console.log('\nFailures (non-critical if at least one succeeded):');
      for (const failure of result.failures) {
        console.log(`❌ ${failure.calendar}: ${failure.error}`);
      }
    }

    console.log('\nSummary:');
    console.log(`  Successful: ${result.successes.length}`);
    console.log(`  Failed: ${result.failures.length}`);
    
    if (result.successes.length > 0) {
      console.log('\nYour timestamp is recorded on multiple independent servers!');
      console.log('You can verify using any of the successful calendars.');
    }
  } catch (error) {
    console.error('\n❌ Failed to submit:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function cmdVerify(digest: string, batchId?: string): Promise<void> {
  console.log('Multi-Calendar Verification');
  console.log('===========================\n');
  console.log(`Digest: ${digest}`);
  if (batchId) console.log(`Batch ID: ${batchId}`);
  console.log('');

  const configs = getCalendarConfigs();
  const manager = new CalendarManager(configs);

  // Check health first
  console.log('Checking calendar health...');
  await manager.checkAllHealth();
  
  const healthy = manager.getHealthyCalendars();
  if (healthy.length === 0) {
    console.error('\n❌ No healthy calendars available');
    process.exit(1);
  }

  console.log(`Found ${healthy.length} healthy calendar(s)\n`);
  console.log('Verifying (trying each calendar until success)...');

  try {
    // Verification is PUBLIC
    const result = await manager.verifyFromAny(digest, undefined, batchId);
    
    console.log('\n✅ Verification successful!\n');
    console.log(`Calendar: ${result.calendar}`);
    console.log(`Verified: ${result.result.verified}`);
    console.log(`Status: ${result.result.status}`);
    
    if (result.result.verified) {
      console.log('\nBlockchain Details:');
      console.log(`  Transaction: ${result.result.transactionHash}`);
      console.log(`  Block: ${result.result.blockNumber}`);
      console.log(`  Network: ${result.result.network}`);
      console.log(`  Batch ID: ${result.result.batchId}`);
      
      if (result.result.merkleProof) {
        console.log(`  Merkle Proof: ${result.result.merkleProof.length} nodes`);
      }
    } else {
      console.log('\n⏳ Timestamp is pending confirmation');
      console.log('The batch has not been confirmed on the blockchain yet.');
      console.log('Try again later or use --wait to poll for confirmation.');
    }
  } catch (error) {
    console.error('\n❌ Verification failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function cmdPoll(digest: string, batchId?: string): Promise<void> {
  console.log('Multi-Calendar Poll for Confirmation');
  console.log('====================================\n');
  console.log(`Digest: ${digest}`);
  if (batchId) console.log(`Batch ID: ${batchId}`);
  console.log('Timeout: 5 minutes');
  console.log('');

  const configs = getCalendarConfigs();
  const manager = new CalendarManager(configs);

  // Check health first
  console.log('Checking calendar health...');
  await manager.checkAllHealth();

  console.log('Polling for confirmation (this may take several minutes)...\n');

  const result = await manager.pollForConfirmation(
    digest,
    undefined,
    batchId,
    300000, // 5 minutes
    10000   // Check every 10 seconds
  );

  if (result && result.result.verified) {
    console.log('✅ Timestamp confirmed!\n');
    console.log(`Calendar: ${result.calendar}`);
    console.log(`Transaction: ${result.result.transactionHash}`);
    console.log(`Block: ${result.result.blockNumber}`);
    console.log(`Network: ${result.result.network}`);
  } else {
    console.log('⏰ Timeout - batch not yet confirmed');
    console.log('The batch may still be pending. Try again later.');
    process.exit(1);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'health':
        await cmdHealth();
        break;

      case 'stamp':
        if (!args[1]) {
          console.error('Usage: ts-node examples/multi-calendar-stamp.ts stamp <digest>');
          process.exit(1);
        }
        await cmdStamp(args[1]);
        break;

      case 'verify':
        if (!args[1]) {
          console.error('Usage: ts-node examples/multi-calendar-stamp.ts verify <digest> [batchId]');
          process.exit(1);
        }
        await cmdVerify(args[1], args[2]);
        break;

      case 'poll':
        if (!args[1]) {
          console.error('Usage: ts-node examples/multi-calendar-stamp.ts poll <digest> [batchId]');
          process.exit(1);
        }
        await cmdPoll(args[1], args[2]);
        break;

      default:
        console.log('Multi-Calendar Timestamping Example');
        console.log('===================================\n');
        console.log('Commands:');
        console.log('  health             - Check health of all configured calendars');
        console.log('  stamp <digest>     - Submit digest to all calendars');
        console.log('  verify <digest>    - Verify from any calendar');
        console.log('  poll <digest>      - Poll until confirmed');
        console.log('\nEnvironment Variables:');
        console.log('  NEOZIP_CALENDAR_1  - First calendar URL');
        console.log('  NEOZIP_CALENDAR_2  - Second calendar URL (optional)');
        console.log('  ... up to 5 calendars');
        console.log('  NEOZIP_EMAIL      - Verified email for stamp command');
        console.log('\nExample Setup:');
        console.log('  export NEOZIP_CALENDAR_1=https://alpha.timestamp.neozip.io');
        console.log('  export NEOZIP_CALENDAR_2=https://beta.timestamp.neozip.io');
        console.log('  export NEOZIP_EMAIL=your@email.com');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
