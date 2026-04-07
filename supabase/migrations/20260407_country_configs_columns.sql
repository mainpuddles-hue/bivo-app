-- Applied to production 2026-04-07
-- Fix: country_configs missing columns that code references

ALTER TABLE country_configs ADD COLUMN IF NOT EXISTS business_validation TEXT DEFAULT 'prh';
ALTER TABLE country_configs ADD COLUMN IF NOT EXISTS country_id TEXT;

UPDATE country_configs SET country_id = country_code WHERE country_id IS NULL;

INSERT INTO country_configs (country_code, country_id, name, supported, business_validation)
VALUES ('FI', 'FI', 'Finland', true, 'prh')
ON CONFLICT (country_code) DO UPDATE SET business_validation = 'prh', country_id = 'FI', supported = true;
