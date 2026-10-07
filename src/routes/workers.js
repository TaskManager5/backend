import { Router } from 'express';
import { pool } from '../services/db.js';
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();

// Все роуты — только авторизованные
router.use(verifyAccess);

// GET /api/workers — список всех сотрудников (с навыками)
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        w.id,
        w.user_id,
        w.name,
        w.position,
        w.created_at,
        w.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'skill_id', s.id,
              'skill_name', s.name,
              'category_id', c.id,
              'category_name', c.name
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS skills
      FROM workers w
      LEFT JOIN worker_skills ws ON w.id = ws.worker_id
      LEFT JOIN skills s ON ws.skill_id = s.id
      LEFT JOIN skill_categories c ON s.category_id = c.id
      GROUP BY w.id
      ORDER BY w.id`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/workers — создать сотрудника (без учётки)
// Может менеджер или админ.
router.post('/',
  requireRole('admin', 'manager'),
  validate.body(z.object({
    name: z.string().min(1),
    position: z.string().optional().default(''),
    skill_ids: z.array(z.number().int().positive()).optional().default([])
  })),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { name, position, skill_ids } = req.body;
      
      // 1. Создаём worker (user_id = NULL — без учётки)
      const { rows: [worker] } = await client.query(
        `INSERT INTO workers (user_id, name, position)
         VALUES (NULL, $1, $2)
         RETURNING id, user_id, name, position, created_at, updated_at`,
        [name, position]
      );
      
      // 2. Привязываем навыки
      if (skill_ids.length > 0) {
        const values = skill_ids.map((sid, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO worker_skills (worker_id, skill_id) VALUES ${values}`,
          [worker.id, ...skill_ids]
        );
      }
      
      await client.query('COMMIT');
      
      // 3. Возвращаем worker с навыками
      const { rows: [result] } = await client.query(
        `SELECT 
          w.id, w.user_id, w.name, w.position, w.created_at, w.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'skill_id', s.id,
                'skill_name', s.name,
                'category_id', c.id,
                'category_name', c.name
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'
          ) AS skills
        FROM workers w
        LEFT JOIN worker_skills ws ON w.id = ws.worker_id
        LEFT JOIN skills s ON ws.skill_id = s.id
        LEFT JOIN skill_categories c ON s.category_id = c.id
        WHERE w.id = $1
        GROUP BY w.id`,
        [worker.id]
      );
      
      res.status(201).json(result);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// PATCH /api/workers/:id — редактировать сотрудника
// Может админ или менеджер.
router.patch('/:id',
  requireRole('admin', 'manager'),
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  validate.body(z.object({
    name: z.string().min(1).optional(),
    position: z.string().optional(),
    skill_ids: z.array(z.number().int().positive()).optional()
  })),
  async (req, res, next) => {
    const workerId = req.params.id;
    const { name, position, skill_ids } = req.body;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Проверяем, что worker существует
      const { rows: [existing] } = await client.query(
        'SELECT id FROM workers WHERE id = $1',
        [workerId]
      );
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'not_found' });
      }
      
      // 2. Обновляем name/position, если переданы
      if (name !== undefined || position !== undefined) {
        const updates = [];
        const params = [];
        if (name !== undefined) { 
          updates.push(`name = $${params.length + 1}`); 
          params.push(name); 
        }
        if (position !== undefined) { 
          updates.push(`position = $${params.length + 1}`); 
          params.push(position); 
        }
        updates.push('updated_at = now()');
        params.push(workerId);
        
        await client.query(
          `UPDATE workers SET ${updates.join(', ')} WHERE id = $${params.length}`,
          params
        );
      }
      
      // 3. Обновляем навыки, если переданы
      if (skill_ids !== undefined) {
        await client.query('DELETE FROM worker_skills WHERE worker_id = $1', [workerId]);
        if (skill_ids.length > 0) {
          const values = skill_ids.map((sid, i) => `($1, $${i + 2})`).join(', ');
          await client.query(
            `INSERT INTO worker_skills (worker_id, skill_id) VALUES ${values}`,
            [workerId, ...skill_ids]
          );
        }
      }
      
      await client.query('COMMIT');
      
      // 4. Возвращаем обновлённого worker
      const { rows: [result] } = await client.query(
        `SELECT 
          w.id, w.user_id, w.name, w.position, w.created_at, w.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'skill_id', s.id,
                'skill_name', s.name,
                'category_id', c.id,
                'category_name', c.name
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'
          ) AS skills
        FROM workers w
        LEFT JOIN worker_skills ws ON w.id = ws.worker_id
        LEFT JOIN skills s ON ws.skill_id = s.id
        LEFT JOIN skill_categories c ON s.category_id = c.id
        WHERE w.id = $1
        GROUP BY w.id`,
        [workerId]
      );
      
      res.json(result);
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// DELETE /api/workers/:id — удалить сотрудника
// Может админ или менеджер.
router.delete('/:id',
  requireRole('admin', 'manager'),
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    const workerId = req.params.id;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Проверяем, что worker существует
      const { rows: [existing] } = await client.query(
        'SELECT id, user_id FROM workers WHERE id = $1',
        [workerId]
      );
      if (!existing) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'not_found' });
      }
      
      // 2. Нельзя удалить worker, у которого есть учётка
      if (existing.user_id) {
        await client.query('ROLLBACK');
        return res.status(422).json({ 
          error: 'cannot_delete_worker_with_account',
          message: 'Нельзя удалить сотрудника с учётной записью. Удалите пользователя.'
        });
      }
      
      // 3. Удаляем worker (CASCADE удалит worker_skills)
      await client.query('DELETE FROM workers WHERE id = $1', [workerId]);
      
      await client.query('COMMIT');
      res.status(204).end();
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);
export { router };
