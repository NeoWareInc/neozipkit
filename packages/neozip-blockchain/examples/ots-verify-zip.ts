#!/usr/bin/env node

/**
 * OTS Verify ZIP - Verify OpenTimestamps proof in a ZIP file
 *
 * Simple example to test the OTS add-on: loads a ZIP with neozipkit,
 * then verifies any OpenTimestamps proof (TIMESTAMP.OTS / TS-SUBMIT.OTS)
 * using neozip-blockchain/ots.
 *
 * This is a legacy/add-on example. For primary timestamping use the
 * Zipstamp server flow (stamp-zip, upgrade-zip, verify-zip).
 *
 * Usage:
 *   ts-node examples/ots-verify-zip.ts <path-to.zip>
 *
 * Example:
 *   yarn example:ots-verify examples/output/myfile.nzip
 */

import { ZipkitNode } from 'neozipkit/node';
import { verifyOtsZip } from '../src/ots';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('OTS Verify ZIP Example\n');

  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Usage: ts-node examples/ots-verify-zip.ts <path-to.zip>');
    console.error('Example: yarn example:ots-verify examples/output/myfile.nzip');
    process.exit(1);
  }

  if (!fs.existsSync(zipPath)) {
    console.error(`Error: File not found: ${zipPath}`);
    process.exit(1);
  }

  console.log(`ZIP file: ${zipPath}\n`);

  try {
    const zip = new ZipkitNode();
    await zip.loadZipFile(zipPath);

    const result = await verifyOtsZip(zip);

    console.log('OpenTimestamps verification:');
    switch (result.status) {
      case 'none':
        console.log('  Status: No OpenTimestamps proof found in this ZIP.');
        console.log('  (Zipstamp server timestamps use TIMESTAMP.NZIP; this checks for TIMESTAMP.OTS / TS-SUBMIT.OTS)');
        break;
      case 'valid':
        console.log('  Status: Verified');
        if (result.blockHeight != null) {
          console.log(`  Bitcoin block: ${result.blockHeight}`);
        }
        if (result.attestedAt) {
          console.log(`  Attested at: ${result.attestedAt.toISOString()}`);
        }
        if (result.upgraded) {
          console.log('  (Upgraded proof available; use upgradeOTS to write it back to the ZIP.)');
        }
        break;
      case 'pending':
        console.log('  Status: Pending (waiting for Bitcoin confirmation)');
        if (result.message) {
          console.log(`  Info: ${result.message}`);
        }
        break;
      case 'error':
        console.log('  Status: Error');
        if (result.message) {
          console.log(`  ${result.message}`);
        }
        break;
    }

    await zip.closeFile();
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
