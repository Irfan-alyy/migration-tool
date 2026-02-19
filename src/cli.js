#!/usr/bin/env node
// src/cli.js
import fs from 'fs-extra';
import path from 'path';
import { getConfig } from './config.js';
import { createConnection, queryResources, queryTemplateVariables } from './db.js';
import { createTempDatabase, importDump, dropDatabase } from './importer.js';
import { buildAliasMap, parseResources } from './modx-parser.js';
import { writeMarkdownFile, getYAMLStringifier } from './markdown-writer.js';
import { copyMedia } from './media-copier.js';

async function main() {
  const config = getConfig();
  console.log("Config loaded:", config);
  try {
    // Prepare output directory: base/[project]/pages
    const pagesOutputDir = path.join(config.output, config.project, 'pages');
    await fs.emptyDir(pagesOutputDir);
    console.log(`✅ Cleaned output directory: ${pagesOutputDir}`);

    // 1. Create temporary database and import dump
    const dbName = await createTempDatabase(config.project, config.host, config.user, config.password, config.database);
    await importDump(config.dump, dbName, config.host, config.user, config.password);

    // 2. Connect to the temporary database
    const connection = await createConnection({ ...config, database: dbName });

    // 3. Fetch resources
    const resources = await queryResources(connection);
    console.log(`📄 Found ${resources.length} published resources`);

    // 4. Build alias map and parse slugs
    const aliasMap = buildAliasMap(resources);
    const parsedResources = parseResources(resources, aliasMap, resources);

    // 5. Process each resource
    const toYAML = getYAMLStringifier();
    for (const res of parsedResources) {
      const tvs = await queryTemplateVariables(connection, res.id);
      await writeMarkdownFile(pagesOutputDir, res, tvs, toYAML);
    }

    console.log(`✅ Written ${parsedResources.length} Markdown files`);

    // 6. Copy media if provided
    if (config.media) {
      const publicDir = path.join(config.output, '..', 'public'); // assumes output is ../astro-site/src/content
      await copyMedia(config.media, publicDir, config.project);
    }

    await connection.end();

    // 7. Cleanup: drop temp database
    if (config.cleanup) {
      await dropDatabase(dbName, config.host, config.user, config.password);
    }

    console.log('🎉 Migration complete successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();