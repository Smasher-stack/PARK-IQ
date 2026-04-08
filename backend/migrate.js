// ─── Run Schema Migration ────────────────────────────────────────────────────
// Executes schema.sql against Supabase using the REST SQL endpoint.
// Usage: node migrate.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function migrate() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || url.includes('your_supabase')) {
    console.error('\n❌ SUPABASE_URL is not set in .env');
    console.error('   Open backend/.env and paste your real Supabase project URL');
    console.error('   Example: https://abcdefg.supabase.co\n');
    process.exit(1);
  }
  if (!key || key.includes('your_supabase')) {
    console.error('\n❌ SUPABASE_SERVICE_KEY is not set in .env');
    console.error('   Open backend/.env and paste your real service_role key');
    console.error('   Find it at: Supabase Dashboard → Settings → API → service_role\n');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // Split into individual statements (Supabase SQL API runs one at a time)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`\n🔄 Running ${statements.length} SQL statements against Supabase...\n`);

  let success = 0;
  let failed = 0;

  for (const stmt of statements) {
    try {
      const resp = await fetch(`${url}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ query: stmt + ';' }),
      });

      // If PostgREST doesn't support this, fall back to pg_query
      if (!resp.ok) {
        // Try the Supabase SQL query endpoint instead
        const sqlResp = await fetch(`${url}/pg/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({ query: stmt + ';' }),
        });
        
        if (sqlResp.ok) {
          success++;
          const shortStmt = stmt.substring(0, 60).replace(/\n/g, ' ');
          console.log(`  ✅ ${shortStmt}...`);
        } else {
          throw new Error(await sqlResp.text());
        }
      } else {
        success++;
        const shortStmt = stmt.substring(0, 60).replace(/\n/g, ' ');
        console.log(`  ✅ ${shortStmt}...`);
      }
    } catch (err) {
      failed++;
      const shortStmt = stmt.substring(0, 50).replace(/\n/g, ' ');
      console.log(`  ⚠️  ${shortStmt}... (${err.message?.substring(0, 80)})`);
    }
  }

  console.log(`\n📊 Results: ${success} succeeded, ${failed} had issues`);
  
  if (failed > 0) {
    console.log('\n💡 Some statements may have failed because tables already exist (this is OK).');
    console.log('   If ALL failed, paste schema.sql manually in the Supabase SQL Editor:');
    console.log('   Dashboard → SQL Editor → New Query → Paste → Run\n');
  } else {
    console.log('\n🎉 Schema migration complete! Run "npm run seed" next.\n');
  }
}

migrate();
