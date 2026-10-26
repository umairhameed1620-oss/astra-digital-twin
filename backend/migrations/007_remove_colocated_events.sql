-- Migration: 007_remove_colocated_events
-- Earlier screenings reported objects attached to the twin (e.g. other ISS modules) as zero-distance
-- "critical" events every minute. Screening now skips co-located objects; remove the stored false events.
DELETE FROM conjunction_events
 WHERE source = 'screening' AND miss_km < 0.05 AND COALESCE(rel_speed_kms, 0) < 0.01;
