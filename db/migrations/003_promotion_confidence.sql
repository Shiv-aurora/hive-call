UPDATE skill_versions SET confidence=greatest(confidence,0.96) WHERE status='promoted';

UPDATE skill_versions SET status='degraded',row_version=row_version+1
WHERE id=(
  SELECT sv.id FROM skill_versions sv
  JOIN skills s ON s.id=sv.skill_id
  JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id
  JOIN calls c ON c.id=ssc.call_id
  WHERE s.skill_family='bundle_mixed_tender_refund' AND c.external_id='call_d'
  ORDER BY sv.version DESC LIMIT 1
) AND status='promoted';

UPDATE skill_versions SET status='promoted',confidence=greatest(confidence,0.96),superseded_by=NULL,row_version=row_version+1
WHERE id=(
  SELECT sv.id FROM skill_versions sv
  JOIN skills s ON s.id=sv.skill_id
  JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id
  JOIN calls c ON c.id=ssc.call_id
  WHERE s.skill_family='bundle_mixed_tender_refund' AND c.external_id='call_c_progressive_v1'
  ORDER BY sv.version DESC LIMIT 1
);

UPDATE skills SET active_version_id=(
  SELECT sv.id FROM skill_versions sv
  JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id
  JOIN calls c ON c.id=ssc.call_id
  WHERE sv.skill_id=skills.id AND c.external_id='call_c_progressive_v1'
  ORDER BY sv.version DESC LIMIT 1
)
WHERE skill_family='bundle_mixed_tender_refund'
  AND EXISTS (SELECT 1 FROM skill_versions sv JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id JOIN calls c ON c.id=ssc.call_id WHERE sv.skill_id=skills.id AND c.external_id='call_c_progressive_v1');

INSERT INTO demotion_events (skill_version_id,reason,evidence)
SELECT sv.id,'retrieval_confidence_persistence_bug','{"repair":"003_promotion_confidence.sql","fictionalDemo":true}'::JSONB
FROM skill_versions sv JOIN skills s ON s.id=sv.skill_id JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id JOIN calls c ON c.id=ssc.call_id
WHERE s.skill_family='bundle_mixed_tender_refund' AND c.external_id='call_d' AND sv.status='degraded'
  AND NOT EXISTS (SELECT 1 FROM demotion_events de WHERE de.skill_version_id=sv.id AND de.reason='retrieval_confidence_persistence_bug');

INSERT INTO audit_events (tenant_id,actor,action,object_type,object_id,detail)
SELECT s.tenant_id,'migration-003','repair_demo_lineage','skill_version',sv.id,'{"reason":"restored Call C as active learned source","fictionalDemo":true}'::JSONB
FROM skill_versions sv JOIN skills s ON s.id=sv.skill_id JOIN skill_source_cases ssc ON ssc.skill_version_id=sv.id JOIN calls c ON c.id=ssc.call_id
WHERE s.skill_family='bundle_mixed_tender_refund' AND c.external_id='call_c_progressive_v1' AND sv.status='promoted';
