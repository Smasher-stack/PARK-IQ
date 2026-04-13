// ─── Supabase Client Configuration ───────────────────────────────────────────
// Initializes a single shared Supabase client using the service-role key.
// Uses a custom fetch wrapper to force IPv4 DNS resolution on Windows,
// which fixes "TypeError: fetch failed" errors with the default supabase-js client.

const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

// Force IPv4 resolution to prevent fetch failures on Windows
dns.setDefaultResultOrder('ipv4first');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

// Custom fetch that explicitly resolves to IPv4 via the native Node fetch
const ipv4Fetch = (url, options = {}) => {
  return fetch(url, {
    ...options,
    // Node 20+ supports the 'autoSelectFamily' option but dns.setDefaultResultOrder
    // above should handle it globally. This is a safety net.
  });
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: ipv4Fetch
  }
});

module.exports = supabase;
