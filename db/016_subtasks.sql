-- Миграция: поддержка подзадач (макрозадач)
-- Добавляет поле parent_task_id — ссылку на родительскую задачу.
-- Если NULL — это макрозадача. Если указано — подзадача.

BEGIN;

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS parent_task_id bigint 
  REFERENCES tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id 
  ON tasks(parent_task_id);

COMMIT;
