#!/usr/bin/env node

/**
 * Verify Email — Register with NeoZip Token Service and save `TOKEN_SERVICE_EMAIL`
 *
 * Stamp/upgrade/mint examples need a verified email. This script calls `POST /auth/register`,
 * which sends a **6-digit code** and either:
 * - **`browser`** (default): web confirmation link + code (scripts, curl, IDEs)
 * - **`app`**: NeoZip deep link + code only (no web link; finish in desktop app)
 *
 * Usage:
 *   yarn verify-email [email] [--browser | --app | --delivery=browser|app]
 *   ts-node examples/verify-email.ts [email] [--browser | --app | --delivery=browser|app]
 *
 * Env (optional, same values as token service):
 *   TOKEN_SERVICE_VERIFICATION_DELIVERY=browser   # default when unset
 *   TOKEN_SERVICE_VERIFICATION_DELIVERY=app
 *
 * After you complete verification (link and/or code), run again with the same email to
 * write `TOKEN_SERVICE_EMAIL` to `.env.local`.
 *
 * Examples:
 *   yarn verify-email
 *   yarn verify-email user@example.com --app
 *   yarn verify-email user@example.com --delivery=browser
 *
 * PREREQUISITES:
 * - NeoZip Token Service (default: https://testnet.token-service.neozip.io)
 * - Set TOKEN_SERVICE_URL if different from the default
 */

import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import {
  registerEmail,
  parseVerificationDeliveryInput,
  getTokenServiceUrl,
  type VerificationDelivery,
} from '../src/token-service';

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
 * Save the verified email to .env.local as TOKEN_SERVICE_EMAIL.
 */
function saveEmailToEnvLocal(email: string): void {
  setEnvLocalKey('TOKEN_SERVICE_EMAIL', email);
}

function parseArgv(argv: string[]): {
  positional: string[];
  verificationDelivery?: VerificationDelivery;
} {
  let explicitBrowser = false;
  let explicitApp = false;
  let deliveryEq: string | undefined;
  const positional: string[] = [];

  for (const a of argv) {
    if (a === '--browser') explicitBrowser = true;
    else if (a === '--app') explicitApp = true;
    else if (a.startsWith('--delivery=')) deliveryEq = a.slice('--delivery='.length);
    else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else positional.push(a);
  }

  if (explicitBrowser && explicitApp) {
    console.error('Use only one of --browser and --app.');
    process.exit(1);
  }

  let verificationDelivery: VerificationDelivery | undefined;
  if (explicitApp) verificationDelivery = 'app';
  else if (explicitBrowser) verificationDelivery = 'browser';
  else if (deliveryEq !== undefined) {
    try {
      verificationDelivery = parseVerificationDeliveryInput(deliveryEq);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  } else {
    try {
      verificationDelivery = parseVerificationDeliveryInput(
        process.env.TOKEN_SERVICE_VERIFICATION_DELIVERY
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }

  return { positional, verificationDelivery };
}

function printAfterRegisterInstructions(email: string, delivery: VerificationDelivery | undefined): void {
  const d = delivery ?? 'browser';
  console.log('');
  if (d === 'app') {
    console.log('Delivery: app — email contains a NeoZip deep link and your code (no web confirm link).');
    console.log('Open NeoZip from that link, or enter the 6-digit code in the app, to finish verification.');
  } else {
    console.log('Delivery: browser — email contains a web confirmation link and your code.');
    console.log('Click the link or complete verification in the app, as described in the email.');
  }
  console.log('');
  console.log('When your email is verified, run again to save it for examples:');
  console.log(`  yarn verify-email ${email}${d === 'app' ? ' --app' : ''}`);
  console.log('');
  console.log('Optional: verify with the 6-digit code from the CLI:');
  console.log(
    `  ts-node -r tsconfig-paths/register --project examples/tsconfig.json examples/token-service-auth.ts verify ${email} <code>`
  );
  console.log('');
}

async function main(): Promise<void> {
  const { positional, verificationDelivery } = parseArgv(process.argv.slice(2));
  let email = positional[0];

  const serverUrl = getTokenServiceUrl();

  if (!email) {
    console.log('');
    console.log('NeoZip Token Service requires a verified email for stamp/upgrade/mint.');
    console.log('');
    email = await ask('Email to verify: ');
    if (!email) {
      console.error('No email provided.');
      process.exit(1);
    }
    console.log('');
  }

  const normalizedEmail = email.toLowerCase().trim();

  const regLabel =
    verificationDelivery === undefined
      ? 'browser (server default)'
      : verificationDelivery;
  console.log(`Registering ${normalizedEmail} (verification delivery: ${regLabel})...`);
  const regResult = await registerEmail(normalizedEmail, { serverUrl, verificationDelivery });
  if (!regResult.success) {
    console.error('Registration failed:', regResult.error ?? regResult.message);
    process.exit(1);
  }
  const effectiveDelivery = regResult.verificationDelivery ?? verificationDelivery;
  if (effectiveDelivery) {
    console.log(`Server verification delivery: ${effectiveDelivery}`);
  }
  const msg = (regResult.message ?? '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already verified') || msg.includes('verified')) {
    saveEmailToEnvLocal(normalizedEmail);
    console.log(regResult.message ?? 'This email is already verified.');
    console.log('');
    console.log('Saved to .env.local. You can use stamp-zip, upgrade-zip, and mint-nft without passing --email.');
    process.exit(0);
  }
  console.log(regResult.message ?? 'Verification email sent.');
  printAfterRegisterInstructions(normalizedEmail, effectiveDelivery);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
