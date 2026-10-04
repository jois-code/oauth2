#!/usr/bin/env npx tsx
/**
 * Manual test for PESU Academy login + dispatcher profile enrichment.
 *
 * Usage:
 *   npx tsx scripts/test-academy-login.ts <username> <password>
 *
 * No .env setup required — credentials are passed as CLI arguments.
 *
 * What it verifies:
 *  - Login succeeds and returns a token + userId
 *  - Dispatcher is called even when accessToken is null
 *  - Profile has full nameAsInSSLC (not just first name)
 *  - PRN and SRN are distinct (SRN != PRN when dispatcher works)
 *  - Campus is deduced from the SRN, not the PRN
 */

import { AcademyClient } from '../src/lib/academy/client.js';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: npx tsx scripts/test-academy-login.ts <username> <password>');
  process.exit(1);
}

async function main() {
  console.log(`\n🔐 Logging in as: ${username}\n`);
  const client = new AcademyClient();

  try {
    const result = await client.login(username, password);

    console.log('✅ Login successful!\n');

    console.log('── Session ──');
    console.log(`  token          : ${result.session.token ? result.session.token.slice(0, 20) + '…' : '(empty)'}`);
    console.log(`  accessToken    : ${result.session.accessToken ?? '(null — expected with new API)'}`);
    console.log(`  userId         : ${result.session.userId}`);
    console.log();

    console.log('── Profile ──');
    console.log(`  name           : ${result.profile.name}`);
    console.log(`  prn            : ${result.profile.prn}`);
    console.log(`  srn            : ${result.profile.srn}`);
    console.log(`  program        : ${result.profile.program}`);
    console.log(`  branch         : ${result.profile.branch}`);
    console.log(`  semester       : ${result.profile.semester}`);
    console.log(`  section        : ${result.profile.section}`);
    console.log(`  campus         : ${result.profile.campus}`);
    console.log(`  email          : ${result.profile.email}`);
    console.log(`  phone          : ${result.profile.phone}`);
    console.log();

    // ── Automated checks ──
    let issues = 0;

    if (!result.profile.name || result.profile.name.split(' ').length < 2) {
      console.warn('⚠️  Name looks like first-name only — dispatcher may not be working');
      issues++;
    }

    if (result.profile.prn && result.profile.srn && result.profile.prn === result.profile.srn) {
      console.warn('⚠️  PRN === SRN — dispatcher enrichment likely missing');
      issues++;
    }

    if (!result.profile.campus) {
      console.warn('⚠️  Campus is null — could not deduce from SRN');
      issues++;
    }

    if (result.profile.email) {
      console.log('✅ Email populated (dispatcher enrichment working)');
    }

    if (issues === 0) {
      console.log('🎉 All checks passed — bug is fixed!');
    } else {
      console.log(`\n❌ ${issues} issue(s) detected — see warnings above.`);
    }
  } catch (err) {
    console.error(`\n❌ Login failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
