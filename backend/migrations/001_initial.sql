CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS customers(dataset TEXT, id TEXT, PRIMARY KEY(dataset,id));
        CREATE TABLE IF NOT EXISTS accounts(dataset TEXT, id TEXT, customer_id TEXT, opened_on TEXT, PRIMARY KEY(dataset,id));
        CREATE TABLE IF NOT EXISTS customer_master(dataset TEXT,id TEXT,branch_id TEXT,branch_name TEXT,region TEXT,age_group TEXT,occupation TEXT,credit_score INTEGER,PRIMARY KEY(dataset,id));
        CREATE TABLE IF NOT EXISTS loans(dataset TEXT,id TEXT,customer_id TEXT,branch_id TEXT,loan_type TEXT,principal_minor INTEGER,default_months TEXT,PRIMARY KEY(dataset,id));
        CREATE INDEX IF NOT EXISTS account_customer ON accounts(dataset,customer_id);
        CREATE INDEX IF NOT EXISTS loan_customer ON loans(dataset,customer_id);
        CREATE TABLE IF NOT EXISTS transactions(
          dataset TEXT, id TEXT, account_id TEXT, occurred_at TEXT, period TEXT,
          amount_minor INTEGER NOT NULL, region TEXT, merchant TEXT, channel TEXT,
          device_id TEXT, new_device INTEGER, flagged INTEGER NOT NULL, score REAL,
          PRIMARY KEY(dataset,id));
        CREATE INDEX IF NOT EXISTS tx_scope ON transactions(dataset,period,region,flagged);
        CREATE INDEX IF NOT EXISTS tx_device ON transactions(dataset,device_id);
        CREATE INDEX IF NOT EXISTS tx_account ON transactions(dataset,account_id);
        CREATE TABLE IF NOT EXISTS fraud_alerts(dataset TEXT, id TEXT, transaction_id TEXT,
          detected_at TEXT, alert_type TEXT, status TEXT, score REAL, PRIMARY KEY(dataset,id));
        CREATE TABLE IF NOT EXISTS fraud_outcomes(dataset TEXT, transaction_id TEXT,
          outcome TEXT, available_at TEXT, label_source TEXT, PRIMARY KEY(dataset,transaction_id));
        CREATE TABLE IF NOT EXISTS devices(dataset TEXT,id TEXT,customer_id TEXT,
          first_seen TEXT,last_seen TEXT,PRIMARY KEY(dataset,id));
        CREATE TABLE IF NOT EXISTS device_events(dataset TEXT,transaction_id TEXT,device_id TEXT,
          occurred_at TEXT,PRIMARY KEY(dataset,transaction_id));
        CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,kind TEXT,payload TEXT,created_at TEXT);
        CREATE TABLE IF NOT EXISTS workspace_sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL,owner TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS session_artifacts(session_id TEXT,artifact_id TEXT,PRIMARY KEY(session_id,artifact_id));
        CREATE TABLE IF NOT EXISTS access_audit(id TEXT PRIMARY KEY,actor_id TEXT,role TEXT,method TEXT,resource TEXT,status INTEGER,created_at TEXT);
        CREATE TABLE IF NOT EXISTS audit_runs(id TEXT PRIMARY KEY,kind TEXT,scope TEXT,
          sanitized_query TEXT,created_at TEXT,result_hash TEXT);
        CREATE TABLE IF NOT EXISTS form_drafts(id TEXT PRIMARY KEY,filename TEXT,
          markdown TEXT,fields TEXT,created_at TEXT,status TEXT DEFAULT 'pending',customer_id TEXT);
        CREATE TABLE IF NOT EXISTS customer_profiles(id TEXT PRIMARY KEY,dataset TEXT,
          full_name TEXT,date_of_birth TEXT,email TEXT,phone TEXT,address TEXT,
          city TEXT,state TEXT,postal_code TEXT,status TEXT,source_draft_id TEXT UNIQUE,
          created_at TEXT);
