-- Добавляем поле created_at в таблицу teams если его нет
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Обновляем существующие записи, если поле было добавлено
UPDATE teams SET created_at = NOW() WHERE created_at IS NULL;

-- Проверяем, что поле добавилось
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'teams' AND column_name = 'created_at';