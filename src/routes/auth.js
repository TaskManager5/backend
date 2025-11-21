import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { db } from '../services/db.js';
import { issueTokens, validateRefresh, revokeRefresh } from '../middleware/auth.js';

export const router = Router();

router.post('/login',
  validate.body(z.object({ login: z.string(), password: z.string() })),
  async (req, res, next) => {
    try {
      const { rows:[u] } = await db.query('SELECT * FROM users WHERE login=$1', [req.body.login]);
      if (!u) return res.status(401).json({ error: 'invalid_credentials' });
      
      const { rows:[ok] } = await db.query('SELECT crypt($1,$2)=$2 AS ok', [req.body.password, u.password_hash]);
      if (!ok?.ok) return res.status(401).json({ error: 'invalid_credentials' });
      
      const tokens = await issueTokens(u);
      res.json(tokens);
    } catch (err) {
      next(err); // Передаем ошибку в errorHandler
    }
  }
);

router.post('/refresh',
  validate.body(z.object({ refresh: z.string() })),
  async (req, res, next) => {
    try {
      let payload;
      try {
        payload = JSON.parse(Buffer.from(req.body.refresh.split('.')[1], 'base64url').toString());
      } catch {
        return res.status(401).json({ error: 'invalid_token' });
      }
      
      const r = await validateRefresh(payload.jti);
      if (!r) return res.status(401).json({ error: 'revoked_or_expired' });
      
      const { rows:[u] } = await db.query('SELECT * FROM users WHERE id=$1', [r.user_id]);
      const tokens = await issueTokens(u);
      
      await revokeRefresh(payload.jti);
      res.json(tokens);
    } catch (err) {
      next(err); // Передаем ошибку в errorHandler
    }
  }
);

router.post('/logout',
  validate.body(z.object({ jti: z.string().uuid() })),
  async (req, res, next) => {
    try {
      await revokeRefresh(req.body.jti);
      res.status(204).end();
    } catch (err) {
      next(err); // Передаем ошибку в errorHandler
    }
  }
);
