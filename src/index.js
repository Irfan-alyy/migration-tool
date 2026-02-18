const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs-extra');
const path = require('path');

// Fix: front-matter export might be different
let toYAML;
try {
  // Try different import patterns for front-matter
  const fm = require('front-matter');
  toYAML = fm.stringify || fm; // Some versions export stringify directly
} catch (e) {
  // Fallback: use js-yaml if front-matter doesn't work
  console.log('front-matter import failed, using js-yaml fallback');
  const yaml = require('js-yaml');
  toYAML = (obj) => yaml.dump(obj);
}

// Load environment variables
dotenv.config();

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR);
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR);
const MEDIA_SOURCE = path.resolve(process.env.MEDIA_SOURCE);

// Main async function
(async () => {
  try {
    // Ensure output directory is clean
    await fs.emptyDir(OUTPUT_DIR);
    console.log(`✅ Cleaned output directory: ${OUTPUT_DIR}`);

    // 1. Connect to MySQL
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    console.log('✅ Connected to MySQL database');

    // 2. Fetch all published, non-deleted resources
    const [resources] = await connection.execute(
      `SELECT id, pagetitle, longtitle, description, alias, content, parent, template, uri
       FROM modx_site_content
       WHERE published = 1 AND deleted = 0`
    );

    console.log(`📄 Found ${resources.length} published resources`);

    // 3. Build a map of id -> alias for parent lookup
    const aliasMap = {};
    resources.forEach(r => aliasMap[r.id] = r.alias);

    // 4. Helper to build full slug
    function buildSlug(resource) {
      if (resource.uri && resource.uri !== '') {
        return resource.uri;
      }
      const parts = [];
      let current = resource;
      while (current.parent !== 0) {
        parts.unshift(aliasMap[current.parent] || '');
        current = resources.find(r => r.id === current.parent) || { parent: 0 };
      }
      parts.push(resource.alias);
      return '/' + parts.filter(p => p).join('/');
    }

    // 5. Process each resource
    let processedCount = 0;
    for (const res of resources) {
      const slug = buildSlug(res);

      // Fetch template variables
      const [tvs] = await connection.execute(
        `SELECT tmplvarid, value FROM modx_site_tmplvar_contentvalues WHERE contentid = ?`,
        [res.id]
      );
      
      const tvObject = {};
      tvs.forEach(tv => tvObject[`tv_${tv.tmplvarid}`] = tv.value);

      // Frontmatter data
      const frontmatter = {
        title: res.pagetitle,
        slug,
        description: res.description || '',
        template: res.template === 1 ? 'home' : 'standard',
        ...tvObject,
      };

      const body = res.content || '';

      // Generate YAML frontmatter
      let yamlStr;
      try {
        yamlStr = toYAML(frontmatter);
      } catch (yamlError) {
        // Manual YAML generation as last resort
        yamlStr = Object.entries(frontmatter)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');
      }

      const fileName = `${res.id}.md`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      const fileContent = `---\n${yamlStr}---\n\n${body}`;
      
      await fs.writeFile(filePath, fileContent);
      processedCount++;
      
      if (processedCount % 10 === 0) {
        console.log(`📝 Processed ${processedCount}/${resources.length} resources`);
      }
    }

    console.log(`✅ Written ${processedCount} Markdown files`);

    // 6. Handle media files
    if (MEDIA_SOURCE && await fs.pathExists(MEDIA_SOURCE)) {
      console.log(`📁 Copying media from ${MEDIA_SOURCE} to ${PUBLIC_DIR}`);
      await fs.copy(MEDIA_SOURCE, PUBLIC_DIR);
      console.log('✅ Media files copied.');
    } else if (MEDIA_SOURCE) {
      console.log(`⚠️ Media source not found: ${MEDIA_SOURCE}`);
    }

    await connection.end();
    console.log('🎉 Migration complete successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
})();