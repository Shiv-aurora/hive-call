CREATE TYPE IF NOT EXISTS skill_status AS ENUM ('candidate','shadow','promoted','degraded','deprecated','rejected');
CREATE TYPE IF NOT EXISTS resolution_tier AS ENUM ('tier_1_skill','tier_2_reasoning','tier_3_human');

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug STRING UNIQUE NOT NULL, name STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), external_id STRING NOT NULL,
  name STRING NOT NULL, email STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), external_id STRING NOT NULL,
  definition JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), customer_id UUID NOT NULL REFERENCES customers(id),
  promotion_id UUID REFERENCES promotions(id), external_id STRING NOT NULL, snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), order_id UUID NOT NULL REFERENCES orders(id),
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, order_id)
);
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), order_id UUID NOT NULL REFERENCES orders(id),
  snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, order_id)
);
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), skill_family STRING NOT NULL, name STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, skill_family)
);
CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), policy_id UUID NOT NULL REFERENCES policies(id), version INT NOT NULL, external_id STRING NOT NULL,
  definition JSONB NOT NULL, active BOOL NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version), UNIQUE (policy_id, external_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), customer_id UUID REFERENCES customers(id),
  external_id STRING NOT NULL, normalized_problem STRING NOT NULL, case_embedding VECTOR(1024) NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ, UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS call_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_id UUID NOT NULL REFERENCES calls(id), role STRING NOT NULL CHECK (role IN ('customer','agent','human')),
  content STRING NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_id UUID NOT NULL REFERENCES calls(id), kind STRING NOT NULL, payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_id UUID NOT NULL REFERENCES calls(id), tier resolution_tier NOT NULL,
  provider STRING, model STRING, model_calls INT NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), agent_run_id UUID NOT NULL REFERENCES agent_runs(id), tool_name STRING NOT NULL,
  risk STRING NOT NULL, input JSONB NOT NULL, output JSONB, latency_ms INT, success BOOL NOT NULL DEFAULT false,
  idempotency_key STRING, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), call_id UUID NOT NULL REFERENCES calls(id),
  tier resolution_tier NOT NULL, summary STRING NOT NULL, evidence JSONB NOT NULL, finalized_at TIMESTAMPTZ,
  idempotency_key STRING NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS resolution_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), resolution_id UUID NOT NULL REFERENCES resolutions(id), outcome STRING NOT NULL,
  verified BOOL NOT NULL, oracle_evidence JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS human_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), call_id UUID NOT NULL REFERENCES calls(id), reason STRING NOT NULL,
  context JSONB NOT NULL, resolution_id UUID REFERENCES resolutions(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), skill_family STRING NOT NULL,
  active_version_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, skill_family)
);
CREATE TABLE IF NOT EXISTS skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_id UUID NOT NULL REFERENCES skills(id), version INT NOT NULL,
  status skill_status NOT NULL, definition JSONB NOT NULL, confidence DECIMAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), promoted_at TIMESTAMPTZ, superseded_by UUID REFERENCES skill_versions(id),
  row_version INT NOT NULL DEFAULT 1, UNIQUE (skill_id, version)
);
ALTER TABLE skills ADD CONSTRAINT IF NOT EXISTS fk_active_version FOREIGN KEY (active_version_id) REFERENCES skill_versions(id);
CREATE TABLE IF NOT EXISTS skill_embeddings (
  skill_version_id UUID PRIMARY KEY REFERENCES skill_versions(id), tenant_id UUID NOT NULL REFERENCES tenants(id),
  embedding VECTOR(1024) NOT NULL, retrieval_text STRING NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_source_cases (
  skill_version_id UUID NOT NULL REFERENCES skill_versions(id), call_id UUID NOT NULL REFERENCES calls(id),
  PRIMARY KEY (skill_version_id, call_id)
);
CREATE TABLE IF NOT EXISTS skill_policy_dependencies (
  skill_version_id UUID NOT NULL REFERENCES skill_versions(id), policy_version_id UUID NOT NULL REFERENCES policy_versions(id),
  PRIMARY KEY (skill_version_id, policy_version_id)
);
CREATE TABLE IF NOT EXISTS shadow_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), external_id STRING NOT NULL,
  skill_family STRING NOT NULL, input JSONB NOT NULL, oracle JSONB NOT NULL,
  split STRING NOT NULL CHECK (split IN ('discovery','shadow','held_out')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);
CREATE TABLE IF NOT EXISTS skill_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_version_id UUID NOT NULL REFERENCES skill_versions(id), total INT NOT NULL,
  passed INT NOT NULL, correctness DECIMAL NOT NULL, safety_rate DECIMAL NOT NULL, policy_violations INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS promotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_version_id UUID NOT NULL REFERENCES skill_versions(id),
  evaluation_id UUID NOT NULL REFERENCES skill_evaluations(id), actor STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), idempotency_key STRING NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS demotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), skill_version_id UUID NOT NULL REFERENCES skill_versions(id), reason STRING NOT NULL,
  evidence JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_memory_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
  source STRING NOT NULL CHECK (source IN ('sql','vector','managed_mcp')), query_redacted STRING NOT NULL,
  selected_ids UUID[] NOT NULL, latency_ms INT, evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id), actor STRING NOT NULL,
  action STRING NOT NULL, object_type STRING NOT NULL, object_id UUID, detail JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_by_tenant_time ON calls (tenant_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS skill_versions_by_status ON skill_versions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS shadow_cases_by_family_split ON shadow_cases (tenant_id, skill_family, split);
CREATE VECTOR INDEX IF NOT EXISTS skill_embedding_idx ON skill_embeddings (tenant_id, embedding vector_cosine_ops);
CREATE VECTOR INDEX IF NOT EXISTS call_embedding_idx ON calls (tenant_id, case_embedding vector_cosine_ops);
