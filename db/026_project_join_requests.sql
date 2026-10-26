-- Заявки на подключение к публичным проектам.
-- Пользователь подаёт заявку → менеджер команды / owner проекта одобряет.
BEGIN;

CREATE TABLE IF NOT EXISTS project_join_requests (
    id           bigserial PRIMARY KEY,
    project_id   bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worker_id    bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    decided_at   timestamptz,
    decided_by   bigint REFERENCES workers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_join_requests_project ON project_join_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON project_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_join_requests_worker ON project_join_requests(worker_id);

-- Одна активная заявка (pending) на пару (project, worker)
CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_pending 
    ON project_join_requests(project_id, worker_id) 
    WHERE status = 'pending';

COMMIT;
