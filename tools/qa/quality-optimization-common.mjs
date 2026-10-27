// Dedicated QA browser only: the measurement harness closes its old test tabs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let puppeteer;
if (process.env.PUPPETEER_PATH) puppeteer = require(process.env.PUPPETEER_PATH);
else try { puppeteer = require('puppeteer-core'); }
catch { puppeteer = require(path.join(execFileSync('npm', ['root', '-g'], {encoding:'utf8'}).trim(), 'puppeteer-core')); }
const outputDir = path.resolve(process.env.QA_OUT || 'work/quality-optimization');
fs.mkdirSync(outputDir, { recursive:true });
export { puppeteer as p, outputDir };
