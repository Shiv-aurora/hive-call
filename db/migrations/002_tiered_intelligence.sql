CREATE TABLE IF NOT EXISTS company_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  external_id STRING NOT NULL,
  kind STRING NOT NULL CHECK (kind IN ('product','plan','billing_rule','refund_policy','promotion_policy','procedure','documentation')),
  title STRING NOT NULL,
  content STRING NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  policy_version_id UUID REFERENCES policy_versions(id),
  embedding VECTOR(1024) NOT NULL,
  active BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS model_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id),
  role STRING NOT NULL CHECK (role IN ('tier1_conversation','tier2_reasoning','skill_compiler')),
  provider STRING NOT NULL,
  model_id STRING NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  request_id STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_telemetry (
  call_id UUID PRIMARY KEY REFERENCES calls(id),
  tier1_model_calls INT NOT NULL DEFAULT 0,
  tier2_model_calls INT NOT NULL DEFAULT 0,
  skill_compiler_calls INT NOT NULL DEFAULT 0,
  embedding_requests INT NOT NULL DEFAULT 0,
  polly_characters INT NOT NULL DEFAULT 0,
  context_retrieval_count INT NOT NULL DEFAULT 0,
  overall_latency_ms INT NOT NULL DEFAULT 0,
  tier1_latency_ms INT NOT NULL DEFAULT 0,
  tier2_latency_ms INT NOT NULL DEFAULT 0,
  human_escalation BOOL NOT NULL DEFAULT false,
  reasoning_escalation_avoided BOOL NOT NULL DEFAULT false,
  skill_version_id UUID REFERENCES skill_versions(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  route_key STRING NOT NULL,
  client_hash STRING NOT NULL,
  window_start INT8 NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (route_key, client_hash, window_start)
);

CREATE TABLE IF NOT EXISTS guided_demo_replays (
  case_id STRING PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_context_by_kind ON company_context (tenant_id, kind, active);
CREATE INDEX IF NOT EXISTS model_invocations_by_run ON model_invocations (agent_run_id, role, created_at);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limit_windows (expires_at);
CREATE VECTOR INDEX IF NOT EXISTS company_context_embedding_idx ON company_context (tenant_id, embedding vector_cosine_ops);
