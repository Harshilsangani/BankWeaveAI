ALTER TABLE campaign_email_deliveries ADD COLUMN html_body TEXT;
ALTER TABLE campaign_email_deliveries ADD COLUMN presentation_version TEXT NOT NULL DEFAULT 'plain-v1';
