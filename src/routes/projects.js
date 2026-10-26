import { Router } from 'express';
import { z } from 'zod';
import { db, pool } from '../services/db.js';
import { verifyAccess, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const router = Router();

router.use(verifyAccess);

// --- helpers ---

async function getMyWorkerId(userId) {
    const { rows } = await db.query('SELECT id FROM workers WHERE user_id=$1', [userId]);
    return rows[0]?.id || null;
}

async function getProjectRole(projectId, workerId) {
    if (!workerId) return null;
    const { rows } = await db.query(
        'SELECT role FROM project_members WHERE project_id=$1 AND worker_id=$2',
        [projectId, workerId]
    );
    return rows[0]?.role || null;
}

// --- GET /api/projects — список доступных проектов ---
router.get('/', async (req, res, next) => {
    try {
        const u = req.user;

        if (u.role === 'admin') {
            const { rows } = await db.query(
                `SELECT p.id, p.name, p.description, p.status, p.visibility, p.created_at,
                        (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) AS members_count,
                        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) AS tasks_count,
                        (SELECT COUNT(*) FROM team_projects WHERE project_id=p.id) AS teams_count
                 FROM projects p
                 ORDER BY p.id`
            );
            return res.json(rows);
        }

        const workerId = await getMyWorkerId(u.sub);
        if (!workerId) {
            // Даже без worker'а показываем публичные
            const { rows } = await db.query(
                `SELECT p.id, p.name, p.description, p.status, p.visibility, p.created_at, NULL AS my_role,
                        (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) AS members_count,
                        (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) AS tasks_count,
                        (SELECT COUNT(*) FROM team_projects WHERE project_id=p.id) AS teams_count
                 FROM projects p
                 WHERE p.visibility = 'public'
                 ORDER BY p.id`
            );
            return res.json(rows);
        }

        // Свои + публичные (к которым не подключён)
        const { rows } = await db.query(
            `SELECT p.id, p.name, p.description, p.status, p.visibility, p.created_at,
                    pm.role AS my_role,
                    (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) AS members_count,
                    (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) AS tasks_count,
                    (SELECT COUNT(*) FROM team_projects WHERE project_id=p.id) AS teams_count
             FROM projects p
             LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.worker_id = $1
             WHERE pm.worker_id IS NOT NULL OR p.visibility = 'public'
             ORDER BY 
                CASE WHEN pm.worker_id IS NOT NULL THEN 0 ELSE 1 END,
                p.id`,
            [workerId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// --- POST /api/projects — создать проект (admin) ---
router.post('/',
    requireRole('admin', 'manager'),
    validate.body(z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional().nullable(),
        ownerWorkerId: z.coerce.number().int().positive().optional(),
        visibility: z.enum(['private', 'public']).default('private').optional()
    })),
    async (req, res, next) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { name, description, ownerWorkerId, visibility } = req.body;

            const { rows: [project] } = await client.query(
                `INSERT INTO projects (name, description, created_by, visibility)
                 VALUES ($1, $2, (SELECT id FROM workers WHERE user_id=$3), $4)
                 RETURNING id, name, description, status, visibility, created_at`,
                [name, description || null, req.user.sub, visibility || 'private']
            );

            if (ownerWorkerId) {
                await client.query(
                    `INSERT INTO project_members (project_id, worker_id, role)
                     VALUES ($1, $2, 'owner')
                     ON CONFLICT (project_id, worker_id) DO UPDATE SET role='owner'`,
                    [project.id, ownerWorkerId]
                );
            } else {
                const creatorWorkerId = await getMyWorkerId(req.user.sub);
                if (creatorWorkerId) {
                    await client.query(
                        `INSERT INTO project_members (project_id, worker_id, role)
                         VALUES ($1, $2, 'owner')
                         ON CONFLICT (project_id, worker_id) DO UPDATE SET role='owner'`,
                        [project.id, creatorWorkerId]
                    );
                }
            }

            await client.query('COMMIT');
            res.status(201).json(project);
        } catch (err) {
            await client.query('ROLLBACK');
            next(err);
        } finally {
            client.release();
        }
    }
);

// --- GET /api/projects/:id ---
router.get('/:id',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            if (u.role !== 'admin') {
                const workerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, workerId);
                if (!role) return res.status(404).json({ error: 'not_found' });
            }

            const { rows: [project] } = await db.query(
                `SELECT id, name, description, status, created_at, updated_at
                 FROM projects WHERE id=$1`,
                [projectId]
            );
            if (!project) return res.status(404).json({ error: 'not_found' });
            res.json(project);
        } catch (err) { next(err); }
    }
);

// --- PATCH /api/projects/:id ---
router.patch('/:id',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    validate.body(z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional().nullable(),
        status: z.enum(['active', 'archived']).optional(),
        visibility: z.enum(['private', 'public']).optional()
    })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            if (u.role !== 'admin') {
                const workerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, workerId);
                if (role !== 'owner') return res.status(403).json({ error: 'forbidden' });
            }

            const { name, description, status, visibility } = req.body;
            const fields = [];
            const values = [];
            let i = 1;
            if (name !== undefined) { fields.push(`name=$${i++}`); values.push(name); }
            if (description !== undefined) { fields.push(`description=$${i++}`); values.push(description); }
            if (status !== undefined) { fields.push(`status=$${i++}`); values.push(status); }
            if (visibility !== undefined) { fields.push(`visibility=$${i++}`); values.push(visibility); }
            if (!fields.length) return res.status(400).json({ error: 'no_fields' });

            fields.push(`updated_at=now()`);
            values.push(projectId);

            const { rows: [project] } = await db.query(
                `UPDATE projects SET ${fields.join(', ')} WHERE id=$${i}
                 RETURNING id, name, description, status, updated_at`,
                values
            );
            res.json(project);
        } catch (err) { next(err); }
    }
);

