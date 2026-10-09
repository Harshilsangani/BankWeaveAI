CREATE TABLE cashflow_opening_balances(dataset TEXT,customer_id TEXT,as_of TEXT,amount_minor INTEGER,source TEXT,PRIMARY KEY(dataset,customer_id));
CREATE TABLE cashflow_events(dataset TEXT,id TEXT,customer_id TEXT,account_id TEXT,occurred_on TEXT,direction TEXT,category TEXT,amount_minor INTEGER,transaction_id TEXT,source TEXT,PRIMARY KEY(dataset,id));
CREATE INDEX cashflow_customer ON cashflow_events(dataset,customer_id,occurred_on);
