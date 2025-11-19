-- 1. Добавляем новые колонки в таблицу users
ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills TEXT[];

-- 2. Обновляем существующих пользователей (admin, manager, user)
UPDATE users 
SET 
    name = 'Даня М.', 
    position = 'Администратор', 
    skills = '{"Управление", "Планирование", "Аналитика"}'
WHERE login = 'admin';

UPDATE users 
SET 
    name = 'Ольга С.', 
    position = 'Менеджер проектов', 
    skills = '{"Планирование", "Координация", "UML", "Agile"}'
WHERE login = 'manager';

UPDATE users 
SET 
    name = 'Иван Р.', 
    position = 'Руководитель отдела', 
    skills = '{"Python", "Docker", "Kubernetes", "AWS"}'
WHERE login = 'user';

-- 3. Добавляем новых пользователей (Алексей и Мария)
-- (Мы даем им простые логины и пароли, чтобы они были в системе)
INSERT INTO users (login, password_hash, name, role, position, skills) 
VALUES 
    ('alex', crypt('alex123', gen_salt('bf')), 'Алексей П.', 'user', 'Senior разработчик', '{"JavaScript", "React", "Node.js", "PostgreSQL"}')
ON CONFLICT (login) DO NOTHING;

INSERT INTO users (login, password_hash, name, role, position, skills) 
VALUES 
    ('maria', crypt('maria123', gen_salt('bf')), 'Мария С.', 'user', 'UX/UI дизайнер', '{"Figma", "Adobe XD", "CSS", "HTML"}')
ON CONFLICT (login) DO NOTHING;