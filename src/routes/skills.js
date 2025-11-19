import { Router } from 'express';
import { db } from '../services/db.js';
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

export const router = Router();
router.use(verifyAccess); // Защищаем все роуты

// GET /skills (Получить все навыки, сгруппированные по категориям)
// Этот маршрут доступен всем (user, manager, admin) для фильтров
router.get('/', async (req, res, next) => {
  try {
    // Этот запрос использует JSON-агрегацию в PostgreSQL
    // чтобы сразу собрать навыки (s) в массив 'skills' для каждой категории (c)
    const { rows } = await db.query(`
      SELECT 
        c.id AS category_id, 
        c.name AS category_name,
        COALESCE(
          json_agg(
            json_build_object(
              'skill_id', s.id, 
              'skill_name', s.name
            )
            ORDER BY s.name
          ) FILTER (WHERE s.id IS NOT NULL), 
          '[]'
        ) AS skills
      FROM skill_categories c
      LEFT JOIN skills s ON s.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name;
    `);
    res.json(rows);
  } catch (err) {
    console.error('Ошибка при загрузке навыков:', err);
    next(err);
  }
});

// --- Маршруты только для Админа ---

// POST /skills/categories (Создать новую категорию)
router.post('/categories', 
  requireRole('admin'), 
  validate.body(z.object({ name: z.string().min(1) })),
  async (req, res, next) => {
    try {
      const { rows: [newCategory] } = await db.query(
        'INSERT INTO skill_categories (name) VALUES ($1) RETURNING *',
        [req.body.name]
      );
      res.status(201).json(newCategory);
    } catch (err) {
      if (err.code === '23505') { // unique_violation
          return res.status(409).json({ error: 'Категория с таким именем уже существует' });
      }
      next(err);
    }
});

// POST /skills (Создать новый навык)
router.post('/',
  requireRole('admin'),
  validate.body(z.object({
    name: z.string().min(1),
    category_id: z.coerce.number().int().positive()
  })),
  async (req, res, next) => {
    try {
      const { name, category_id } = req.body;
      const { rows: [newSkill] } = await db.query(
        'INSERT INTO skills (name, category_id) VALUES ($1, $2) RETURNING *',
        [name, category_id]
      );
      res.status(201).json(newSkill);
    } catch (err) {
      if (err.code === '23505') { // unique_violation
          return res.status(409).json({ error: 'Навык с таким именем уже существует в этой категории' });
      }
      if (err.code === '23503') { // foreign_key_violation
          return res.status(422).json({ error: 'Категория не найдена' });
      }
      next(err);
    }
});

// DELETE /skills/:id (Удалить навык)
router.delete('/:id',
  requireRole('admin'),
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      // ON DELETE CASCADE в 011.sql позаботится об удалении из user_skills
      await db.query('DELETE FROM skills WHERE id = $1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
});

// DELETE /skills/categories/:id (Удалить категорию)
router.delete('/categories/:id',
  requireRole('admin'),
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    try {
      // ON DELETE CASCADE в 011.sql позаботится об удалении навыков
      await db.query('DELETE FROM skill_categories WHERE id = $1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
});

export { router as skillsRouter };