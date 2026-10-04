#!/usr/bin/env npx tsx
/**
 * Manual test for PESU Academy login + dispatcher profile enrichment.
 *
 * Usage:
 *   npx tsx scripts/test-academy-login.ts [username]
 *
 * Password can be provided securely via:
 *   1. Interactive masked prompt (recommended)
 *   2. ACADEMY_PASSWORD environment variable
 *   3. CLI argument: npx tsx scripts/test-academy-login.ts <username> <password> (warns about history exposure)
 *
 * What it verifies:
 *  - Login succeeds and returns a token + userId
 *  - Dispatcher is called even when accessToken is null
 *  - Profile has full nameAsInSSLC (not just first name)
 *  - PRN and SRN are distinct (SRN != PRN when dispatcher works)
 *  - Campus is deduced from the SRN, not the PRN
 */

import readline from 'node:readline';
import { AcademyClient } from '../src/lib/academy/client.js';

async function getUsername(): Promise<string> {
  if (process.argv[2]) {
    return process.argv[2];
  }
  if (process.env.ACADEMY_USERNAME) {
    return process.env.ACADEMY_USERNAME;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Username (SRN/PRN): ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getPassword(): Promise<string> {
  if (process.env.ACADEMY_PASSWORD) {
    return process.env.ACADEMY_PASSWORD;
  }
  if (process.argv[3]) {
    console.warn('⚠️  Warning: Passing passwords via CLI arguments exposes them in shell history and process listings.');
    return process.argv[3];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      rl.question('Password: ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  // Masked input for interactive TTY
  return new Promise((resolve) => {
    process.stdout.write('Password: ');
    const stdin = process.stdin;
    let password = '';

    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      for (const char of str) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          rl.close();
          resolve(password);
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(1);
        } else if (char === '\u007f' || char === '\b') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += char;
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const username = await getUsername();
  const password = await getPassword();

  if (!username || !password) {
    console.error('Error: Username and password are required.');
    process.exit(1);
  }

  console.log(`\n🔐 Logging in as: ${username}\n`);
  const client = new AcademyClient();

  try {
    const result = await client.login(username, password);

    console.log('✅ Login successful!\n');

    console.log('── Session ──');
    console.log(`  token          : ${result.session.token ? result.session.token.slice(0, 10) + '… (masked)' : '(empty)'}`);
    console.log(`  accessToken    : ${result.session.accessToken ? result.session.accessToken.slice(0, 10) + '… (masked)' : '(null — expected with new API)'}`);
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
      process.exit(0);
    } else {
      console.error(`\n❌ ${issues} issue(s) detected — see warnings above.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Login failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
