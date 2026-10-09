CREATE TABLE loan_installments(dataset TEXT,id TEXT,loan_id TEXT,due_on TEXT,principal_due_minor INTEGER,source_version TEXT,PRIMARY KEY(dataset,id));
CREATE TABLE loan_payments(dataset TEXT,id TEXT,installment_id TEXT,paid_on TEXT,principal_paid_minor INTEGER,source TEXT,PRIMARY KEY(dataset,id));
CREATE INDEX installment_loan ON loan_installments(dataset,loan_id,due_on);
CREATE INDEX payment_installment ON loan_payments(dataset,installment_id,paid_on);
