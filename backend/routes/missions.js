const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT m.*, s.name as spacecraft_name, s.type as spacecraft_type 
      FROM missions m 
      LEFT JOIN spacecraft s ON m.spacecraft_id = s.id 
      WHERE m.user_id = $1 ORDER BY m.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, spacecraftId, description, objectives, timeline } = req.body;
    const id = uuidv4();
    const result = await query(
      'INSERT INTO missions (id, user_id, spacecraft_id, name, description, objectives, timeline, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *',
      [id, req.user.id, spacecraftId, name, description, JSON.stringify(objectives || []), JSON.stringify(timeline || []), 'planning']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
