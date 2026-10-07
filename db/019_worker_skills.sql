-- Создаём worker_skills и переносим данные из user_skills.
-- Идемпотентно: повторный запуск не создаст дубликаты.

BEGIN;

CREATE TABLE IF NOT EXISTS worker_skills (
    worker_id   bigint  NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    skill_id    integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (worker_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_worker_skills_worker_id ON worker_skills(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_skills_skill_id ON worker_skills(skill_id);

-- Переносим данные: user_skills → worker_skills
INSERT INTO worker_skills (worker_id, skill_id)
SELECT w.id, us.skill_id
FROM user_skills us
JOIN workers w ON w.user_id = us.user_id
ON CONFLICT (worker_id, skill_id) DO NOTHING;

COMMIT;
