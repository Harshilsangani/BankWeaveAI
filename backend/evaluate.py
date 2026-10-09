"""Deterministic local evaluations; no live Gemini score is implied."""
import json
import sqlite3
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient
from langgraph.checkpoint.sqlite import SqliteSaver
from . import database,agents
from .app import app
from .import_data import seed_meridian,seed_bankshield


def run_pack(client):
    cases=json.loads((Path(__file__).parent/'evaluations/questions.json').read_text(encoding='utf-8'))
    results=[]
    for case in cases:
        with database.connect() as db:
            before=db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]
        response=client.post('/analyst',json=dict(query=case['query'],context=case['context']))
        errors=[]
        if response.status_code != case.get('status',200): errors.append('Unexpected HTTP status')
        if response.status_code==200:
            payload=response.json()
            kpis=[b for b in payload['blocks'] if b['type']=='KPI']
            if case.get('count') and (not kpis or kpis[0]['metrics'][0]['value']!=case['count']): errors.append('Count does not match expected source snapshot')
            if case.get('noKpi') and kpis: errors.append('Unsupported request produced metrics')
            for field in ('region','comparison','period','domain'):
                if field in case and payload['context'].get(field)!=case[field]: errors.append('Incorrect context: '+field)
            if 'title' in case and payload['title']!=case['title']: errors.append('Wrong response kind')
            text=' '.join(b['text'] for b in payload['blocks'] if b['type']=='TEXT')
            for field in ('text','summary'):
                if field in case and case[field] not in text: errors.append('Missing expected explanation')
            if payload['analysis']['externalTransmission']: errors.append('Local pack transmitted externally')
        with database.connect() as db:
            if db.execute('SELECT COUNT(*) FROM customer_profiles').fetchone()[0]!=before: errors.append('Question changed customer records')
        results.append(dict(id=case['id'],passed=not errors,errors=errors))
    return results


def evaluate():
    from .providers import provider_override,LocalProvider
    provider_token=provider_override.set(LocalProvider())
    original,original_graph=database.DB_PATH,agents.graph
    with tempfile.TemporaryDirectory(prefix='risklens-evaluation-') as directory:
        connection=sqlite3.connect(Path(directory)/'checkpoints.sqlite3',check_same_thread=False)
        try:
            database.DB_PATH=Path(directory)/'bank.sqlite3'
            database.initialize(); seed_meridian(); seed_bankshield()
            versions={name:database.metadata(name)['version'] for name in ('meridian','bankshield')}
            agents.graph=agents._builder.compile(checkpointer=SqliteSaver(connection))
            with TestClient(app) as client: results=run_pack(client)
        finally:
            database.DB_PATH=original; agents.graph=original_graph; connection.close(); provider_override.reset(provider_token)
    return dict(provider='local',liveGeminiEvaluated=False,sourceVersions=versions,cases=results,passed=sum(r['passed'] for r in results),total=len(results))


if __name__=='__main__':
    from .analytics import now
    result={**evaluate(),'timestamp':now()}
    path=Path(__file__).parent.parent/'artifacts/evaluation/local-results.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(f"Local pack: {result['passed']}/{result['total']} passed. Live Gemini evaluated: false.")
    for case in result['cases']:
        if not case['passed']: print(case['id']+': '+', '.join(case['errors']))
    raise SystemExit(0 if result['passed']==result['total'] else 1)
