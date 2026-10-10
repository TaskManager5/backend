import { Router } from 'express';
import { z } from 'zod';
import { db } from '../services/db.js';
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const router = Router();
router.use(verifyAccess);

// GET /teams — админ все; остальные свои
router.get('/', async (req, res) => {
  const u = req.user;
  const q = req.query || {};
  const projectId = q.projectId ? Number(q.projectId) : null;

  if (u.role === 'admin') {
    const { rows } = await db.query(
      `SELECT id, name, created_at, project_id
       FROM teams
       WHERE ($1::bigint IS NULL OR project_id = $1)
       ORDER BY id DESC`,
      [projectId]
    );
    return res.json(rows);
  }
  const { rows } = await db.query(
    `SELECT t.id, t.name, t.created_at, t.project_id
     FROM teams t
     JOIN team_members tm ON tm.team_id=t.id
     WHERE tm.worker_id=(SELECT id FROM workers WHERE user_id=$1)
       AND ($2::bigint IS NULL OR t.project_id = $2)
     ORDER BY t.id DESC`,
    [u.sub, projectId]
  );
  res.json(rows);
});


// GET /teams/:id/members — доступ тем, кто в команде, или админ
router.get('/:id/members',
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res) => {
    const teamId = req.params.id;
    const u = req.user;
    const { rowCount: allowed } = await db.query(
      `SELECT 1 FROM team_members WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2)`,
      [teamId, u.sub]
    );
    if (u.role !== 'admin' && !allowed) return res.status(404).json({ error: 'not_found' });

    const { rows } = await db.query(
      `SELECT w.id, w.name, w.position, u.login, tm.role_in_team AS "roleInTeam"
       FROM workers w
       LEFT JOIN users u ON u.id = w.user_id
       JOIN team_members tm ON tm.worker_id = w.id
       WHERE tm.team_id=$1
       ORDER BY w.id`,
      [teamId]
    );
    res.json(rows);
  }
);

// POST /teams — только админ
router.post('/',
  requireRole('admin'),
  validate.body(z.object({ name: z.string().min(1) })),
  async (req,res)=>{
    const { rows:[t] } = await db.query(
      'INSERT INTO teams(name) VALUES($1) RETURNING id,name,created_at',
      [req.body.name]
    );
    res.status(201).json(t);
  }
);

// POST /teams/:id/members — админ или менеджер этой команды
router.post('/:id/members',
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  validate.body(z.object({
    workerId: z.coerce.number().int().positive(),
    roleInTeam: z.enum(['manager','member'])
  })),
  async (req,res)=>{
    const teamId = req.params.id;
    const u = req.user;

    if (u.role !== 'admin') {
      const { rowCount } = await db.query(
        `SELECT 1 FROM team_members WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2) AND role_in_team='manager'`,
        [teamId, u.sub]
      );
      if (!rowCount) return res.status(403).json({ error:'forbidden' });
    }

    const { rows:[m] } = await db.query(
      `INSERT INTO team_members(team_id,worker_id,role_in_team)
       VALUES($1,$2,$3)
       ON CONFLICT (team_id,worker_id) DO UPDATE SET role_in_team=EXCLUDED.role_in_team
       RETURNING team_id AS teamId, worker_id AS workerId, role_in_team AS roleInTeam`,
      [teamId, req.body.workerId, req.body.roleInTeam]
    );
    res.status(201).json(m);
  }
);

// DELETE /teams/:id/members/:userId — админ или менеджер этой команды
router.delete('/:id/members/:userId',
  validate.params(z.object({
    id: z.coerce.number().int().positive(),
    workerId: z.coerce.number().int().positive()
  })),
  async (req,res)=>{
    const teamId = req.params.id;
    const u = req.user;

    if (u.role !== 'admin') {
      const { rowCount } = await db.query(
        `SELECT 1 FROM team_members WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2) AND role_in_team='manager'`,
        [teamId, u.sub]
      );
      if (!rowCount) return res.status(403).json({ error:'forbidden' });
    }

    const { rowCount } = await db.query(
      `DELETE FROM team_members WHERE team_id=$1 AND worker_id=$2`,
      [teamId, req.params.workerId]
    );
    if (!rowCount) return res.status(404).json({ error:'not_found' });
    res.status(204).end();
  }
);

// DELETE /teams/:id - удаление команды (только для админа)
router.delete('/:id',
  requireRole('admin'),
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res) => {
    const teamId = req.params.id;
    
    try {
      // Начинаем транзакцию для безопасного удаления
      await db.query('BEGIN');
      
      // 1. Сначала удаляем всех участников команды (из-за foreign key constraint)
      await db.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
      
      // 2. Удаляем саму команду
      const { rowCount } = await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
      
      // Коммитим транзакцию
      await db.query('COMMIT');
      
      if (!rowCount) {
        return res.status(404).json({ error: 'Команда не найдена' });
      }
      
      res.status(204).end();
      
    } catch (err) {
      // Откатываем транзакцию в случае ошибки
      await db.query('ROLLBACK');
      console.error('Ошибка при удалении команды:', err);
      
      // Обрабатываем возможные ошибки foreign key
      if (err.code === '23503') {
        return res.status(422).json({ 
          error: 'Невозможно удалить команду. Есть связанные задачи или другие зависимости.' 
        });
      }
      
      res.status(500).json({ error: 'Ошибка сервера при удалении команды' });
    }
  }
);
