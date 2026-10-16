CREATE TABLE campaign_input_batches (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, dataset TEXT NOT NULL,
    generator_version TEXT NOT NULL, seed INTEGER NOT NULL,
    cutoff TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
    cohort_size INTEGER NOT NULL CHECK(cohort_size BETWEEN 1 AND 10000),
    manifest TEXT NOT NULL, manifest_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('ready','invalid')), created_at TEXT NOT NULL
);
CREATE INDEX campaign_batch_scope ON campaign_input_batches(tenant,dataset,cutoff,status);
CREATE TABLE campaign_spending_observations (
    batch_id TEXT NOT NULL REFERENCES campaign_input_batches(id), id TEXT NOT NULL,
    dataset TEXT NOT NULL, customer_id TEXT NOT NULL, account_id TEXT NOT NULL,
    occurred_on TEXT NOT NULL, available_on TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('inflow','outflow')),
    category TEXT NOT NULL, channel TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0), currency TEXT NOT NULL CHECK(currency='INR'),
    source TEXT NOT NULL, PRIMARY KEY(batch_id,id),
    FOREIGN KEY(dataset,customer_id) REFERENCES customers(dataset,id),
    FOREIGN KEY(dataset,account_id) REFERENCES accounts(dataset,id)
);
CREATE INDEX campaign_observation_customer ON campaign_spending_observations(batch_id,customer_id,occurred_on);
CREATE TABLE campaign_credit_profiles (
    batch_id TEXT NOT NULL REFERENCES campaign_input_batches(id), dataset TEXT NOT NULL,
    customer_id TEXT NOT NULL, effective_on TEXT NOT NULL, available_on TEXT NOT NULL,
    score INTEGER CHECK(score IS NULL OR score BETWEEN 300 AND 900),
    monthly_obligation_minor INTEGER CHECK(monthly_obligation_minor IS NULL OR monthly_obligation_minor>=0),
    obligations_complete INTEGER NOT NULL CHECK(obligations_complete IN (0,1)),
    holdings_complete INTEGER NOT NULL CHECK(holdings_complete IN (0,1)),
    collateral_minor INTEGER NOT NULL CHECK(collateral_minor>=0),
    facts TEXT NOT NULL, source_hash TEXT NOT NULL,
    PRIMARY KEY(batch_id,customer_id), FOREIGN KEY(dataset,customer_id) REFERENCES customers(dataset,id)
);
CREATE TABLE card_product_versions (
    product_id TEXT NOT NULL, version TEXT NOT NULL, tenant TEXT NOT NULL,
    name TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('travel','cashback','entry')),
    effective_on TEXT NOT NULL, expires_on TEXT, catalog TEXT NOT NULL,
    rules TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','retired')),
    content_hash TEXT NOT NULL, PRIMARY KEY(product_id,version)
);
CREATE TABLE customer_card_holdings (
    batch_id TEXT NOT NULL REFERENCES campaign_input_batches(id), dataset TEXT NOT NULL,
    customer_id TEXT NOT NULL, product_id TEXT NOT NULL, effective_on TEXT NOT NULL,
    available_on TEXT NOT NULL, ended_on TEXT, source TEXT NOT NULL,
    PRIMARY KEY(batch_id,customer_id,product_id), FOREIGN KEY(dataset,customer_id) REFERENCES customers(dataset,id)
);
CREATE TABLE marketing_consent_events (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, dataset TEXT NOT NULL, customer_id TEXT NOT NULL,
    batch_id TEXT REFERENCES campaign_input_batches(id), channel TEXT NOT NULL CHECK(channel='email'),
    purpose TEXT NOT NULL CHECK(purpose='credit_card_offers'),
    action TEXT NOT NULL CHECK(action IN ('granted','withdrawn','suppressed')),
    effective_on TEXT NOT NULL, available_on TEXT NOT NULL,
    source TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY(dataset,customer_id) REFERENCES customers(dataset,id)
);
CREATE INDEX campaign_consent_customer ON marketing_consent_events(tenant,dataset,customer_id,effective_on,created_at);
