DO $$ BEGIN CREATE TYPE role AS ENUM ('admin','manager','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE priority AS ENUM ('high','medium','low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE status AS ENUM ('new','in_progress','done','canceled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
