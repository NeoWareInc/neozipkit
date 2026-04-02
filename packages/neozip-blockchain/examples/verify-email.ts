#!/usr/bin/env node

/**
 * Verify Email - Register and verify email for Zipstamp server
 *
 * Tasks that use the Zipstamp server (stamp-zip, upgrade-zip, mint-nft) require
 * a verified email. This script registers your email; the server sends a
 * verification link. After you click the link, run this script again with your
 * email to save it to .env.local.
 *
 * Usage:
 *   yarn verify-email [email]
 *   ts-node examples/verify-email.ts [email]
 *
 * If <email> is omitted, you will be prompted. After first run, click the
 * verification link in the email, then run again with your email to save.
 *
 * Examples:
 *   yarn verify-email
 *   yarn verify-email user@example.com
 *
 * PREREQUISITES:
 * - Zipstamp server (default: https://zipstamp-dev.neozip.io)
 * - Set ZIPSTAMP_SERVER_URL (or TOKEN_SERVER_URL) if different
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import { registerEmail } from '../src/zipstamp-server';
import { getZipStampServerUrl } from '../src/zipstamp-server';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

/**
 * Update or append a single key=value line in .env.local.
 */
function setEnvLocalKey(key: string, value: string): void {
  const line = `${key}=${value}\n`;
  const content = fs.existsSync(envLocalPath)
    ? fs.readFileSync(envLocalPath, 'utf8')
    : '';
  const keyPrefix = `${key}=`;
  let newContent: string;
  if (content.includes(keyPrefix)) {
    newContent = content.replace(
      new RegExp(`${keyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*(\\n|$)`, 'm'),
      line
    );
  } else {
    const trimmed = content.trimEnd();
    newContent = trimmed ? `${trimmed}\n${line}` : line;
  }
  fs.writeFileSync(envLocalPath, newContent, 'utf8');
}

/**
 * Save the verified email to .env.local as ZIPSTAMP_EMAIL (and TOKEN_SERVER_EMAIL for backward compatibility).
 */
function saveEmailToEnvLocal(email: string): void {
  setEnvLocalKey('ZIPSTAMP_EMAIL', email);
  setEnvLocalKey('TOKEN_SERVER_EMAIL', email);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let email = args[0];

  const serverUrl = getZipStampServerUrl();

  if (!email) {
    console.log('');
    console.log('Zipstamp server requires a verified email for stamp/upgrade/mint.');
    console.log('');
    email = await ask('Email to verify: ');
    if (!email) {
      console.error('No email provided.');
      process.exit(1);
    }
    console.log('');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Register or check status (server sends verification link; if already verified, we save)
  console.log(`Registering ${normalizedEmail}...`);
  const regResult = await registerEmail(normalizedEmail, { serverUrl });
  if (!regResult.success) {
    console.error('Registration failed:', regResult.error ?? regResult.message);
    process.exit(1);
  }
  const msg = (regResult.message ?? '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already verified') || msg.includes('verified')) {
    saveEmailToEnvLocal(normalizedEmail);
    console.log(regResult.message ?? 'This email is already verified.');
    console.log('');
    console.log('Saved to .env.local. You can use stamp-zip, upgrade-zip, and mint-nft without passing --email.');
    process.exit(0);
  }
  // New registration: server sent a verification link (no code to enter)
  console.log(regResult.message ?? 'Verification link sent.');
  console.log('');
  console.log('Click the verification link in your email, then run:');
  console.log(`  yarn verify-email ${normalizedEmail}`);
  console.log('');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
