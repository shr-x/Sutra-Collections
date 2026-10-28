/**
 * Prints the scrypt hash for the SHRX console password.
 *
 *   npx tsx scripts/hash-shrx-password.ts
 *
 * Prompts twice without echoing (so the password never lands in shell
 * history), then prints ONE line: paste it over SHRX_PASSWORD_HASH in
 * lib/shrx/password.ts. The password itself is never printed or written.
 * For non-interactive use, pipe it on stdin: `printf '%s' "$PW" | npx tsx …`.
 */
import { hashShrxPassword, verifyShrxPassword } from '../lib/shrx/password';

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => { data += c; });
      stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(value);
      } else if (ch === '\u0003') {
        process.stdout.write('\n'); process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const pw = await readHidden('New SHRX password: ');
  if (process.stdin.isTTY) {
    const again = await readHidden('Repeat: ');
    if (again !== pw) { console.error('Passwords do not match.'); process.exit(1); }
  }
  if (pw.length < 12) { console.error('Use at least 12 characters.'); process.exit(1); }
  const hash = hashShrxPassword(pw);
  if (!verifyShrxPassword(pw, hash)) { console.error('Self-check failed.'); process.exit(1); }
  console.log(hash);
}

main();
