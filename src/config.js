// src/config.js
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export function getConfig() {
  return yargs(hideBin(process.argv))
    .option('dump', {
      type: 'string',
      demandOption: true,
      describe: 'Path to MODX SQL dump file',
    })
    .option('project', {
      type: 'string',
      demandOption: true,
      describe: 'Project name (used as subfolder)',
    })
    .option('output', {
      type: 'string',
      demandOption: true,
      describe: 'Base output directory for Astro content (e.g., ../astro-site/src/content)',
    })
    .option('media', {
      type: 'string',
      describe: 'Path to extracted media folder (optional)',
    })
    .option('host', {
      type: 'string',
      default: 'localhost',
      describe: 'MySQL host',
    })
    .option('user', {
      type: 'string',
      default: 'root',
      describe: 'MySQL user',
    })
    .option('database', {
      type: 'string',
      demandOption: true,
      describe: 'MySQL database name',
    })
    .option('password', {
      type: 'string',
      default: '',
      describe: 'MySQL password',
    })
    .option('cleanup', {
      type: 'boolean',
      default: true,
      describe: 'Drop temporary database after migration',
    })
    .help()
    .parse();
}