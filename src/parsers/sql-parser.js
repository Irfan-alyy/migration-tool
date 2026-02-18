import fs from 'fs-extra';
import sqlParser from 'node-sql-parser';
import he from 'he';

const parser = new sqlParser.Parser();

export async function parseModxSQL(dumpPath) {
  const sqlContent = await fs.readFile(dumpPath, 'utf8');
  
  // Parse SQL dump
  const tables = extractTables(sqlContent);
  
  // Extract MODX resources (pages)
  const pages = extractPages(tables);
  
  // Extract site content (if using SiteContent or similar)
  const siteContent = extractSiteContent(tables);
  
  // Extract template variables
  const templateVars = extractTemplateVariables(tables);
  
  // Map content with template variables
  const enrichedPages = enrichPagesWithTVs(pages, templateVars);
  
  // Extract assets references
  const assets = extractAssetReferences(enrichedPages);
  
  return {
    pages: enrichedPages,
    assets: assets,
    templates: extractTemplates(tables),
    chunks: extractChunks(tables)
  };
}

function extractTables(sqlContent) {
  const tables = {};
  
  // Match INSERT statements
  const insertRegex = /INSERT INTO `?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*(.+?);/gis;
  let match;
  
  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const tableName = match[1];
    const columns = match[2].split(',').map(col => col.trim().replace(/`/g, ''));
    const valuesStr = match[3];
    
    if (!tables[tableName]) {
      tables[tableName] = [];
    }
    
    // Parse values (handles multiple rows in one INSERT)
    const valuesMatches = valuesStr.match(/\([^)]+\)/g);
    if (valuesMatches) {
      valuesMatches.forEach(valueMatch => {
        const values = parseValues(valueMatch);
        const row = {};
        columns.forEach((col, index) => {
          row[col] = values[index];
        });
        tables[tableName].push(row);
      });
    }
  }
  
  return tables;
}

function parseValues(valueStr) {
  // Remove outer parentheses
  const inner = valueStr.slice(1, -1);
  
  // Simple CSV parsing (you might want to use a proper CSV parser for production)
  const values = [];
  let current = '';
  let inString = false;
  
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    
    if (char === "'" && inner[i - 1] !== '\\') {
      inString = !inString;
      current += char;
    } else if (char === ',' && !inString) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current) {
    values.push(current.trim());
  }
  
  return values.map(v => {
    // Remove quotes and unescape
    if (v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1).replace(/\\'/g, "'");
      return he.decode(v); // Decode HTML entities
    }
    return v;
  });
}

function extractPages(tables) {
  // MODX typically stores content in modx_site_content
  const contentTable = tables['modx_site_content'] || tables['site_content'] || [];
  
  return contentTable
    .filter(row => row.published === '1' || row.published === 1)
    .map(row => ({
      id: row.id,
      title: row.pagetitle,
      longTitle: row.longtitle,
      description: row.description,
      alias: row.alias,
      content: row.content,
      template: row.template,
      parent: row.parent,
      menuIndex: row.menuindex,
      created: row.createdon,
      updated: row.editedon,
      hidemenu: row.hidemenu === '1' || row.hidemenu === 1,
      isFolder: row.isfolder === '1' || row.isfolder === 1,
      searchable: row.searchable === '1' || row.searchable === 1,
      type: 'page'
    }));
}

function extractTemplateVariables(tables) {
  // MODX template variables
  const tvTable = tables['modx_site_tmplvar_templates'] || tables['site_tmplvar_templates'] || [];
  const tvContentTable = tables['modx_site_tmplvar_contentvalues'] || tables['site_tmplvar_contentvalues'] || [];
  
  const tvs = {};
  
  tvContentTable.forEach(row => {
    const contentId = row.contentid;
    const tvId = row.tmplvarid;
    const value = row.value;
    
    if (!tvs[contentId]) {
      tvs[contentId] = {};
    }
    
    tvs[contentId][tvId] = value;
  });
  
  return tvs;
}

function enrichPagesWithTVs(pages, templateVars) {
  return pages.map(page => ({
    ...page,
    templateVars: templateVars[page.id] || {}
  }));
}

function extractAssetReferences(pages) {
  const assets = new Set();
  const assetRegex = /assets\/(?:images|files|uploads)\/[^\s"']+/g;
  
  pages.forEach(page => {
    if (page.content) {
      const matches = page.content.match(assetRegex) || [];
      matches.forEach(match => assets.add(match));
    }
    
    // Check template vars too
    Object.values(page.templateVars || {}).forEach(value => {
      if (typeof value === 'string') {
        const matches = value.match(assetRegex) || [];
        matches.forEach(match => assets.add(match));
      }
    });
  });
  
  return Array.from(assets);
}

function extractTemplates(tables) {
  const templateTable = tables['modx_site_templates'] || tables['site_templates'] || [];
  
  return templateTable.map(row => ({
    id: row.id,
    name: row.templatename,
    description: row.description,
    content: row.content
  }));
}

function extractChunks(tables) {
  const chunkTable = tables['modx_site_htmlsnippets'] || tables['site_htmlsnippets'] || [];
  
  return chunkTable.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.snippet
  }));
}
