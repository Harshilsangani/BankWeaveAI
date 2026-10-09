"""Immutable HTML generated from canonical saved artifacts, never browser facts."""
import hashlib,json
from html import escape
from fastapi import APIRouter
from fastapi.responses import Response
from .database import connect
from .analytics import now,identifier,currency
from .sessions import artifact_access
from .security import actor
router=APIRouter()

REPORT_STYLES = '''
body{font:15px/1.7 "Segoe UI",system-ui,sans-serif;color:#1f1f1f;background:#fff;max-width:900px;margin:40px auto;padding:30px;overflow-wrap:anywhere}h1{font-size:32px;font-weight:550;line-height:1.25;letter-spacing:-.7px}h2{border-bottom:1px solid #e0e3e7;padding-bottom:10px;font-size:20px;font-weight:550;margin-top:32px}h3{font-size:16px}.label{color:#0b57d0;letter-spacing:1.5px;font-size:12px}small{color:#525963}.metrics{display:flex;flex-wrap:wrap;gap:24px;padding:24px;background:#f0f4f9;border-radius:20px}.metrics div{flex:1;min-width:160px;color:#525963}.metrics b{display:block;font-size:26px;font-weight:550;color:#0b57d0}li{margin:8px 0}pre{white-space:pre-wrap;background:#f0f4f9;border-radius:16px;padding:20px;font-size:13px}footer{border-top:1px solid #e0e3e7;margin-top:32px;padding-top:20px}@media(max-width:600px){body{margin:0;padding:24px}h1{font-size:26px}.metrics{gap:16px}}@media print{body{margin:0;padding:0}.metrics{break-inside:avoid}h2{break-after:avoid}}
'''

def render(report):
    inv=report['investigation'];meta=inv['analysis']
    def text(value):return escape(str(value),quote=True)
    def listing(values):return '<ul>'+''.join('<li>'+text(value)+'</li>' for value in values)+'</ul>'
    def amount(value):return text(currency(value,meta['currency']))
    parts=[f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>{text(report['title'])}</title><style>{REPORT_STYLES}</style></head><body>",
      '<small>BANKWEAVE AI / INVESTIGATION REPORT · SYNTHETIC DATA</small>',f"<h1>{text(report['title'])}</h1><small>{text(report['id'])} · {text(report['createdAt'])}</small>",
      '<h2>Executive summary</h2><p>'+text(inv['risk']['summary'])+'</p>',
      '<div class="metrics">'+''.join('<div>'+text(m['label'])+'<b>'+text(m['value'])+'</b></div>' for m in inv['metrics'])+'</div>',
      '<h2>Risk assessment</h2><p>'+text(inv['risk']['title'])+f" · {text(inv['risk']['severity'])} · {inv['risk']['affectedRecords']} records · Original/flagged value {amount(inv['risk']['estimatedExposure'])}. This is not confirmed loss or a credit decision.</p>",
      '<h2>Key findings</h2>'+listing(inv['findings']),'<h2>Supporting evidence & data references</h2>']
    for evidence in inv['evidence']:
        parts.append('<h3>'+text(evidence['title'])+'</h3><small>'+text(evidence['id'])+' · '+text(evidence['source'])+'</small><p>'+text(evidence['detail'])+'</p>'+listing(evidence['records']))
    parts.append('<h2>Recommended actions</h2>'+listing(inv['actions']))
    if report.get('scenario'):
        scenario=report['scenario'];parts.append('<h2>Scenario analysis — illustrative estimate</h2><p>Current '+amount(scenario['baseline'])+'; modeled '+amount(scenario['projected'])+'; reduction '+amount(scenario['reduction'])+'</p>'+listing(scenario['assumptions']))
    parts+=['<h2>Scope & limitations</h2><pre>'+text(json.dumps(inv['scope'],sort_keys=True,indent=2))+'</pre>',
      '<p>'+text(meta['datasetName'])+' · '+text(meta['period'])+' · Baseline '+text(meta['baseline'])+' · '+text(meta['currency'])+'</p>',
      '<p>Source version '+text(meta['datasetVersion'])+' · Analysis run '+text(meta['runId'])+'</p>',listing(meta['limitations']),'<p>Historical synthetic observations. Human review is required. No banking control was executed.</p></body></html>']
    return ''.join(parts)

def save(db,report):
    html=render(report);digest=hashlib.sha256(html.encode()).hexdigest()
    db.execute('INSERT OR IGNORE INTO report_files VALUES(?,?,?,?)',(report['id'],html,digest,now()))

@router.get('/reports/{report_id}/download')
def download(report_id:str):
    artifact_access(report_id)
    with connect() as db:
        artifact=db.execute("SELECT payload FROM artifacts WHERE id=? AND kind='report'",(report_id,)).fetchone()
        if not artifact:raise ValueError('Saved report not found.')
        save(db,json.loads(artifact[0]))
        file=db.execute('SELECT * FROM report_files WHERE report_id=?',(report_id,)).fetchone()
        db.execute('INSERT INTO report_downloads VALUES(?,?,?,?,?)',(identifier('DOWNLOAD'),report_id,actor().actor_id,file['sha256'],now()))
    return Response(file['html'],media_type='text/html',headers={'Content-Disposition':f'attachment; filename="{report_id}-bankweave.html"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'",'ETag':f'"{file["sha256"]}"'})
