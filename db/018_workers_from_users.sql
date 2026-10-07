-- Заполняем workers существующими пользователями.
-- Каждый user → один worker с user_id = user.id.
-- Идемпотентно: повторный запуск не создаст дубликаты.

BEGIN;

INSERT INTO workers (user_id, name, position)
SELECT id, name, "position"
FROM users
WHERE id NOT IN (SELECT user_id FROM workers WHERE user_id IS NOT NULL);

COMMIT;
