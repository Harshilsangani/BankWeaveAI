CREATE TABLE insurance_policies(dataset TEXT,id TEXT,customer_id TEXT,product TEXT,cover_minor INTEGER,premium_minor INTEGER,start_on TEXT,end_on TEXT,status TEXT,nominee_complete INTEGER,source_version TEXT,revision INTEGER DEFAULT 1,PRIMARY KEY(dataset,id));
CREATE INDEX insurance_customer ON insurance_policies(dataset,customer_id);
