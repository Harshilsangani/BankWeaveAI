"""Read-only verification of the shared Meridian identities and product joins."""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.database import DB_PATH, STORAGE


def verify():
    fixture_bytes = (STORAGE / 'meridian.json').read_bytes()
    fixture = json.loads(fixture_bytes)
    fixture_hash = hashlib.sha256(fixture_bytes).hexdigest()
    db = sqlite3.connect(f'{DB_PATH.resolve().as_uri()}?mode=ro', uri=True)
    try:
        counts = {table: db.execute(f"SELECT COUNT(*) FROM {table} WHERE dataset='meridian'").fetchone()[0]
                  for table in ['customers', 'customer_master', 'customer_profiles', 'accounts', 'loans', 'transactions',
                                'loan_installments', 'loan_payments', 'insurance_policies', 'customer_preferences', 'cashflow_events',
                                'fraud_alerts', 'devices', 'device_events', 'cashflow_opening_balances']}
        checks = {}
        source = json.loads(db.execute("SELECT metadata FROM datasets WHERE id='meridian'").fetchone()[0])
        checks['source_fixture_version_mismatch'] = int(source.get('baseFixtureVersion',source['version']) != fixture_hash)
        for table in ['customers', 'accounts', 'loans', 'transactions']:
            expected = {row['id'] for row in fixture[table]}
            actual = {row[0] for row in db.execute(f"SELECT id FROM {table} WHERE dataset='meridian'")}
            checks[f'{table}:missing_original_ids'] = len(expected - actual)
        joins = [
            ('customer_master', 'customers', 'id'), ('customer_profiles', 'customers', 'id'),
            ('accounts', 'customers', 'customer_id'), ('loans', 'customers', 'customer_id'),
            ('transactions', 'accounts', 'account_id'), ('loan_installments', 'loans', 'loan_id'),
            ('loan_payments', 'loan_installments', 'installment_id'),
            ('insurance_policies', 'customers', 'customer_id'), ('customer_preferences', 'customers', 'customer_id'),
            ('cashflow_events', 'customers', 'customer_id'), ('cashflow_events', 'accounts', 'account_id'),
            ('cashflow_opening_balances', 'customers', 'customer_id'), ('fraud_alerts', 'transactions', 'transaction_id'),
            ('device_events', 'transactions', 'transaction_id'), ('device_events', 'devices', 'device_id'),
        ]
        for child, parent, key in joins:
            checks[f'{child}:{key}:missing_{parent}'] = db.execute(
                f"SELECT COUNT(*) FROM {child} c LEFT JOIN {parent} p ON p.dataset=c.dataset AND p.id=c.{key} WHERE c.dataset='meridian' AND p.id IS NULL"
            ).fetchone()[0]
        checks['loans:branch_mismatch'] = db.execute("SELECT COUNT(*) FROM loans l JOIN customer_master m ON m.dataset=l.dataset AND m.id=l.customer_id WHERE l.dataset='meridian' AND l.branch_id!=m.branch_id").fetchone()[0]
        checks['device_events:transaction_device_mismatch'] = db.execute("SELECT COUNT(*) FROM device_events e JOIN transactions t ON t.dataset=e.dataset AND t.id=e.transaction_id WHERE e.dataset='meridian' AND e.device_id IS NOT t.device_id").fetchone()[0]
        checks['installments:overpaid_principal'] = db.execute("SELECT COUNT(*) FROM loan_installments i WHERE i.dataset='meridian' AND i.principal_due_minor<(SELECT COALESCE(SUM(p.principal_paid_minor),0) FROM loan_payments p WHERE p.dataset=i.dataset AND p.installment_id=i.id)").fetchone()[0]
        original = sorted(row['id'] for row in fixture['customers'])
        return dict(passed=not any(checks.values()), checkedAt=datetime.now(timezone.utc).isoformat(),fixtureSha256=fixture_hash,counts=counts, checks=checks,
                    originalCustomerCount=len(original), originalCustomerIdsHash=hashlib.sha256(json.dumps(original).encode()).hexdigest(),
                    extraCustomerCount=counts['customers']-len(original),
                    boundary='Read-only Meridian verification. BankShield is separate and intentionally has incomplete source relationships. No names, contact details or document content are exported.')
    finally:
        db.close()


if __name__ == '__main__':
    result = verify()
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
