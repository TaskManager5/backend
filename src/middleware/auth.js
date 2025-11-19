import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../services/db.js';
import { env } from '../config/env.js';

const sign = (payload, exp)=>jwt.sign(payload, env.JWT_SECRET, { expiresIn: exp });

export async function issueTokens(user){
  const access = sign({ sub:user.id, role:user.role }, `${env.ACCESS_TTL_MIN}m`);
  const jti = crypto.randomUUID();
  const refresh = sign({ sub:user.id, jti }, `${env.REFRESH_TTL_DAYS}d`);
  await db.query(
    `INSERT INTO refresh_tokens(jti,user_id,expires_at)
     VALUES ($1,$2, now() + ($3 || ' days')::interval)`,
    [jti, user.id, env.REFRESH_TTL_DAYS]
  );
  return { access, refresh, jti };
}

export async function validateRefresh(jti){
  const { rows } = await db.query(
    'SELECT * FROM refresh_tokens WHERE jti=$1 AND revoked_at IS NULL AND expires_at>now()',[jti]
  );
  return rows[0] || null;
}
export async function revokeRefresh(jti){
  await db.query('UPDATE refresh_tokens SET revoked_at=now() WHERE jti=$1',[jti]);
}

export function verifyAccess(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error:'missing_token' });
  try { req.user = jwt.verify(token, env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ error:'invalid_token' }); }
}
export const requireRole = (...roles)=>(req,res,next)=>{
  if (!req.user) return res.status(401).json({ error:'unauthenticated' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error:'forbidden' });
  next();
};
