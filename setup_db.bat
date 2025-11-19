@echo off
set "PGBIN=C:\Program Files\PostgreSQL\17\bin"
set "PGHOST=127.0.0.1" & set "PGPORT=5432" & set "PGDB=postgres" & set "PGSUPER=postgres"
set "APP_USER=app_user" & set "APP_PASS=Admin123"
set "DBDIR=%cd%\db"
if not exist "%PGBIN%\psql.exe" echo psql not found & exit /b 1
mkdir "%DBDIR%" 2>nul

REM 001
>"%DBDIR%\001.sql" echo CREATE EXTENSION IF NOT EXISTS pg_trgm;^
 CREATE EXTENSION IF NOT EXISTS pgcrypto;
REM 002
>"%DBDIR%\002.sql" echo DO $$ BEGIN CREATE TYPE role AS ENUM ('admin','manager','user'); EXCEPTION WHEN duplicate_object THEN NULL END $$;^
 DO $$ BEGIN CREATE TYPE priority AS ENUM ('high','medium','low'); EXCEPTION WHEN duplicate_object THEN NULL END $$;^
 DO $$ BEGIN CREATE TYPE status AS ENUM ('new','in_progress','done','canceled'); EXCEPTION WHEN duplicate_object THEN NULL END $$;
REM 003
>"%DBDIR%\003.sql" echo CREATE TABLE IF NOT EXISTS users(id bigserial PRIMARY KEY,login text UNIQUE NOT NULL,password_hash text NOT NULL,name text NOT NULL,role role NOT NULL DEFAULT 'user',email text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());^
 CREATE TABLE IF NOT EXISTS tasks(id bigserial PRIMARY KEY,title text NOT NULL,description text,deadline timestamptz NOT NULL,priority priority NOT NULL,importance int NOT NULL CHECK(importance BETWEEN 1 AND 10),complexity int NOT NULL CHECK(complexity BETWEEN 1 AND 10),assignee_id bigint REFERENCES users(id),status status NOT NULL DEFAULT 'new',quadrant smallint NOT NULL DEFAULT 4,created_by bigint NOT NULL REFERENCES users(id),team_id bigint,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(deadline>now()));
REM 004
>"%DBDIR%\004.sql" echo CREATE OR REPLACE FUNCTION set_quadrant() RETURNS trigger AS $$ DECLARE urgent boolean; important boolean; BEGIN urgent:=NEW.deadline<=now()+interval '2 days'; important:=NEW.importance>=7; NEW.quadrant:=CASE WHEN important AND urgent THEN 1 WHEN important AND NOT urgent THEN 2 WHEN NOT important AND urgent THEN 3 ELSE 4 END; NEW.updated_at:=now(); RETURN NEW; END $$ LANGUAGE plpgsql;^
 DROP TRIGGER IF EXISTS trg_tasks_quadrant ON tasks;^
 CREATE TRIGGER trg_tasks_quadrant BEFORE INSERT OR UPDATE OF deadline,importance ON tasks FOR EACH ROW EXECUTE FUNCTION set_quadrant();
REM 005
>"%DBDIR%\005.sql" echo CREATE INDEX IF NOT EXISTS ix_tasks_deadline ON tasks(deadline);^
 CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status);^
 CREATE INDEX IF NOT EXISTS ix_tasks_assignee ON tasks(assignee_id);^
 CREATE INDEX IF NOT EXISTS ix_tasks_quadrant ON tasks(quadrant);^
 CREATE INDEX IF NOT EXISTS ix_tasks_title_trgm ON tasks USING gin(title gin_trgm_ops);^
 CREATE INDEX IF NOT EXISTS ix_tasks_desc_trgm ON tasks USING gin(description gin_trgm_ops);
REM 006
>"%DBDIR%\006.sql" echo INSERT INTO users(login,password_hash,name,role,email) VALUES('admin',crypt('admin123',gen_salt('bf',12)),'Admin','admin','admin@example.com'),('user',crypt('user123',gen_salt('bf',12)),'User','user','user@example.com'),('manager',crypt('manager123',gen_salt('bf',12)),'Manager','manager','manager@example.com') ON CONFLICT(login) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,name=EXCLUDED.name,email=EXCLUDED.email;
REM 007
>"%DBDIR%\007.sql" echo DO $$ BEGIN CREATE ROLE %APP_USER% LOGIN PASSWORD '%APP_PASS%'; EXCEPTION WHEN duplicate_object THEN PERFORM 1; END $$;^
 GRANT CONNECT ON DATABASE %PGDB% TO %APP_USER%; GRANT USAGE ON SCHEMA public TO %APP_USER%;^
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO %APP_USER%;^
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %APP_USER%;^
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %APP_USER%;^
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO %APP_USER%;
REM .env
>".env" (
echo PGHOST=%PGHOST%
echo PGPORT=%PGPORT%
echo PGDATABASE=%PGDB%
echo PGUSER=%APP_USER%
echo PGPASSWORD=%APP_PASS%
echo.
echo PORT=3000
echo JWT_SECRET=change_me
)

REM apply
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\001.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\002.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\003.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\004.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\005.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\006.sql" || exit /b 1
"%PGBIN%\psql.exe" -v ON_ERROR_STOP=1 -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -f "%DBDIR%\007.sql" || exit /b 1

echo Done. Check:
"%PGBIN%\psql.exe" -h %PGHOST% -p %PGPORT% -U %PGSUPER% -d %PGDB% -c "SELECT login,role FROM users;"
