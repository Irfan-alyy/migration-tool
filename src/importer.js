// src/importer.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysqlLib = require('mysql2');
import fs from 'fs-extra';
import crypto from 'crypto';

export async function createTempDatabase(project, host, user, password, database="mydb") {
  try {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const dbName = `modx_migration_${project}_${timestamp}_${random}`.replace(/[^a-zA-Z0-9_]/g, '_');

    console.log(`🔌 Connecting to MySQL at ${host} as ${user}...`);
    
    // Debug: inspect imported mysql module shape
    try {
      console.log('DEBUG: mysql import type =', typeof mysql);
      console.log('DEBUG: mysql keys =', Object.keys(mysql));
      console.log('DEBUG: mysql.createConnection =', typeof mysql.createConnection);
    } catch (d) {
      console.log('DEBUG: failed to inspect mysql import:', d && d.message);
    }

    // Create connection without a specific database so we can CREATE DATABASE
    const connection = mysqlLib.createConnection({
      host,
      user,
      password,
      connectTimeout: 10000,
      port: 3306,
    });

    const pconn = connection.promise();
    console.log('✅ MySQL connection established (callback connection, using .promise())');

    await pconn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Created temporary database: ${dbName}`);
    
    await connection.end();
    return dbName;
  } catch (error) {
    console.error('❌ MySQL connection error details:');
    console.error('  - Message:', error.message);
    console.error('  - Code:', error.code);
    console.error('  - Errno:', error.errno);
    console.error('  - SQL State:', error.sqlState);
    console.error('  - Stack:', error.stack);
    throw error;
  }
}

export async function importDump(dumpPath, dbName, host, user, password) {
  try {
    console.log(`📥 Reading dump file: ${dumpPath}`);
    
    // Check if dump file exists
    if (!await fs.pathExists(dumpPath)) {
      throw new Error(`Dump file not found: ${dumpPath}`);
    }
    
    // Read the SQL dump file
    const dumpContent = await fs.readFile(dumpPath, 'utf8');
    console.log(`📄 Dump file size: ${(dumpContent.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Split by SQL statements (simple approach)
    const statements = dumpContent
      .split(';')
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    console.log(`🔨 Executing ${statements.length} SQL statements...`);

    // Connect to the specific database
    const connection = mysqlLib.createConnection({
      host,
      user,
      password,
      database: dbName,
      multipleStatements: true,
      port: 3306,
    });
    const pconn = connection.promise();

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await connection.execute(stmt);
        successCount++;
      } catch (err) {
        errorCount++;
        // Skip errors for statements that might fail
        if (!err.message.includes('already exists') && 
            !err.message.includes('Duplicate entry') &&
            !err.message.includes('Unknown database')) {
          console.warn(`⚠️ Statement ${i + 1} failed: ${err.message.substring(0, 100)}`);
        }
      }
      
      // Log progress every 100 statements
      if ((i + 1) % 100 === 0) {
        console.log(`  Progress: ${i + 1}/${statements.length} statements processed`);
      }
    }

    await pconn.end();
    console.log(`✅ Import complete: ${successCount} successful, ${errorCount} skipped/failed`);
    
  } catch (error) {
    console.error('❌ Dump import failed:', error);
    throw error;
  }
}

export async function dropDatabase(dbName, host, user, password) {
  try {
    const connection = mysqlLib.createConnection({
      host,
      user,
      password,
      port: 3306,
    });
    const pconn = connection.promise();

    await pconn.execute(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await pconn.end();
    
    console.log(`✅ Dropped temporary database: ${dbName}`);
  } catch (error) {
    console.error('❌ Failed to drop database:', error);
    throw error;
  }
}