// --- DELETE /api/projects/:id ---
router.delete('/:id',
    requireRole('admin'),
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    async (req, res, next) => {
        try {
            const { rowCount } = await db.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
            if (!rowCount) return res.status(404).json({ error: 'not_found' });
            res.json({ ok: true });
        } catch (err) { next(err); }
    }
);

// --- GET /api/projects/:id/members ---
router.get('/:id/members',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            if (u.role !== 'admin') {
                const workerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, workerId);
                if (!role) {
                    // Если не участник — проверить публичность
                    const { rows: [proj] } = await db.query(
                        'SELECT visibility FROM projects WHERE id=$1',
                        [projectId]
                    );
                    if (!proj) return res.status(404).json({ error: 'not_found' });
                    if (proj.visibility !== 'public') {
                        return res.status(403).json({ error: 'forbidden' });
                    }
                    // Публичный — разрешаем просмотр
                }
            }

            const { rows } = await db.query(
                `SELECT w.id, w.name, w.position, u.login, pm.role, pm.created_at
                 FROM project_members pm
                 JOIN workers w ON w.id = pm.worker_id
                 LEFT JOIN users u ON u.id = w.user_id
                 WHERE pm.project_id=$1
                 ORDER BY pm.role, w.name`,
                [projectId]
            );
            res.json(rows);
        } catch (err) { next(err); }
    }
);

// --- POST /api/projects/:id/members ---
router.post('/:id/members',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    validate.body(z.object({
        workerId: z.coerce.number().int().positive(),
        role: z.enum(['owner', 'manager', 'member']).default('member')
    })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            if (u.role !== 'admin') {
                const workerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, workerId);
                if (role !== 'owner' && role !== 'manager') {
                    return res.status(403).json({ error: 'forbidden' });
                }
            }

            const { workerId, role } = req.body;
            const { rows: [member] } = await db.query(
                `INSERT INTO project_members (project_id, worker_id, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (project_id, worker_id) DO UPDATE SET role=EXCLUDED.role
                 RETURNING project_id, worker_id, role`,
                [projectId, workerId, role]
            );
            res.status(201).json(member);
        } catch (err) { next(err); }
    }
);

// --- DELETE /api/projects/:id/members/:workerId ---
router.delete('/:id/members/:workerId',
    validate.params(z.object({
        id: z.coerce.number().int().positive(),
        workerId: z.coerce.number().int().positive()
    })),
    async (req, res, next) => {
        try {
            const { id: projectId, workerId } = req.params;
            const u = req.user;

            if (u.role !== 'admin') {
                const myWorkerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, myWorkerId);
                if (role !== 'owner') return res.status(403).json({ error: 'forbidden' });

                if (Number(workerId) === Number(myWorkerId)) {
                    const { rows } = await db.query(
                        `SELECT COUNT(*) AS c FROM project_members
                         WHERE project_id=$1 AND role='owner'`,
                        [projectId]
                    );
                    if (Number(rows[0].c) <= 1) {
                        return res.status(400).json({ error: 'cannot_remove_last_owner' });
                    }
                }
            }

            const { rowCount } = await db.query(
                'DELETE FROM project_members WHERE project_id=$1 AND worker_id=$2',
                [projectId, workerId]
            );
            if (!rowCount) return res.status(404).json({ error: 'not_found' });
            res.json({ ok: true });
        } catch (err) { next(err); }
    }
);

// --- POST /api/projects/:id/join — подключиться к публичному проекту ---
router.post('/:id/join',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            const workerId = await getMyWorkerId(u.sub);
            if (!workerId) return res.status(400).json({ error: 'no_worker' });

            // Проверить, что проект публичный
            const { rows: [project] } = await db.query(
                'SELECT visibility FROM projects WHERE id=$1',
                [projectId]
            );
            if (!project) return res.status(404).json({ error: 'not_found' });
            if (project.visibility !== 'public') {
                return res.status(403).json({ error: 'not_public' });
            }

            // Добавить в участники (если ещё не)
            await db.query(
                `INSERT INTO project_members (project_id, worker_id, role)
                 VALUES ($1, $2, 'member')
                 ON CONFLICT (project_id, worker_id) DO NOTHING`,
                [projectId, workerId]
            );

            res.json({ ok: true });
        } catch (err) { next(err); }
    }
);

// --- GET /api/projects/:id/teams — команды проекта ---
router.get('/:id/teams',
    validate.params(z.object({ id: z.coerce.number().int().positive() })),
    async (req, res, next) => {
        try {
            const projectId = req.params.id;
            const u = req.user;

            // Проверка доступа: admin, или участник проекта
            if (u.role !== 'admin') {
                const workerId = await getMyWorkerId(u.sub);
                const role = await getProjectRole(projectId, workerId);
                if (!role) return res.status(404).json({ error: 'not_found' });
            }

            const { rows } = await db.query(
                `SELECT t.id, t.name, t.created_at
                 FROM team_projects tp
                 JOIN teams t ON t.id = tp.team_id
                 WHERE tp.project_id = $1
                 ORDER BY t.id`,
                [projectId]
            );
            res.json(rows);
        } catch (err) { next(err); }
    }
);

export default router;
