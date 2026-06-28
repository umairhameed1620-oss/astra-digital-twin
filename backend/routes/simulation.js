const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../utils/database');
const router = express.Router();

router.use(authenticate);

router.post('/start/:spacecraftId', async (req, res) => {
  try {
    const sc = await query('SELECT * FROM spacecraft WHERE id=$1 AND user_id=$2', [req.params.spacecraftId, req.user.id]);
    if (sc.rows.length === 0) return res.status(404).json({ error: 'Spacecraft not found' });
    await query('UPDATE spacecraft SET status=$1 WHERE id=$2', ['simulating', req.params.spacecraftId]);
    res.json({ message: 'Simulation ready - connect via WebSocket', spacecraftId: req.params.spacecraftId, config: sc.rows[0].config });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/stop/:spacecraftId', async (req, res) => {
  try {
    await query('UPDATE spacecraft SET status=$1 WHERE id=$2 AND user_id=$3', ['designed', req.params.spacecraftId, req.user.id]);
    res.json({ message: 'Simulation stopped' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
