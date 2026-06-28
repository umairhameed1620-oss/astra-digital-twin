const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const router = express.Router();

router.use(authenticate);

router.get('/:spacecraftId/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await query(
      'SELECT * FROM telemetry_logs WHERE spacecraft_id=$1 ORDER BY timestamp DESC LIMIT $2',
      [req.params.spacecraftId, parseInt(limit)]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:spacecraftId/log', async (req, res) => {
  try {
    const { data } = req.body;
    await query(
      'INSERT INTO telemetry_logs (spacecraft_id, data, timestamp) VALUES ($1,$2,NOW())',
      [req.params.spacecraftId, JSON.stringify(data)]
    );
    res.json({ message: 'Logged' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
