-- Создание таблицы workers — справочник сотрудников.
-- user_id = NULL → сотрудник без учётки.
-- user_id = X    → связан с пользователем X.

BEGIN;

CREATE TABLE IF NOT EXISTS workers (
    id          bigserial PRIMARY KEY,
    user_id     bigint UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    name        text NOT NULL,
    position    text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id);

COMMIT;
