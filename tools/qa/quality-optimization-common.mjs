// Dedicated QA browser only: the measurement harness closes its old test tabs.
import {
  loadPuppeteer,
  resolveOutputDir,
  cdpBrowserUrl,
  DEFAULT_CDP_PORT,
  DEFAULT_APP_PORT,
} from './load-puppeteer.mjs';

const p = loadPuppeteer(import.meta.url);
const outputDir = resolveOutputDir('quality-optimization');

export { p, outputDir, loadPuppeteer, resolveOutputDir, cdpBrowserUrl, DEFAULT_CDP_PORT, DEFAULT_APP_PORT };
