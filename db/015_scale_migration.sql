-- Миграция: диапазон importance/complexity с 1-10 на 1-5.
-- Идемпотентно: можно запускать повторно.
-- Применяется к существующим БД. Для новых БД достаточно 003.sql и 004.sql.

BEGIN;

-- 1. Удалить старые constraints
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_importance_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_complexity_check;

-- 2. Пересчитать данные 1-10 → 1-5 (ceil(value/2)). Значения 1-5 не меняются.
UPDATE tasks SET importance = CEIL(importance::numeric / 2) WHERE importance > 5;
UPDATE tasks SET complexity = CEIL(complexity::numeric / 2) WHERE complexity > 5;

-- 3. Добавить новые constraints
ALTER TABLE tasks
  ADD CONSTRAINT tasks_importance_check CHECK (importance >= 1 AND importance <= 5),
  ADD CONSTRAINT tasks_complexity_check CHECK (complexity >= 1 AND complexity <= 5);

-- 4. Обновить триггер set_quadrant (important теперь >= 4)
CREATE OR REPLACE FUNCTION set_quadrant() RETURNS trigger AS $$
DECLARE
  urgent boolean;
  important boolean;
BEGIN
  urgent := NEW.deadline <= now() + interval '2 days';
  important := NEW.importance >= 4;

  NEW.quadrant := CASE
    WHEN important AND urgent THEN 1
    WHEN important AND NOT urgent THEN 2
    WHEN NOT important AND urgent THEN 3
    ELSE 4
  END;

  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

COMMIT;
