// src/db.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysqlLib = require('mysql2');

export async function createConnection(config) {
  const conn = mysqlLib.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database, // will be set after import
    port: config.port || 3306,
  });
  return conn.promise();
}

export async function queryResources(connection) {
  const [resources] = await connection.execute(
    `SELECT id, pagetitle, longtitle, description, alias, content, parent, template, uri
     FROM modx_site_content
     WHERE published = 1 AND deleted = 0`
  );
  return resources;
}

export async function queryTemplateVariables(connection, contentId) {
  const [tvs] = await connection.execute(
    `SELECT tmplvarid, value FROM modx_site_tmplvar_contentvalues WHERE contentid = ?`,
    [contentId]
  );
  return tvs;
}

// Add more queries as needed (e.g., fetch chunks for tag resolution later)