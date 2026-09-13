-- Таблица refresh-токенов.
-- Колонки: jti (UUID), user_id, expires_at, revoked_at.
-- Создана вручную, потому что в исходном проекте её забыли добавить.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti         UUID PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
