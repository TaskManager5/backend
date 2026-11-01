BEGIN;

CREATE TABLE IF NOT EXISTS team_join_requests (
    id           bigserial PRIMARY KEY,
    team_id      bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    worker_id    bigint NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    decided_at   timestamptz,
    decided_by   bigint REFERENCES workers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_team_join_requests_team ON team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_status ON team_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_worker ON team_join_requests(worker_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_join_requests_pending 
    ON team_join_requests(team_id, worker_id) 
    WHERE status = 'pending';

COMMIT;
