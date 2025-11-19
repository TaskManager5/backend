CREATE OR REPLACE FUNCTION set_quadrant() RETURNS trigger AS $$
DECLARE
  urgent boolean;
  important boolean;
BEGIN
  urgent := NEW.deadline <= now() + interval '2 days';
  important := NEW.importance >= 7;

  NEW.quadrant := CASE
    WHEN important AND urgent THEN 1
    WHEN important AND NOT urgent THEN 2
    WHEN NOT important AND urgent THEN 3
    ELSE 4
  END;

  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_quadrant ON tasks;

CREATE TRIGGER trg_tasks_quadrant
BEFORE INSERT OR UPDATE OF deadline, importance ON tasks
FOR EACH ROW EXECUTE FUNCTION set_quadrant();
