-- Сущность "Проект".
-- Проект ↔ сотрудник: M:N через project_members с ролью.
-- Задачи и команды привязаны к проекту.

BEGIN;

CREATE TABLE IF NOT EXISTS projects (
    id          bigserial PRIMARY KEY,
    name        text NOT NULL,
    description text,
    status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
    created_by  bigint REFERENCES workers(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_members (
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worker_id  bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'manager', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_worker ON project_members(worker_id);

ALTER TABLE teams ADD COLUMN IF NOT EXISTS project_id bigint REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id bigint REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_teams_project_id ON teams(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

INSERT INTO projects (name, description, created_by)
SELECT 'Основной проект', 'Создан автоматически для существующих данных',
       (SELECT id FROM workers WHERE user_id IN (SELECT id FROM users WHERE role='admin') LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM projects);

UPDATE teams
SET project_id = (SELECT id FROM projects ORDER BY id LIMIT 1)
WHERE project_id IS NULL;

UPDATE tasks
SET project_id = (SELECT id FROM projects ORDER BY id LIMIT 1)
WHERE project_id IS NULL;

INSERT INTO project_members (project_id, worker_id, role)
SELECT
    (SELECT id FROM projects ORDER BY id LIMIT 1),
    w.id,
    CASE
        WHEN u.role = 'admin' THEN 'owner'
        WHEN u.role = 'manager' THEN 'manager'
        ELSE 'member'
    END
FROM workers w
LEFT JOIN users u ON u.id = w.user_id
ON CONFLICT (project_id, worker_id) DO NOTHING;

COMMIT;
