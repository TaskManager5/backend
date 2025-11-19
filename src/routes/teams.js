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
  if (u.role === 'admin') {
    const { rows } = await db.query('SELECT id, name, created_at FROM teams ORDER BY id DESC');
    return res.json(rows);
  }
  const { rows } = await db.query(
    `SELECT t.id, t.name, t.created_at
     FROM teams t
     JOIN team_members tm ON tm.team_id=t.id
     WHERE tm.user_id=$1
     ORDER BY t.id DESC`,
    [u.sub]
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
      `SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2`,
      [teamId, u.sub]
    );
    if (u.role !== 'admin' && !allowed) return res.status(404).json({ error: 'not_found' });

    const { rows } = await db.query(
      `SELECT u.id, u.login, tm.role_in_team AS roleInTeam
       FROM users u
       JOIN team_members tm ON tm.user_id=u.id
       WHERE tm.team_id=$1
       ORDER BY u.id`,
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
    userId: z.coerce.number().int().positive(),
    roleInTeam: z.enum(['manager','member'])
  })),
  async (req,res)=>{
    const teamId = req.params.id;
    const u = req.user;

    if (u.role !== 'admin') {
      const { rowCount } = await db.query(
        `SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2 AND role_in_team='manager'`,
        [teamId, u.sub]
      );
      if (!rowCount) return res.status(403).json({ error:'forbidden' });
    }

    const { rows:[m] } = await db.query(
      `INSERT INTO team_members(team_id,user_id,role_in_team)
       VALUES($1,$2,$3)
       ON CONFLICT (team_id,user_id) DO UPDATE SET role_in_team=EXCLUDED.role_in_team
       RETURNING team_id AS teamId, user_id AS userId, role_in_team AS roleInTeam`,
      [teamId, req.body.userId, req.body.roleInTeam]
    );
    res.status(201).json(m);
  }
);

// DELETE /teams/:id/members/:userId — админ или менеджер этой команды
router.delete('/:id/members/:userId',
  validate.params(z.object({
    id: z.coerce.number().int().positive(),
    userId: z.coerce.number().int().positive()
  })),
  async (req,res)=>{
    const teamId = req.params.id;
    const u = req.user;

    if (u.role !== 'admin') {
      const { rowCount } = await db.query(
        `SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2 AND role_in_team='manager'`,
        [teamId, u.sub]
      );
      if (!rowCount) return res.status(403).json({ error:'forbidden' });
    }

    const { rowCount } = await db.query(
      `DELETE FROM team_members WHERE team_id=$1 AND user_id=$2`,
      [teamId, req.params.userId]
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
