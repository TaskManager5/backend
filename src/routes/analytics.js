import { Router } from 'express';
import { verifyAccess } from '../middleware/auth.js';
import { db } from '../services/db.js';

export const router = Router();
router.use(verifyAccess);

let cache = { data:null, ts:0 };
const TTL = 30_000;

router.get('/overview', async (req,res)=>{
  const now = Date.now();
  if (cache.data && now - cache.ts < TTL) return res.json(cache.data);

  const { rows:[agg] } = await db.query(`
    WITH q AS (
      SELECT id,
        CASE
          WHEN importance>=8 AND deadline<=now()+interval '2 days' THEN 'Q1'
          WHEN importance>=8 THEN 'Q2'
          WHEN deadline<=now()+interval '2 days' THEN 'Q3'
          ELSE 'Q4'
        END AS quad,
        status, complexity, deadline
      FROM tasks
    )
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE quad='Q1') as q1,
      count(*) FILTER (WHERE quad='Q2') as q2,
      count(*) FILTER (WHERE quad='Q3') as q3,
      count(*) FILTER (WHERE quad='Q4') as q4,
      count(*) FILTER (WHERE status='done') as done,
      count(*) FILTER (WHERE status<>'done' AND deadline<now()) as overdue,
      round(avg(NULLIF(complexity,0))::numeric,2) as avg_complexity
    FROM q;
  `);

  cache = { data: agg, ts: now };
  res.json(agg);
});
