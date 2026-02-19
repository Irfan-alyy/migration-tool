// scrape-modx.js
const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const SITE_URL = process.env.SITE_URL || 'https://azotea.ch';
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './scraped-output');

// List of slugs to scrape (You might need to fetch this from DB first)
// For demonstration, we assume you have a list of URLs
const PAGES_TO_SCRAPE = [
    '/', 
    '/dienstleistungen/schwimmbad-und-pool-basel-baselland.html',
    // Add more slugs here
];

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Set viewport to ensure responsive CSS loads correctly
    await page.setViewport({ width: 1920, height: 1080 });

    await fs.emptyDir(OUTPUT_DIR);

    for (const slug of PAGES_TO_SCRAPE) {
        try {
            const url = `${SITE_URL}${slug}`;
            console.log(`🕷️  Scraping: ${url}`);
            
            await page.goto(url, { waitUntil: 'networkidle2' });

            // Get the fully rendered HTML
            const html = await page.content();

            // Extract Title for Frontmatter
            const title = await page.title();

            // Create Markdown file with HTML body
            const frontmatter = `---\ntitle: "${title}"\nslug: "${slug}"\ntemplate: "scraped"\n---\n\n`;
            
            // Save as .md (containing HTML) or .html
            const fileName = slug.replace(/\//g, '_') || 'home';
            const filePath = path.join(OUTPUT_DIR, `${fileName}.md`);
            
            await fs.writeFile(filePath, frontmatter + html);
            console.log(`✅ Saved: ${filePath}`);

        } catch (err) {
            console.error(`❌ Failed to scrape ${slug}:`, err.message);
        }
    }

    await browser.close();
    console.log('🎉 Scraping complete!');
})();