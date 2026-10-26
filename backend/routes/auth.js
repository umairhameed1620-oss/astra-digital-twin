const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'astra_secret_2024';

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, organisation } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ error: 'Email already registered', code: 'CONFLICT' });
    const hashed = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await pool.query('INSERT INTO users (id,name,email,password,organisation,role,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())', [id, name, email, hashed, organisation || null, 'engineer', true]);
    const token = jwt.sign({ id, name, email, role: 'engineer' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, refreshToken: token, user: { id, name, email, role: 'engineer', organisation } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHORIZED' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials', code: 'UNAUTHORIZED' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, refreshToken: token, user: { id: user.id, name: user.name, email: user.email, role: user.role, organisation: user.organisation } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/refresh', (req, res) => res.json({ token: req.body.refreshToken, refreshToken: req.body.refreshToken }));
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

module.exports = router;
