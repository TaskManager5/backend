-- 013.sql - Добавление расширенного списка навыков

-- 1. Наполняем Категории (добавляем новые)
INSERT INTO skill_categories (name) VALUES 
('Тестирование (QA)'),
('Базы данных'),
('Аналитика'),
('Мобильная разработка')
ON CONFLICT (name) DO NOTHING;

-- 2. Наполняем Навыки (добавляем новые)
INSERT INTO skills (name, category_id) VALUES 
-- Тестирование
('Ручное тестирование', (SELECT id FROM skill_categories WHERE name = 'Тестирование (QA)')), 
('Автоматизированное тестирование (Selenium)', (SELECT id FROM skill_categories WHERE name = 'Тестирование (QA)')), 
('Тестирование API (Postman)', (SELECT id FROM skill_categories WHERE name = 'Тестирование (QA)')), 
('Нагрузочное тестирование (JMeter)', (SELECT id FROM skill_categories WHERE name = 'Тестирование (QA)')),
-- Базы данных
('MySQL', (SELECT id FROM skill_categories WHERE name = 'Базы данных')),
('MongoDB', (SELECT id FROM skill_categories WHERE name = 'Базы данных')),
('Redis', (SELECT id FROM skill_categories WHERE name = 'Базы данных')),
-- Аналитика
('Power BI', (SELECT id FROM skill_categories WHERE name = 'Аналитика')),
('Tableau', (SELECT id FROM skill_categories WHERE name = 'Аналитика')),
('Системный анализ', (SELECT id FROM skill_categories WHERE name = 'Аналитика')),
-- Мобильная разработка
('Swift (iOS)', (SELECT id FROM skill_categories WHERE name = 'Мобильная разработка')),
('Kotlin (Android)', (SELECT id FROM skill_categories WHERE name = 'Мобильная разработка')),
('React Native', (SELECT id FROM skill_categories WHERE name = 'Мобильная разработка')),
-- Дополняем Backend
('Java (Spring)', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Backend)')),
('C# (.NET)', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Backend)')),
-- Дополняем Frontend
('Angular', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)')),
('TypeScript', (SELECT id FROM skill_categories WHERE name = 'Веб-разработка (Frontend)'))
ON CONFLICT (name, category_id) DO NOTHING;