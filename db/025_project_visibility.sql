-- Видимость проекта: private (только участники) / public (любой может подключиться)
BEGIN;

ALTER TABLE projects 
    ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public'));

COMMIT;
