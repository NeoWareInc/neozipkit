/**
 * Zipstamp Server Authentication Example
 *
 * Demonstrates the email-based authentication flow for the Zipstamp server:
 * 1. Register an email address
 * 2. Verify with the code sent to email
 * 3. Use your verified email when stamping (include email in stamp requests)
 *
 * Usage:
 *   ts-node examples/zipstamp-server-auth.ts register <email>
 *   ts-node examples/zipstamp-server-auth.ts verify <email> <code>
 *
 * Environment Variables:
 *   ZIPSTAMP_SERVER_URL - Zipstamp server URL (default: https://zipstamp-dev.neozip.io)
 */

import {
  registerEmail,
  verifyEmailCode,
  getZipStampServerUrl,
} from '../src/zipstamp-server';

// =============================================================================
// Configuration
// =============================================================================

async function cmdRegister(email: string): Promise<void> {
  console.log('Zipstamp Server Authentication');
  console.log('===========================\n');
  console.log(`Server: ${getZipStampServerUrl()}`);
  console.log(`Email: ${email}\n`);

  console.log('Registering email...');
  const result = await registerEmail(email, { serverUrl: getZipStampServerUrl() });

  if (result.success) {
    console.log('\n✅ Registration initiated!');
    console.log(result.message || 'Check your email for the verification code.');
    console.log('\nNext step:');
    console.log(`  ts-node examples/zipstamp-server-auth.ts verify ${email} <code>`);
  } else {
    console.error('\n❌ Registration failed:', result.error);
    process.exit(1);
  }
}

async function cmdVerify(email: string, code: string): Promise<void> {
  console.log('Zipstamp Server Authentication');
  console.log('===========================\n');
  console.log(`Server: ${getZipStampServerUrl()}`);
  console.log(`Email: ${email}`);
  console.log(`Code: ${code}\n`);

  console.log('Verifying email...');
  const result = await verifyEmailCode(email, code, { serverUrl: getZipStampServerUrl() });

  if (result.success) {
    console.log('\n✅ Email verified successfully!');
    console.log(result.message || '');
    console.log('\nYou can now submit digests for timestamping by including your email in stamp requests.');
  } else {
    console.error('\n❌ Verification failed:', result.error);
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
      case 'register':
        if (!args[1]) {
          console.error('Usage: ts-node examples/zipstamp-server-auth.ts register <email>');
          process.exit(1);
        }
        await cmdRegister(args[1]);
        break;

      case 'verify':
        if (!args[1] || !args[2]) {
          console.error('Usage: ts-node examples/zipstamp-server-auth.ts verify <email> <code>');
          process.exit(1);
        }
        await cmdVerify(args[1], args[2]);
        break;

      default:
        console.log('Zipstamp Server Authentication Example');
        console.log('===================================\n');
        console.log('Commands:');
        console.log('  register <email>     - Register an email address');
        console.log('  verify <email> <code> - Verify email with code from email');
        console.log('\nEnvironment Variables:');
        console.log('  ZIPSTAMP_SERVER_URL     - Zipstamp server URL');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
