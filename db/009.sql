-- 009.sql - Создание таблиц для системы команд

-- 1. Таблица команд
CREATE TABLE IF NOT EXISTS teams (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Таблица участников команд
CREATE TABLE IF NOT EXISTS team_members (
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_team TEXT NOT NULL DEFAULT 'member' CHECK (role_in_team IN ('manager', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

-- 3. Добавляем team_id в таблицу tasks (внешний ключ)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL;

-- 4. Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);

-- 5. Триггер для обновления updated_at в teams
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_teams_updated_at();

-- 6. Добавляем тестовые команды
INSERT INTO teams (name) VALUES 
    ('Frontend Team'),
    ('Backend Team'),
    ('Design Team'),
    ('QA Team')
ON CONFLICT DO NOTHING;

-- 7. Добавляем пользователей в команды (пример)
INSERT INTO team_members (team_id, user_id, role_in_team) VALUES
    -- Frontend Team
    (1, (SELECT id FROM users WHERE login = 'alex'), 'manager'),
    (1, (SELECT id FROM users WHERE login = 'user'), 'member'),
    
    -- Backend Team  
    (2, (SELECT id FROM users WHERE login = 'manager'), 'manager'),
    (2, (SELECT id FROM users WHERE login = 'admin'), 'member'),
    
    -- Design Team
    (3, (SELECT id FROM users WHERE login = 'maria'), 'manager')
ON CONFLICT (team_id, user_id) DO NOTHING;