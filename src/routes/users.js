import { Router } from 'express';
import { pool } from '../services/db.js'; 
// Импортируем verifyAccess
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const router = Router();
//  Применяем middleware аутентификации ко всем маршрутам /users
router.use(verifyAccess);

// GET /users (Для списка сотрудников и модального окна) 
router.get('/', async (req, res, next) => {
  try {
    // Полностью новый запрос
    // Мы используем LEFT JOIN и агрегацию json_agg для сбора всех навыков
    // в структурированный JSON-массив
    const result = await pool.query(
      `SELECT 
        u.id, 
        u.name, 
        u.position, 
        u.role, 
        u.login,
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
      FROM users u
      LEFT JOIN user_skills us ON u.id = us.user_id
      LEFT JOIN skills s ON us.skill_id = s.id
      LEFT JOIN skill_categories c ON s.category_id = c.id
      GROUP BY u.id
      ORDER BY u.name;`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка при загрузке пользователей:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /users (Для добавления нового сотрудника) 
router.post('/', requireRole('admin'), async (req, res, next) => { 
  // Мы ожидаем 'skill_ids' (массив ID) вместо 'skills' (строка)
  const { name, login, password, position, role, skill_ids } = req.body;

  // Простая проверка на сервере
  if (!name || !login || !password || !position) {
    return res.status(400).json({ error: 'Не заполнены все обязательные поля: name, login, password, position' });
  }

  // Используем транзакцию, чтобы создать пользователя И его навыки
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Проверяем, существует ли логин
    const exists = await client.query('SELECT 1 FROM users WHERE login = $1', [login]);
    if (exists.rowCount > 0) {
      return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
    }

    // 2. Создаем пользователя
    const userResult = await client.query(
      `INSERT INTO users (name, login, password_hash, position, role)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12)), $4, $5)
       RETURNING id, name, position, role, login`,
      // Мы убрали 'skills' из этого запроса
      [name, login, password, position, role || 'user'] 
    );
    
    const newUser = userResult.rows[0];

    // 3. Добавляем навыки в 'user_skills', если они были переданы
    if (skill_ids && Array.isArray(skill_ids) && skill_ids.length > 0) {
      // Готовим запрос для множественной вставки
      const skillValues = skill_ids.map((skillId, index) => 
        `($1, $${index + 2})` // $1 будет user_id, $2+ будут skillId
      ).join(', ');
      
      const skillParams = [newUser.id, ...skill_ids];
      
      await client.query(
        `INSERT INTO user_skills (user_id, skill_id) VALUES ${skillValues}`,
        skillParams
      );
    }
    
    // 4. Коммитим транзакцию
    await client.query('COMMIT');

    // 5. Возвращаем нового пользователя (навыки пока не возвращаем, 
    // т.к. фронтенд все равно сделает refetch GET /users)
    res.status(201).json(newUser);

  } catch (err) {
    await client.query('ROLLBACK'); // Откатываем в случае ошибки
    console.error('Ошибка при создании пользователя:', err);
    // Обрабатываем ошибку team_id (ограничение FK)
    if (err.code === '23503') { 
        // 23503 - это foreign key violation. Может случиться, если team_id или skill_id неверны
        return res.status(422).json({ error: 'team_id или skill_id не действительны' });
    }
    next(err); // Передаем ошибку в errorHandler
  } finally {
    client.release(); // Возвращаем клиента в пул
  }
});

// DELETE /users/:id 
router.delete('/:id',
  requireRole('admin'), // Только админ может удалять
  validate.params(z.object({ id: z.coerce.number().int().positive() })),
  async (req, res, next) => {
    const userId = req.params.id;
    
    // Защита от удаления себя
    if (userId === req.user.sub) {
        return res.status(403).json({ error: 'Запрещено удалять самого себя' });
    }

    // Защита от удаления "супер-админа" (admin)
    const { rows: [user] } = await pool.query('SELECT login FROM users WHERE id = $1', [userId]);
    if (user && user.login === 'admin') {
        return res.status(403).json({ error: 'Запрещено удалять главного администратора' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Удаляем связи из 'team_members'
        await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);
        
        // 2. Удаляем связи навыков
        await client.query('DELETE FROM user_skills WHERE user_id = $1', [userId]);
        
        // 3. Удаляем задачи 
        // Сначала удаляем те, где он исполнитель
        await client.query('DELETE FROM tasks WHERE assignee_id = $1', [userId]);
        // Затем удаляем те, где он создатель
        await client.query('DELETE FROM tasks WHERE created_by = $1', [userId]);
        
        // 4. Удаляем самого пользователя
        const { rowCount } = await client.query('DELETE FROM users WHERE id = $1', [userId]);
        
        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        await client.query('COMMIT');
        res.status(204).end(); 
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка при удалении пользователя:', err);
        // Обрабатываем FK constraint, если задачи не удалились
        if (err.code === '23503') {
            return res.status(422).json({ error: 'Невозможно удалить пользователя, есть оставшиеся связанные задачи (FK constraint)' });
        }
        next(err);
    } finally {
        client.release();
    }
  }
);

// PATCH /users/:id (Редактирование сотрудника/профиля)
router.patch('/:id',
  // Проверка прав: либо админ, либо сам пользователь редактирует себя
  async (req, res, next) => {
      const targetId = parseInt(req.params.id);
      if (req.user.role !== 'admin' && req.user.sub !== targetId) {
          return res.status(403).json({ error: 'forbidden' });
      }
      next();
  },
  validate.body(z.object({
    name: z.string().min(1).optional(),
    login: z.string().min(1).optional(),
    password: z.string().min(8).optional(), // Пароль опционален
    position: z.string().optional(),
    skill_ids: z.array(z.number()).optional()
  })),
  async (req, res, next) => {
    const userId = parseInt(req.params.id);
    const { name, login, password, position, skill_ids } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Обновляем основные поля (динамическое формирование запроса)
      const updates = [];
      const values = [];
      let idx = 1;

      if (name) { updates.push(`name=$${idx++}`); values.push(name); }
      if (login) { updates.push(`login=$${idx++}`); values.push(login); }
      if (position) { updates.push(`position=$${idx++}`); values.push(position); }
      if (password) { 
          updates.push(`password_hash=crypt($${idx++}, gen_salt('bf', 12))`); 
          values.push(password); 
      }

      if (updates.length > 0) {
          // Проверка уникальности логина, если он меняется
          if (login) {
              const check = await client.query('SELECT 1 FROM users WHERE login = $1 AND id != $2', [login, userId]);
              if (check.rowCount > 0) {
                  throw { code: 'LOGIN_EXISTS' };
              }
          }
          
          await client.query(
              `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
              [...values, userId]
          );
      }

      // 2. Обновляем навыки (если переданы) - полная перезапись
      if (skill_ids) {
          await client.query('DELETE FROM user_skills WHERE user_id = $1', [userId]);
          
          if (skill_ids.length > 0) {
              const skillValues = skill_ids.map((sid, i) => `($1, $${i + 2})`).join(', ');
              await client.query(
                  `INSERT INTO user_skills (user_id, skill_id) VALUES ${skillValues}`,
                  [userId, ...skill_ids]
              );
          }
      }

      await client.query('COMMIT');
      
      // Возвращаем обновленные данные
      const { rows: [updatedUser] } = await client.query('SELECT id, name, login, position, role FROM users WHERE id = $1', [userId]);
      res.json(updatedUser);

    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === 'LOGIN_EXISTS') {
          return res.status(409).json({ error: 'Этот логин уже занят' });
      }
      console.error('Update user error:', err);
      next(err);
    } finally {
      client.release();
    }
  }
);

export { router };
