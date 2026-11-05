/** Read-only upstream comparison: never merge, commit, push, update lock or install code. */
import process from 'node:process';
import {URL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
const lock = JSON.parse(readFileSync(new URL('../upstream.lock', import.meta.url),'utf8'));
if(lock.repository !== 'https://github.com/tencent-connect/qqbot-nodejs.git' || !/^[0-9a-f]{40}$/.test(lock.commit)) throw new Error('Invalid upstream lock');
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex < 0 ? undefined : resolve(process.argv[outputIndex+1]);
const scratch = mkdtempSync(join(tmpdir(),'qqbot-upstream-'));
const git = (...args) => execFileSync('git',args,{cwd:scratch,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024,timeout:120000});
try {
  const head = git('ls-remote',lock.repository,'HEAD').split(/\s/)[0];
  if(!/^[0-9a-f]{40}$/.test(head)) throw new Error('Upstream HEAD is not a commit');
  git('init','--bare');
  git('fetch','--no-tags',lock.repository,lock.commit,head);
  const stat=git('diff','--stat',lock.commit,head);
  const commits=git('log','--oneline',`${lock.commit}..${head}`);
  const diff=git('diff','--binary',lock.commit,head);
  const report=`# Official upstream check\n\nChecked: ${new Date().toISOString()}\n\nRepository: ${lock.repository}\nPinned: ${lock.commit} (${lock.version})\nOfficial HEAD: ${head}\nStatus: ${head===lock.commit?'unchanged':'changed; manual review required'}\n\n## Commits after baseline\n\n\`\`\`text\n${commits || '(none)\n'}\`\`\`\n\n## Baseline → official HEAD diffstat\n\n\`\`\`text\n${stat || '(none)\n'}\`\`\`\n\nNo lock updates, merges, package publishing or code execution from upstream occurred.\n`;
  if(output){mkdirSync(output,{recursive:true});writeFileSync(join(output,'summary.md'),report);writeFileSync(join(output,'upstream.diff'),diff);}
  process.stdout.write(report);
} finally {rmSync(scratch,{recursive:true,force:true});}
