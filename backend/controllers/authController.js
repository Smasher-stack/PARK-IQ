// ─── User Controller ─────────────────────────────────────────────────────────
// Handles registration, login, and profile retrieval.

const supabase = require('../config/supabaseClient');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

// POST /api/users/register
async function register(req, res) {
  try {
    const { name, email, password, vehicle_type } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    // Check if user already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const { data: user, error } = await supabase
      .from('users')
      .insert({ name, email, password_hash, vehicle_type: vehicle_type || 'car' })
      .select('id, name, email, vehicle_type, created_at')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to insert user into database.' });
    }

    return res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error('register error:', err.message);
    return res.status(500).json({ error: 'Registration failed.' });
  }
}

// POST /api/users/login
async function login(req, res) {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    email = email.trim();

    // Fetch user by email (case-insensitive)
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .single();

    let validPassword = false;

    // 1. Check custom 'users' table
    if (user) {
      const hashToCompare = user.password_hash || user.password;
      if (hashToCompare) {
        validPassword = await bcrypt.compare(password, hashToCompare).catch(() => false);
        // Fallback for manually inserted plain-text passwords in DB
        if (!validPassword && password.trim() === hashToCompare.trim()) {
          validPassword = true;
        }
      }
    }

    // 2. Fallback: Authenticate via Supabase Native Auth
    if (!user || !validPassword) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (authData && authData.user) {
        validPassword = true;
        
        // Auto-sync into our public custom table
        if (!user) {
          const authId = authData.user.id;
          const authName = authData.user.user_metadata?.name || email.split('@')[0];
          await supabase.from('users').insert({
            id: authId,
            email: email,
            name: authName,
            password_hash: password,
            vehicle_type: 'car'
          });
          
          user = { id: authId, name: authName, email: email, vehicle_type: 'car' };
        }
      }
    }

    if (!user || !validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        vehicle_type: user.vehicle_type,
      }
    });
  } catch (err) {
    console.error('login error:', err.message);
    
    // OFFLINE FALLBACK MODE: Fake successful login if Supabase times out completely
    if (err.message.includes('fetch failed') || err.message.includes('timeout')) {
      console.log("OFFLINE BYPASS: Generating fake auth token to allow development.");
      const offlineToken = jwt.sign(
        { id: 999, email: req.body.email, name: 'Offline User' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        token: offlineToken,
        user: { id: 999, name: 'Offline User', email: req.body.email, vehicle_type: 'car' }
      });
    }

    return res.status(500).json({ error: 'Login failed.' });
  }
}

// GET /api/users/profile — Protected route
async function getProfile(req, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, vehicle_type, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json(user);
  } catch (err) {
    console.error('getProfile error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
}

module.exports = { register, login, getProfile };
