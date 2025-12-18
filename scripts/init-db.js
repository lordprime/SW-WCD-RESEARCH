#!/usr/bin/env node

// Database initialization script
import 'dotenv/config'; // <--- ADD THIS LINE HERE
import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initializeDatabase() {
  console.log(' Initializing SW-WCD Research Database...');
  
  try {
    // Read and execute schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf8');
    
    console.log(' Creating database schema...');
    await pool.query(schemaSQL);
    
    // Verify tables were created
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log(' Database initialized successfully!');
    console.log(' Created tables:');
    tables.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Insert initial data
    await pool.query(`
      INSERT INTO performance_metrics (metric_type, value, metadata) 
      VALUES ('database_initialized', 1, '{"version": "1.0.0", "timestamp": "${new Date().toISOString()}"}')
      ON CONFLICT DO NOTHING
    `);
    
    console.log(' Database setup complete!');
    
  } catch (error) {
    console.error(' Database initialization failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase();
}