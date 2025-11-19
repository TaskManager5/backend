-- 012.sql - Наполнение данными для Навыков

-- 1. Наполняем Категории
INSERT INTO skill_categories (name) VALUES 
('Веб-разработка (Frontend)'), 
('Веб-разработка (Backend)'), 
('Дизайн'), 
('Менеджмент'),
('DevOps/Инфраструктура')
ON CONFLICT (name) DO NOTHING;

-- 2. Наполняем Навыки
INSERT INTO skills (name, category_id) VALUES 
('React', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)')), 
('JavaScript (ES6+)', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)')),
('HTML', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)')),
('CSS', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)')),
('Node.js', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Backend)')), 
('PostgreSQL', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Backend)')),
('Python', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Backend)')),
('Figma', (SELECT id FROM skill_categories WHERE name = 'Дизайн')), 
('Adobe XD', (SELECT id FROM skill_categories WHERE name = 'Дизайн')),
('UI/UX', (SELECT id FROM skill_categories WHERE name = 'Дизайн')),
('Agile', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')),
('Scrum', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')),
('Планирование', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')),
('Координация', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')),
('Аналитика', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')),
('UML', (SELECT id FROM skill_categories WHERE name = 'Менеджмент')), -- (Добавлен 'UML' из 008.sql)
('Docker', (SELECT id FROM skill_categories WHERE name = 'DevOps/Инфраструктура')),
('Kubernetes', (SELECT id FROM skill_categories WHERE name = 'DevOps/Инфраструктура')),
('AWS', (SELECT id FROM skill_categories WHERE name = 'DevOps/Инфраструктура'))
ON CONFLICT (name, category_id) DO NOTHING;


-- 3. Связываем существующих пользователей с их новыми навыками
-- (Эти данные восстанавливают информацию, которая была в 008.sql)

-- 3.1. 'admin' (Даня М.)
INSERT INTO user_skills (user_id, skill_id)
SELECT 
    (SELECT id FROM users WHERE login = 'admin'), 
    s.id 
FROM skills s
WHERE s.name IN ('Планирование', 'Аналитика') -- "Управление" не было в списке выше, можно добавить если нужно
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- 3.2. 'manager' (Ольга С.)
INSERT INTO user_skills (user_id, skill_id)
SELECT 
    (SELECT id FROM users WHERE login = 'manager'), 
    s.id 
FROM skills s
WHERE s.name IN ('Планирование', 'Координация', 'UML', 'Agile')
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- 3.3. 'user' (Иван Р.)
INSERT INTO user_skills (user_id, skill_id)
SELECT 
    (SELECT id FROM users WHERE login = 'user'), 
    s.id 
FROM skills s
WHERE s.name IN ('Python', 'Docker', 'Kubernetes', 'AWS')
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- 3.4. 'alex' (Алексей П.)
INSERT INTO user_skills (user_id, skill_id)
SELECT 
    (SELECT id FROM users WHERE login = 'alex'), 
    s.id 
FROM skills s
WHERE s.name IN ('JavaScript (ES6+)', 'React', 'Node.js', 'PostgreSQL')
ON CONFLICT (user_id, skill_id) DO NOTHING;

-- 3.5. 'maria' (Мария С.)
INSERT INTO user_skills (user_id, skill_id)
SELECT 
    (SELECT id FROM users WHERE login = 'maria'), 
    s.id 
FROM skills s
WHERE s.name IN ('Figma', 'Adobe XD', 'CSS', 'HTML')
ON CONFLICT (user_id, skill_id) DO NOTHING;
