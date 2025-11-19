-- fix_names.sql - Исправление имен пользователей
SET client_encoding = 'UTF8';

UPDATE users SET name = 'Admin User' WHERE login = 'admin';
UPDATE users SET name = 'Manager User' WHERE login = 'manager';
UPDATE users SET name = 'Regular User' WHERE login = 'user';
UPDATE users SET name = 'Alex P.' WHERE login = 'alex';
UPDATE users SET name = 'Maria S.' WHERE login = 'maria';
UPDATE users SET name = 'Oleg T.' WHERE login = 'oleg';