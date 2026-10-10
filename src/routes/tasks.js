import { Router } from 'express';
import { z } from 'zod';
import { db } from '../services/db.js'; 
import { verifyAccess } from '../middleware/auth.js';

export const router = Router();
router.use(verifyAccess);

// схемы для body/params
const Id = z.coerce.number().int().positive();
const PostTask = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  deadline: z.coerce.date(),
  priority: z.enum(['low','medium','high']),
  importance: z.number().int().min(1).max(5),
  complexity: z.number().int().min(1).max(5),
  assigneeId: z.number().int().positive().nullable().optional(),
  teamId: z.number().int().positive().nullable().optional(),
  parentTaskId: z.number().int().positive().nullable().optional(),
  status: z.enum(['new','in_progress','done','canceled']).default('new')
});
const PatchTask = PostTask.partial();

// RBAC WHERE с базовым индексом 
function whereByRole(user, base = 1){
  // Администратор видит всё
  if (user.role === 'admin') return { sql:'TRUE', params:[] };
  
  // Пользователь и Менеджер видят только свои задачи (назначенные ИЛИ созданные)
  // Мы используем user.sub (который является ID пользователя)
  return { sql:`t.assignee_worker_id = (SELECT id FROM workers WHERE user_id = $${base}) OR t.created_by = $${base}`, params:[user.sub] };
}

// LIST ( Фильтрация по роли и имя исполнителя)
router.get('/', async (req,res)=>{
  const q = req.query || {};
  const limit  = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(q.offset ?? '0', 10) || 0, 0);

  // 1. Применяем базовый фильтр по роли
  const wRole = whereByRole(req.user, 1);
  const p = [];

  // Преобразуем ID в число перед запросом 
  if (wRole.params.length > 0) {
    wRole.params[0] = parseInt(wRole.params[0], 10);
  }
  // **********************************************************************
  
  const cond = [];

  if (wRole.sql !== 'TRUE') {
      p.push(...wRole.params);
      cond.push(`(${wRole.sql})`);
  }
  
  // 2. Применяем дополнительные фильтры
  let currentParamIndex = p.length + 1; 

  if (q.status){ p.push(String(q.status)); cond.push(`t.status=$${currentParamIndex++}`); }
  if (q.assigneeId){ p.push(Number(q.assigneeId)); cond.push(`t.assignee_worker_id=$${currentParamIndex++}`); }
  if (q.teamId){ p.push(Number(q.teamId)); cond.push(`t.team_id=$${currentParamIndex++}`); }
  if (q.projectId){ p.push(Number(q.projectId)); cond.push(`t.project_id=$${currentParamIndex++}`); }
  if (String(q.urgent).toLowerCase()==='true'){ cond.push(`t.deadline <= now() + interval '2 days'`); }
  if (String(q.important).toLowerCase()==='true'){ cond.push(`t.importance >= 4`); }
  if (String(q.hard).toLowerCase()==='true'){ cond.push(`t.complexity >= 4`); }
  if (q.q){
    p.push(`%${q.q}%`, `%${q.q}%`);
    cond.push(`(t.title ILIKE $${currentParamIndex++} OR t.description ILIKE $${currentParamIndex++})`);
  }
  
  const finalCondition = cond.length > 0 ? cond.join(' AND ') : 'TRUE';
  
  // 3. Формируем финальный запрос
  const { rows } = await db.query(
    `SELECT t.*, w.name AS assignee_name
     FROM tasks t
     LEFT JOIN workers w ON t.assignee_worker_id = w.id
     WHERE ${finalCondition}
     ORDER BY t.id DESC
     LIMIT $${currentParamIndex++} OFFSET $${currentParamIndex++}`,
    [...p, limit, offset]
  );
  res.json(rows);
});

