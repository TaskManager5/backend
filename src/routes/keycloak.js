import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { db } from '../services/db.js';
import { issueTokens } from '../middleware/auth.js';

export const router = Router();

const {
  KEYCLOAK_URL,
  KEYCLOAK_PUBLIC_URL,
  KEYCLOAK_REALM,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_FRONTEND_CLIENT_ID,
} = process.env;

router.get('/keycloak-config', (req, res) => {
  res.json({
    url: KEYCLOAK_PUBLIC_URL || KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_FRONTEND_CLIENT_ID || KEYCLOAK_CLIENT_ID,
  });
});

router.post('/keycloak-callback',
  validate.body(z.object({ code: z.string(), redirectUri: z.string() })),
  async (req, res, next) => {
    try {
      const { code, redirectUri } = req.body;
      
      const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
      // Используем тот же client_id, что выдал код (frontend, Public)
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: KEYCLOAK_FRONTEND_CLIENT_ID || 'taskmanager-frontend',
        code,
        redirect_uri: redirectUri,
      });

      const tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        console.error('Keycloak token error:', errText);
        return res.status(401).json({ error: 'invalid_keycloak_token' });
      }

      const tokenData = await tokenResp.json();
      const payload = JSON.parse(Buffer.from(tokenData.access_token.split('.')[1], 'base64url').toString());
      const email = payload.email || payload.preferred_username;

      if (!email) return res.status(400).json({ error: 'no_email' });

      let { rows: [u] } = await db.query(
        'SELECT * FROM users WHERE login=$1 OR login=$2',
        [email, payload.preferred_username]
      );

      if (!u) {
        // Имя из Keycloak (name / preferred_username / email — fallback)
        const displayName = payload.name 
          || payload.given_name 
          || payload.preferred_username 
          || email;

        const { rows: [newUser] } = await db.query(
          `INSERT INTO users (login, password_hash, name, email, role) 
           VALUES ($1, '', $2, $3, 'user')
           RETURNING *`,
          [email, displayName, email]
        );
        u = newUser;

        await db.query(
          `INSERT INTO workers (user_id, name, position) 
           VALUES ($1, $2, $3)`,
          [u.id, displayName, 'Сотрудник (Keycloak)']
        );
      }

      const tokens = await issueTokens(u);
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  }
);
