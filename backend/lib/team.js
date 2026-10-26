// Organisations (teams): invitations, joining, leaving. All moves run in one transaction.
const crypto = require('crypto');
const { pool, query } = require('./db');

const INVITE_DAYS = Number(process.env.INVITE_EXPIRY_DAYS) || 7;
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');

const tx = async (fn) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
};

const createOrg = async (c, name) => (await c.query('INSERT INTO organisations (name) VALUES ($1) RETURNING *', [String(name).slice(0, 150)])).rows[0];

/** Active (not accepted, revoked or expired) invitation for a raw token, with the organisation name. */
const findInvite = async (token) => {
  if (!token || String(token).length < 20) return null;
  const r = await query(
    `SELECT i.*, o.name AS org_name FROM invitations i JOIN organisations o ON o.id = i.organisation_id
      WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()`, [hashToken(token)]
  );
  return r.rows[0] || null;
};

const createInvite = async ({ orgId, email, role, invitedBy }) => {
  const token = newToken();
  await query('UPDATE invitations SET revoked_at=NOW() WHERE organisation_id=$1 AND lower(email)=$2 AND accepted_at IS NULL AND revoked_at IS NULL', [orgId, email]);
  const r = await query(
    `INSERT INTO invitations (organisation_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1,$2,$3,$4,$5, NOW() + make_interval(days => $6)) RETURNING id, email, role, created_at, expires_at`,
    [orgId, email, role, hashToken(token), invitedBy, INVITE_DAYS]
  );
  return { ...r.rows[0], token };
};

/**
 * Move an existing user into the invitation's organisation.
 * If they were the only member of their old team, their satellites, missions and validation history come with them
 * and the empty team is deleted. An owner of a team with other members must hand over ownership first.
 */
const acceptInvite = async (invite, userId) => tx(async (c) => {
  const u = (await c.query('SELECT id, organisation_id, org_role FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  if (!u) throw Object.assign(new Error('User not found'), { status: 404 });
  if (String(u.organisation_id) === String(invite.organisation_id)) throw Object.assign(new Error('You are already in this team'), { status: 409 });
  const others = (await c.query('SELECT COUNT(*)::int AS n FROM users WHERE organisation_id=$1 AND id<>$2', [u.organisation_id, userId])).rows[0].n;
  if (others > 0 && u.org_role === 'owner') {
    throw Object.assign(new Error('You own a team with other members. Make someone else owner (Team page) before joining another team.'), { status: 409 });
  }
  let moved = { spacecraft: 0, missions: 0 };
  if (others === 0) {
    moved.spacecraft = (await c.query('UPDATE spacecraft SET organisation_id=$1 WHERE organisation_id=$2', [invite.organisation_id, u.organisation_id])).rowCount;
    moved.missions = (await c.query('UPDATE missions SET organisation_id=$1 WHERE organisation_id=$2', [invite.organisation_id, u.organisation_id])).rowCount;
    await c.query('UPDATE validation_runs SET organisation_id=$1 WHERE organisation_id=$2', [invite.organisation_id, u.organisation_id]);
  }
  await c.query('UPDATE users SET organisation_id=$1, org_role=$2 WHERE id=$3', [invite.organisation_id, invite.role, userId]);
  await c.query('UPDATE invitations SET accepted_at=NOW() WHERE id=$1', [invite.id]);
  if (others === 0) await c.query('DELETE FROM invitations WHERE organisation_id=$1', [u.organisation_id]);
  if (others === 0) await c.query('DELETE FROM organisations WHERE id=$1', [u.organisation_id]);
  return moved;
});

/** Put a user into a new, empty team of their own (used when they are removed from or leave a team). */
const moveToOwnTeam = async (userId) => tx(async (c) => {
  const u = (await c.query('SELECT id, name FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  const org = await createOrg(c, `${u.name}'s team`);
  await c.query("UPDATE users SET organisation_id=$1, org_role='owner' WHERE id=$2", [org.id, userId]);
  return org;
});

module.exports = { tx, createOrg, findInvite, createInvite, acceptInvite, moveToOwnTeam, hashToken, INVITE_DAYS };
