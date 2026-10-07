-- Добавляем worker_id в team_members и переносим данные.
-- ВАЖНО: user_id пока НЕ удаляем — оставляем для совместимости,
-- удалим отдельным шагом после обновления бэкенда и фронтенда.

BEGIN;

-- 1. Добавить колонку worker_id (nullable)
ALTER TABLE team_members 
    ADD COLUMN IF NOT EXISTS worker_id bigint;

-- 2. Перенести данные: user_id → worker_id
UPDATE team_members tm
SET worker_id = w.id
FROM workers w
WHERE w.user_id = tm.user_id AND tm.worker_id IS NULL;

-- 3. Проверить, что все worker_id заполнены
DO $$
DECLARE
    null_count int;
BEGIN
    SELECT COUNT(*) INTO null_count FROM team_members WHERE worker_id IS NULL;
    IF null_count > 0 THEN
        RAISE EXCEPTION 'Есть % записей team_members без worker_id. Миграция остановлена.', null_count;
    END IF;
END $$;

-- 4. Сделать worker_id NOT NULL
ALTER TABLE team_members 
    ALTER COLUMN worker_id SET NOT NULL;

-- 5. Добавить FK на workers (если ещё нет)
ALTER TABLE team_members 
    ADD CONSTRAINT team_members_worker_id_fkey 
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE;

-- 6. Индекс
CREATE INDEX IF NOT EXISTS idx_team_members_worker_id 
    ON team_members(worker_id);

COMMIT;
