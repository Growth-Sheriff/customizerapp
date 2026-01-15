-- Migration: Force all shops to use local storage
-- Date: 2025-01-XX
-- Description: Remove all cloud storage options (R2/S3/Shopify Files)
--              All shops now use local server storage only

-- Update all shops to use local storage
UPDATE shops 
SET storage_provider = 'local'
WHERE storage_provider != 'local' OR storage_provider IS NULL;

-- Clear cloud storage configuration (keep JSON structure but mark as deprecated)
-- This preserves any data for potential rollback but prevents usage
UPDATE shops
SET storage_config_json = '{"_deprecated": true, "_migratedAt": "' || NOW() || '"}'::jsonb
WHERE storage_config_json IS NOT NULL 
  AND storage_config_json != '{}'::jsonb
  AND storage_config_json->>'_deprecated' IS NULL;

-- Verify migration
DO $$
DECLARE
  non_local_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO non_local_count 
  FROM shops 
  WHERE storage_provider != 'local';
  
  IF non_local_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % shops still not using local storage', non_local_count;
  END IF;
  
  RAISE NOTICE 'Migration successful: All shops now use local storage';
END $$;
