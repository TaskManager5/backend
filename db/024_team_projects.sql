-- M:N: команда ↔ проект.
-- Команда может быть в нескольких проектах или ни в одном.
-- Задачи остаются N:1 (задача → один проект).

BEGIN;

CREATE TABLE IF NOT EXISTS team_projects (
    team_id    bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_team_projects_project ON team_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_team_projects_team ON team_projects(team_id);

-- Переносим существующие связи
INSERT INTO team_projects (team_id, project_id)
SELECT id, project_id FROM teams WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Удаляем старую колонку
ALTER TABLE teams DROP COLUMN IF EXISTS project_id;

COMMIT;
