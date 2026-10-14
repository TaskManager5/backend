import { Router } from 'express';
import { z } from 'zod';
import { db, pool } from '../services/db.js';
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const router = Router();
router.use(verifyAccess);

// GET /teams — список команд. Фильтр по projectId через team_projects.
router.get('/', async (req, res) => {
  const u = req.user;
  const q = req.query || {};
  const projectId = q.projectId ? Number(q.projectId) : null;

  if (u.role === 'admin') {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.created_at,
              (SELECT array_agg(project_id) FROM team_projects WHERE team_id=t.id) AS project_ids
       FROM teams t
       WHERE ($1::bigint IS NULL OR EXISTS (
           SELECT 1 FROM team_projects tp WHERE tp.team_id=t.id AND tp.project_id=$1
       ))
       ORDER BY t.id DESC`,
      [projectId]
    );
    return res.json(rows);
  }

  // Для всех остальных: команды, где он участник
  const { rows } = await db.query(
    `SELECT t.id, t.name, t.created_at,
            (SELECT array_agg(project_id) FROM team_projects WHERE team_id=t.id) AS project_ids
     FROM teams t
     JOIN team_members tm ON tm.team_id=t.id
     WHERE tm.worker_id=(SELECT id FROM workers WHERE user_id=$1)
       AND ($2::bigint IS NULL OR EXISTS (
           SELECT 1 FROM team_projects tp WHERE tp.team_id=t.id AND tp.project_id=$2
       ))
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

// POST /teams — админ или менеджер. Создатель становится manager'ом команды.
// Опционально: projectId — сразу привязать к проекту.
router.post('/',
  requireRole('admin', 'manager'),
  validate.body(z.object({
    name: z.string().min(1),
    projectId: z.coerce.number().int().positive().optional()
  })),
  async (req,res,next)=>{
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Создаём команду
      const { rows:[t] } = await client.query(
        'INSERT INTO teams(name) VALUES($1) RETURNING id,name,created_at',
        [req.body.name]
      );

      // 2. Создателя делаем manager'ом команды (если у него есть worker)
      const { rows: [myWorker] } = await client.query(
        'SELECT id FROM workers WHERE user_id=$1',
        [req.user.sub]
      );
      if (myWorker) {
        await client.query(
          `INSERT INTO team_members(team_id, worker_id, role_in_team)
           VALUES($1, $2, 'manager')
           ON CONFLICT (team_id, worker_id) DO UPDATE SET role_in_team='manager'`,
          [t.id, myWorker.id]
        );
      }

      // 3. Привязка к проекту (если передан projectId)
      if (req.body.projectId) {
        await client.query(
          `INSERT INTO team_projects (team_id, project_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [t.id, req.body.projectId]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(t);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// GET /teams/:id/projects — проекты, к которым привязана команда
router.get('/:id/projects',
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      const teamId = req.params.id;
      const u = req.user;

      // Проверка доступа: админ, или участник команды
      if (u.role !== 'admin') {
        const { rowCount } = await db.query(
          `SELECT 1 FROM team_members WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2)`,
          [teamId, u.sub]
        );
        if (!rowCount) return res.status(404).json({ error: 'not_found' });
      }

      const { rows } = await db.query(
        `SELECT p.id, p.name, p.description, p.status
         FROM team_projects tp
         JOIN projects p ON p.id = tp.project_id
         WHERE tp.team_id = $1
         ORDER BY p.id`,
        [teamId]
      );
      res.json(rows);
    } catch (err) { next(err); }
  }
);

// POST /teams/:id/projects — привязать команду к проекту (owner/manager команды + owner/manager проекта)
router.post('/:id/projects',
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  validate.body(z.object({ projectId: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      const teamId = req.params.id;
      const { projectId } = req.body;
      const u = req.user;

      // Проверка: админ, или manager команды И owner/manager проекта
      if (u.role !== 'admin') {
        const { rowCount: isTeamManager } = await db.query(
          `SELECT 1 FROM team_members
           WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2)
             AND role_in_team='manager'`,
          [teamId, u.sub]
        );
        if (!isTeamManager) return res.status(403).json({ error: 'forbidden' });

        const { rowCount: isProjectMember } = await db.query(
          `SELECT 1 FROM project_members
           WHERE project_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2)
             AND role IN ('owner','manager')`,
          [projectId, u.sub]
        );
        if (!isProjectMember) return res.status(403).json({ error: 'forbidden' });
      }

      await db.query(
        `INSERT INTO team_projects (team_id, project_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [teamId, projectId]
      );
      res.status(201).json({ ok: true });
    } catch (err) { next(err); }
  }
);

// DELETE /teams/:id/projects/:projectId — отвязать команду от проекта
router.delete('/:id/projects/:projectId',
  validate.params(z.object({
    id: z.coerce.number().int().positive(),
    projectId: z.coerce.number().int().positive()
  })),
  async (req, res, next) => {
    try {
      const { id: teamId, projectId } = req.params;
      const u = req.user;

      if (u.role !== 'admin') {
        const { rowCount: isTeamManager } = await db.query(
          `SELECT 1 FROM team_members
           WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2)
             AND role_in_team='manager'`,
          [teamId, u.sub]
        );
        if (!isTeamManager) return res.status(403).json({ error: 'forbidden' });
      }

      const { rowCount } = await db.query(
        `DELETE FROM team_projects WHERE team_id=$1 AND project_id=$2`,
        [teamId, projectId]
      );
      if (!rowCount) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (err) { next(err); }
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

// DELETE /teams/:id - удаление команды (admin или manager этой команды)
router.delete('/:id',
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res) => {
    const teamId = req.params.id;
    const u = req.user;
    
    try {
      // Проверка доступа: admin ИЛИ manager этой команды
      if (u.role !== 'admin') {
        const { rowCount } = await db.query(
          `SELECT 1 FROM team_members 
           WHERE team_id=$1 AND worker_id=(SELECT id FROM workers WHERE user_id=$2) 
             AND role_in_team='manager'`,
          [teamId, u.sub]
        );
        if (!rowCount) return res.status(403).json({ error: 'forbidden' });
      }
      
      await db.query('BEGIN');
      await db.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
      const { rowCount } = await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
      await db.query('COMMIT');
      
      if (!rowCount) {
        return res.status(404).json({ error: 'Команда не найдена' });
      }
      
      res.status(204).end();
      
    } catch (err) {
      await db.query('ROLLBACK');
      console.error('Ошибка при удалении команды:', err);
      
      if (err.code === '23503') {
        return res.status(422).json({ 
          error: 'Невозможно удалить команду. Есть связанные задачи или другие зависимости.' 
        });
      }
      
      res.status(500).json({ error: 'Ошибка сервера при удалении команды' });
    }
  }
);
