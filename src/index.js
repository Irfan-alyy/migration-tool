const mysql = require('mysql2/promise');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const minimist = require('minimist');

// Parse Command Line Arguments
const args = minimist(process.argv.slice(2), {
    string: ['output', 'public', 'media', 'db-host', 'db-user', 'db-pass', 'db-name', 'project'],
    default: {
        output: './output/content',
        public: './output/public',
        media: '',
        project: 'default',
        'db-host': 'localhost',
        'db-user': 'root',
        'db-pass': '',
        'db-name': 'modx'
    },
    alias: {
        o: 'output',
        p: 'public',
        m: 'media',
        proj: 'project',
        h: 'db-host',
        u: 'db-user',
        pass: 'db-pass',
        d: 'db-name'
    }
});

// Configuration
const PROJECT_NAME = args.project;
const OUTPUT_DIR = path.resolve(args.output);
const PUBLIC_DIR = path.resolve(args.public);
const MEDIA_SOURCE = args.media ? path.resolve(args.media) : '';
const PROJECT_CONTENT_DIR = path.join(OUTPUT_DIR, PROJECT_NAME);
const PROJECT_PUBLIC_DIR = path.join(PUBLIC_DIR, PROJECT_NAME);

// Helper: Fetch Chunks
async function fetchChunks(connection) {
    try {
        const [chunks] = await connection.execute(
            `SELECT name, snippet FROM modx_site_htmlsnippets`
        );
        const chunkMap = {};
        chunks.forEach(c => {
            if (c.name && c.snippet) {
                chunkMap[c.name] = c.snippet;
            }
        });
        console.log(`📦 Loaded ${Object.keys(chunkMap).length} chunks.`);
        return chunkMap;
    } catch (error) {
        console.warn('⚠️ Could not fetch chunks. Skipping chunk resolution.');
        return {};
    }
}

// Helper: Basic Chunk Replacement
function resolveModxContent(content, chunkMap) {
    if (!content || Object.keys(chunkMap).length === 0) return content;
    let processedContent = content;

    // Replace Chunks [[$chunkName?...]]
    processedContent = processedContent.replace(/\[\[\$([a-zA-Z0-9_-]+)(.*?)\]\]/g, (match, chunkName, params) => {
        if (chunkMap[chunkName]) {
            return `<!-- MODX Chunk: ${chunkName} -->\n${chunkMap[chunkName]}\n<!-- End Chunk -->`;
        }
        return `<!-- Unresolved Chunk: ${chunkName} -->`;
    });

    // Comment out Snippets
    processedContent = processedContent.replace(/\[\[(!)?(.*?)\]\]/g, (match, isSnippet, code) => {
        return `<!-- MODX Snippet ${isSnippet ? '!' : ''} (Not Executable): [[${isSnippet || ''}${code}]] -->`;
    });

    return processedContent;
}

