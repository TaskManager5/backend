-- 011.sql - Переход на M2M-связь для Навыков

-- 1. Удаляем старую колонку 'skills' (из 008.sql), если она существует
ALTER TABLE users DROP COLUMN IF EXISTS skills;

-- 2. Создаем таблицу Категорий Навыков
CREATE TABLE IF NOT EXISTS skill_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

-- 3. Создаем таблицу Навыков, связанную с Категориями
CREATE TABLE IF NOT EXISTS skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category_id INT NOT NULL REFERENCES skill_categories(id) ON DELETE CASCADE,
  UNIQUE(name, category_id) -- Навык должен быть уникальным в рамках категории
);

-- 4. Создаем "join" таблицу (Многие-ко-Многим) для users <-> skills
CREATE TABLE IF NOT EXISTS user_skills (
  -- user_id должен быть BIGINT, т.к. users.id это bigserial
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, 
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, skill_id) -- Связь уникальна
);

-- 5. Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_skills_category_id ON skills(category_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);