BEGIN;

ALTER TABLE teams 
    ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public'));

COMMIT;
