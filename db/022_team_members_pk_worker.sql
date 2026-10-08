-- Смена PK team_members: (team_id, user_id) → (team_id, worker_id)
-- + user_id становится nullable (для сотрудников без учётки)
-- ВАЖНО: сначала снять старый PK, потом менять user_id, потом ставить новый PK.

BEGIN;

-- 1. Снять старый PK (team_id, user_id)
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_pkey;

-- 2. Разрешить NULL в user_id (сотрудник без учётки)
ALTER TABLE team_members ALTER COLUMN user_id DROP NOT NULL;

-- 3. Новый PK (team_id, worker_id)
ALTER TABLE team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, worker_id);

COMMIT;