// Helper: Update Asset Paths in Content
function updateAssetPaths(content, projectName) {
    if (!content) return content;
    
    // Replace common MODX asset paths with project-specific paths
    // e.g., /assets/ -> /project-name/assets/
    let updated = content.replace(/(src|href)=["']\/assets\//g, `$1="/${projectName}/assets/`);
    updated = updated.replace(/(src|href)=["']assets\//g, `$1="${projectName}/assets/`);
    
    // Handle userupload specific paths if they exist
    updated = updated.replace(/(src|href)=["']\/assets\/userupload\//g, `$1="/${projectName}/assets/userupload/`);
    
    return updated;
}

(async () => {
    try {
        console.log(`🚀 Starting migration for project: ${PROJECT_NAME}`);
        console.log(`📂 Content Output: ${PROJECT_CONTENT_DIR}`);
        console.log(`📂 Public Output: ${PROJECT_PUBLIC_DIR}`);

        // Clean and Create Directories
        // await fs.emptyDir(OUTPUT_DIR);
        // await fs.emptyDir(PUBLIC_DIR);
        await fs.ensureDir(PROJECT_CONTENT_DIR);
        await fs.ensureDir(PROJECT_PUBLIC_DIR);
        console.log(`✅ Directories ready`);

        // Connect to MySQL
        const connection = await mysql.createConnection({
            host: args['db-host'],
            user: args['db-user'],
            password: args['db-pass'],
            database: args['db-name'],
        });
        console.log('✅ Connected to MySQL database');

        // Fetch Chunks
        console.log('🔄 Fetching MODX Chunks...');
        const chunkMap = await fetchChunks(connection);

        // Fetch Resources
        const [resources] = await connection.execute(
            `SELECT id, pagetitle, longtitle, description, alias, content, parent, template, uri
             FROM modx_site_content
             WHERE published = 1 AND deleted = 0`
        );
        console.log(`📄 Found ${resources.length} published resources`);

        // Build Alias Map
        const aliasMap = {};
        resources.forEach(r => aliasMap[r.id] = r.alias);

        // Build Slug Helper
        function buildSlug(resource) {
            if (resource.uri && resource.uri !== '') return resource.uri;
            const parts = [];
            let current = resource;
            let loopCount = 0;
            while (current.parent !== 0 && loopCount < 20) {
                parts.unshift(aliasMap[current.parent] || '');
                const next = resources.find(r => r.id === current.parent);
                if (!next) break;
                current = next;
                loopCount++;
            }
            parts.push(resource.alias);
            return '/' + parts.filter(p => p).join('/');
        }

        // Process Resources
        let processedCount = 0;
        for (const res of resources) {
            const slug = buildSlug(res);

            // Fetch Template Variables
            const [tvs] = await connection.execute(
                `SELECT tmplvarid, value FROM modx_site_tmplvar_contentvalues WHERE contentid = ?`,
                [res.id]
            );
            
            const tvObject = {};
            tvs.forEach(tv => tvObject[`tv_${tv.tmplvarid}`] = tv.value);

            // Frontmatter
            const frontmatter = {
                title: res.pagetitle,
                slug,
                description: res.description || '',
                template: res.template === 1 ? 'home' : 'standard',
                ...tvObject,
            };

            // Process Content
            let body = res.content || '';
            body = resolveModxContent(body, chunkMap);
            body = updateAssetPaths(body, PROJECT_NAME);

            // Generate YAML
            const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });
            
            // Create Subdirectories based on slug structure
            // e.g., /dienstleistungen/pool.html -> content/pages/dienstleistungen/pool.md
            const slugParts = slug.split('/').filter(p => p);
            let filePath;
            
            if (slugParts.length > 1) {
                // Has subfolders
                const dirPath = path.join(PROJECT_CONTENT_DIR, ...slugParts.slice(0, -1));
                await fs.ensureDir(dirPath);
                filePath = path.join(dirPath, `${slugParts[slugParts.length - 1]}.md`);
            } else {
                // Root level
                const fileName = slugParts[0] || 'index';
                filePath = path.join(PROJECT_CONTENT_DIR, `${fileName}.md`);
            }

            const fileContent = `---\n${yamlStr}---\n\n${body}`;
            await fs.writeFile(filePath, fileContent);
            processedCount++;
            
            if (processedCount % 10 === 0) {
                console.log(`📝 Processed ${processedCount}/${resources.length} resources`);
            }
        }

        console.log(`✅ Written ${processedCount} Markdown files`);

        // Handle Media Files
        if (MEDIA_SOURCE && await fs.pathExists(MEDIA_SOURCE)) {
            console.log(`📁 Copying media from ${MEDIA_SOURCE} to ${PROJECT_PUBLIC_DIR}`);
            
            // Create assets folder inside project public dir
            const assetsDest = path.join(PROJECT_PUBLIC_DIR, 'assets');
            await fs.ensureDir(assetsDest);
            
            // Copy media content to project-specific assets folder
            await fs.copy(MEDIA_SOURCE, assetsDest);
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