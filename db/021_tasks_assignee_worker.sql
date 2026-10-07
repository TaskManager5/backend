-- Добавляем assignee_worker_id в tasks и переносим данные из assignee_id.
-- ВАЖНО: assignee_id пока НЕ удаляем — оставляем для совместимости,
-- удалим отдельным шагом после обновления бэкенда и фронтенда.
-- created_by НЕ трогаем — это создатель задачи (всегда авторизованный пользователь).

BEGIN;

-- 1. Добавить колонку assignee_worker_id (nullable)
ALTER TABLE tasks 
    ADD COLUMN IF NOT EXISTS assignee_worker_id bigint;

-- 2. Перенести данные: assignee_id → assignee_worker_id
UPDATE tasks t
SET assignee_worker_id = w.id
FROM workers w
WHERE w.user_id = t.assignee_id AND t.assignee_worker_id IS NULL;

-- 3. Добавить FK на workers (если ещё нет)
ALTER TABLE tasks 
    ADD CONSTRAINT tasks_assignee_worker_id_fkey 
    FOREIGN KEY (assignee_worker_id) REFERENCES workers(id);

-- 4. Индекс для производительности
CREATE INDEX IF NOT EXISTS ix_tasks_assignee_worker 
    ON tasks(assignee_worker_id);

COMMIT;