// CREATE ( Возврат имени исполнителя)
router.post('/', async (req,res)=>{
  const parsed = PostTask.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'bad_request' });

  const body = parsed.data;
  if (new Date(body.deadline) < new Date()) return res.status(422).json({ error:'deadline_past' });
  if (req.user.role === 'manager' && !body.teamId) return res.status(422).json({ error:'team_required_for_manager' });
  if (req.user.role === 'user' && body.teamId) return res.status(403).json({ error:'forbidden_team_set' });

  const p = [
    body.title, body.description, body.deadline,
    body.priority, body.importance, body.complexity,
    body.assigneeId ?? null, body.teamId ?? null,
    body.parentTaskId ?? null,
    body.status, req.user.sub
  ];

  try{
    const { rows:[t] } = await db.query(
      `INSERT INTO tasks(title,description,deadline,priority,importance,complexity,
                        assignee_worker_id,team_id,parent_task_id,status,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *, (SELECT name FROM workers WHERE id = $7) AS assignee_name`, 
        p);
    req.app.get('io')?.emit('task.created', t);
    res.status(201).json(t);
  }catch(err){
    if (err.code === '23514') return res.status(422).json({ error:'assignee_not_in_team' });
    throw err;
  }
});

// UPDATE 
router.patch('/:id', async (req,res)=>{
  const idParsed = Id.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error:'bad_request' });

  const bodyParsed = PatchTask.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error:'bad_request' });
  // Защита от циклов: parentTaskId не может быть самой задачей
  if (bodyParsed.data.parentTaskId === idParsed.data) {
    return res.status(422).json({ error: 'task_cannot_be_parent_of_itself' });
  }
  // Защита от прямого цикла (A — подзадача B, а B — подзадача A)
  if (bodyParsed.data.parentTaskId) {
    const { rows:[parent] } = await db.query(
      'SELECT parent_task_id FROM tasks WHERE id = $1',
      [bodyParsed.data.parentTaskId]
    );
    if (parent && parent.parent_task_id === idParsed.data) {
      return res.status(422).json({ error: 'circular_dependency' });
    }
  }

  const updates = [];
  const p = [];
  for (const [k,v] of Object.entries(bodyParsed.data)){
    const map = { assigneeId:'assignee_worker_id', teamId:'team_id', parentTaskId:'parent_task_id' };
    const col = map[k] || k;
    updates.push(`${col} = $${p.length+1}`);
    p.push(v);
  }
  if (!updates.length) return res.status(400).json({ error:'empty_patch' });

  const idIdx = p.length + 1;
  const w = whereByRole(req.user, idIdx + 1);

  // Преобразуем ID в число перед запросом (для PATCH) 
  if (w.params.length > 0) {
    w.params[0] = parseInt(w.params[0], 10);
  }
  // ***********************************************************************************

  try{
    const { rows:[t] } = await db.query(
      `UPDATE tasks t
       SET ${updates.join(', ')}, updated_at = now()
       WHERE t.id = $${idIdx} AND (${w.sql})
       RETURNING *`,
      [...p, idParsed.data, ...w.params]
    );
    if (!t) return res.status(404).json({ error:'not_found' });
    req.app.get('io')?.emit('task.updated', t);
    res.json(t);
  }catch(err){
    if (err.code === '23514') return res.status(422).json({ error:'assignee_not_in_team' });
    throw err;
  }
});

// DELETE 
router.delete('/:id', async (req,res)=>{
  const idParsed = Id.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error:'bad_request' });

  const w = whereByRole(req.user, 2);

  // Преобразуем ID в число перед запросом (для DELETE) 
  if (w.params.length > 0) {
    w.params[0] = parseInt(w.params[0], 10);
  }
  // ***********************************************************************************
  
  const { rowCount } = await db.query(
    `DELETE FROM tasks t
     WHERE t.id=$1 AND (${w.sql})`,
    [idParsed.data, ...w.params]
  );
  if (!rowCount) return res.status(404).json({ error:'not_found' });
  req.app.get('io')?.emit('task.deleted', { id: Number(idParsed.data) });
  res.status(204).end();
});
