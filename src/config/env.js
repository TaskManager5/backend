import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be >=32 chars'),
  ACCESS_TTL_MIN: z.coerce.number().default(30),
  REFRESH_TTL_DAYS: z.coerce.number().default(14),
});

export const env = schema.parse(process.env);
export const CORS_WHITELIST = env.CORS_ORIGINS.split(',').map(s=>s.trim());
