"""Research briefs: scope, database series, chart choice, and a PDF export.

Chart points are calculated here. A model may only choose a series that was
calculated and a chart kind allowed for that series.
"""
import re

import fitz

from .analytics import aggregate, analysis_metadata, build, condition, identifier, metadata, now, period_label, resolve, sanitize
from .database import connect
from .providers import ResearchChartChoice, ResearchChartPlan

SERIES_CATALOG = (
    dict(id='trend', datasets=('meridian', 'bankshield'), label='Monthly flagged or labelled transaction counts'),
    dict(id='geography', datasets=('meridian', 'bankshield'), label='Flagged counts by region or country'),
    dict(id='channel', datasets=('meridian', 'bankshield'), label='Flagged counts by channel'),
    dict(id='merchant', datasets=('meridian', 'bankshield'), label='Flagged counts by merchant category'),
    dict(id='loan_trend', datasets=('meridian',), label='Monthly loan default markers'),
    dict(id='loan_type', datasets=('meridian',), label='Default markers by loan type'),
)
DEFAULT_KIND = dict(trend='area', loan_trend='area', geography='bar', merchant='column', channel='donut', loan_type='donut')
ALLOWED_KIND = {key: {'area', 'column'} if key in ('trend', 'loan_trend') else {'donut', 'column'} if key in ('channel', 'loan_type') else {'bar', 'column'} for key in DEFAULT_KIND}
RESEARCH_WORDS = re.compile(r'\bresearch\b|\bbriefing\b|\bdeep[\s-]?dive\b|\blandscape\b|\bcomprehensive (?:analysis|review|brief)\b', re.I)


def is_research_question(query):
    return bool(RESEARCH_WORDS.search(query or ''))


def catalog_for(dataset_id):
    return [dict(id=item['id'], label=item['label']) for item in SERIES_CATALOG if dataset_id in item['datasets']]


def _points(rows, value='affected'):
    return [dict(name=str(row['name']), value=int(row[value] or 0)) for row in rows if row['name']]


def _grouped(scope, column):
    sql, args = condition(scope)
    with connect() as db:
        rows = db.execute(
            f'SELECT {column} name, COUNT(*) total, COALESCE(SUM(flagged),0) affected FROM transactions WHERE {sql} GROUP BY {column} ORDER BY affected DESC, {column} LIMIT 8',
            args,
        ).fetchall()
    return rows


def collect_series(scope, requested, focus='fraud'):
    import calendar
    meta = metadata(scope['datasetId'])
    allowed = {item['id'] for item in catalog_for(meta['id'])}
    chosen = [item for item in requested if item in allowed]
    series = []
    fraud = {**scope, 'domain': 'fraud'}
    if meta['id'] == 'meridian':
        fraud['riskId'] = 'RSK-001'
    loan_scope = {key: value for key, value in scope.items() if key != 'newDeviceOnly'}
    loan_scope.update(domain='loans', riskId='RSK-002')
    use_loans = focus == 'loans' and meta['id'] == 'meridian'
    window = meta['periods'] if scope['period'] == 'all' else [item for item in meta['periods'] if item <= scope['period']][-6:]
    if 'trend' in chosen and not use_loans:
        points = [dict(name=period_label(item) if meta['id'] != 'meridian' else calendar.month_abbr[int(item[-2:])], value=aggregate(fraud, item)['affected']) for item in window]
        series.append(dict(id='trend', title='Flagged transaction trend' if meta['id'] == 'meridian' else 'Synthetic fraud-label trend', subtitle=f'Historical monthly count · {meta["name"]}', points=points))
    if 'geography' in chosen and not use_loans:
        data = build(fraud)
        series.append(dict(id='geography', title='Regional risk distribution' if meta['id'] == 'meridian' else 'Country distribution', subtitle=f'{period_label(scope["period"])} · flagged count', points=data['regions'][:8], segments=data['segments'], findings=data['findings'], summary=data['summary'], metrics=data['metrics'], evidence=data['evidence']))
    if 'channel' in chosen:
        rows = _grouped(fraud, 'channel')
        value = 'affected' if sum(row['affected'] or 0 for row in rows) else 'total'
        series.append(dict(id='channel', title='Channel mix', subtitle='Flagged count' if value == 'affected' else 'Transaction count · no flagged rows in scope', points=_points(rows, value)))
    if 'merchant' in chosen:
        rows = _grouped(fraud, 'merchant')
        value = 'affected' if sum(row['affected'] or 0 for row in rows) else 'total'
        series.append(dict(id='merchant', title='Merchant categories', subtitle='Flagged count' if value == 'affected' else 'Transaction count · no flagged rows in scope', points=_points(rows, value)))
    if meta['id'] == 'meridian' and (use_loans or ({'loan_trend', 'loan_type'} & set(chosen))):
        loan = build(loan_scope)
        if use_loans and 'geography' in chosen:
            series.append(dict(id='geography', title='Loan defaults by region', subtitle=f'{period_label(scope["period"])} · default markers', points=loan['regions'][:8], segments=loan['segments'], findings=loan['findings'], summary=loan['summary'], metrics=loan['metrics'], evidence=loan['evidence']))
        if 'loan_trend' in chosen:
            series.append(dict(id='loan_trend', title='Loan default trend', subtitle=f'{period_label(scope["period"])} · default markers', points=loan['trend'], loanSummary=loan['summary'], loanMetrics=loan['metrics'], loanFindings=loan['findings']))
        if 'loan_type' in chosen:
            months = [calendar.month_abbr[int(item[-2:])] for item in (meta['periods'] if scope['period'] == 'all' else [scope['period']])]
            marks = ','.join('?' for _ in months)
            from .loans import JOINS, condition as loan_condition
            sql, args = loan_condition(loan_scope)
            with connect() as db:
                rows = db.execute(
                    f'''SELECT l.loan_type name, COUNT(*) affected FROM loans l {JOINS}
                        WHERE {sql} AND EXISTS (SELECT 1 FROM json_each(l.default_months) WHERE value IN ({marks}))
                        GROUP BY l.loan_type ORDER BY affected DESC, l.loan_type LIMIT 8''',
                    [*args, *months],
                ).fetchall()
            series.append(dict(id='loan_type', title='Defaults by loan type', subtitle='Loans with a default marker', points=_points(rows)))
    return [item for item in series if item['points']]


def narrative_source(scope, focus, series):
    geography = next((item for item in series if item['id'] == 'geography'), None)
    loans = next((item for item in series if item['id'] == 'loan_trend'), None)
    if focus == 'loans' and loans:
        summary, findings, metrics = loans['loanSummary'], loans['loanFindings'], loans['loanMetrics']
        segments = None
        evidence = []
    elif geography:
        summary, findings, metrics = geography['summary'], geography['findings'], geography['metrics']
        segments, evidence = geography.get('segments'), geography.get('evidence') or []
    else:
        data = build({**scope, 'domain': 'fraud', 'riskId': 'BS-001' if scope['datasetId'] == 'bankshield' else 'RSK-001'})
        summary, findings, metrics, segments, evidence = data['summary'], data['findings'], data['metrics'], data['segments'], data['evidence']
    if focus == 'portfolio' and loans:
        findings = [*findings, loans['loanSummary']]
    facts = {'summary': summary, **{f'finding-{index + 1}': value for index, value in enumerate(findings)}}
    return facts, metrics, segments, evidence


def apply_plan(facts, series, plan):
    available = {item['id']: item for item in series}
    selected = []
    for chart in plan.charts:
        item = available.get(chart.series)
        if item and chart.series not in {picked['id'] for picked in selected} and chart.kind in ALLOWED_KIND[chart.series]:
            selected.append({**item, 'kind': chart.kind})
    if not selected:
        selected = [{**item, 'kind': DEFAULT_KIND[item['id']]} for item in series[:4]]
    text = plan.text
    placeholders = re.findall(r'\{([^{}]+)\}', text)
    prose = re.sub(r'\{[^{}]+\}', '', text)
    invalid = not text.startswith('{summary}') or not placeholders or set(placeholders) - facts.keys() or re.search(r'[\d{}]', prose)
    if invalid:
        text = facts['summary']
    else:
        text = re.sub(r'\{([^{}]+)\}', lambda match: facts[match[1]], text)
    return text, selected


def local_plan(facts, series):
    return ResearchChartPlan(
        text='{summary}',
        charts=[ResearchChartChoice(series=item['id'], kind=DEFAULT_KIND[item['id']]) for item in series[:4]],
    )


def answer(query, scope):
    from .progress import emit
    from .providers import get_provider
    scope = resolve(query, scope)
    scope.pop('research', None)
    meta = metadata(scope['datasetId'])
    catalog = catalog_for(meta['id'])
    provider = get_provider()
    try:
        decision = provider.scope_research(sanitize(query), catalog)
        requested = [item for item in decision.series if item in {row['id'] for row in catalog}]
        focus = decision.focus if not (decision.focus != 'fraud' and meta['id'] != 'meridian') else 'fraud'
        brief = decision.brief if not re.search(r'\d', decision.brief) else ''
    except ValueError:
        requested = [item['id'] for item in catalog if item['id'] in ('trend', 'geography', 'channel', 'merchant')]
        focus, brief = 'fraud', ''
    if not requested:
        requested = [item['id'] for item in catalog[:4]]
    emit('Research scope agent')
    emit('SQL research agent', 'running')
    series = collect_series(scope, requested, focus)
    emit('SQL research agent')
    if not series:
        response = dict(id=identifier('MSG'), question=sanitize(query), context=scope, timestamp=now(), title='Research brief', research=True,
                        blocks=[dict(type='TEXT', text=f'{meta["name"]} has no records for this research scope. Broaden the month or region and ask again.')],
                        suggestions=['Show suspicious transactions'])
        response['analysis'] = analysis_metadata(scope, response['id'])
        return response
    facts, metrics, segments, evidence = narrative_source(scope, focus, series)
    emit('Research chart agent', 'running')
    try:
        plan = provider.plan_research(sanitize(query), scope, facts, series)
    except ValueError:
        plan = local_plan(facts, series)
    text, charts = apply_plan(facts, series, plan)
    emit('Research chart agent')
    blocks = []
    if brief:
        blocks.append(dict(type='TEXT', text=brief))
    blocks.append(dict(type='TEXT', text=text))
    if metrics:
        blocks.append(dict(type='KPI', metrics=metrics))
    for chart in charts:
        blocks.append(dict(type='CHART', title=chart['title'], subtitle=chart['subtitle'], kind=chart['kind'], tone='research', points=chart['points']))
    if segments:
        blocks.append(dict(type='TABLE', title='Research breakdown', data=segments))
    for index, finding in enumerate(value for key, value in facts.items() if str(key).startswith('finding-')):
        blocks.append(dict(type='INSIGHT', title='Research note' if index == 0 else 'Contribution to the change', text=finding))
    if evidence:
        blocks.append(dict(type='EVIDENCE', evidence=evidence[:2]))
    blocks.append(dict(type='TEXT', text='Figures and chart points are database calculations for the selected historical scope. Exposure is flagged value or a principal proxy, not confirmed loss. Export PDF on this answer downloads the same brief.'))
    if meta['id'] != 'meridian' and focus != 'fraud':
        blocks.insert(0, dict(type='TEXT', text='BankShield has no loan tables. This brief uses its available transaction evidence.'))
    response = dict(id=identifier('MSG'), question=sanitize(query), context=scope, timestamp=now(), title='Research brief', research=True, blocks=blocks,
                    suggestions=['Only Ahmedabad', 'Compare it to Surat', 'Show affected transactions'] if meta['id'] == 'meridian' else ['Only United States', 'Compare it to Germany', 'Show merchant categories'])
    response['analysis'] = analysis_metadata(scope, response['id'])
    return response


INK = (0.12, 0.14, 0.18)
MUTED = (0.35, 0.39, 0.45)
LINE = (0.86, 0.88, 0.91)
BLUE = (0.10, 0.45, 0.82)
PALETTE = (BLUE, (0.07, 0.62, 0.58), (0.92, 0.62, 0.05), (0.55, 0.32, 0.78), (0.85, 0.40, 0.12), (0.20, 0.55, 0.35))


class _Pdf:
    def __init__(self):
        self.doc = fitz.open()
        self.page = None
        self.y = 0
        self._page()

    def _page(self):
        self.page = self.doc.new_page(width=595, height=842)
        self.page.draw_rect(fitz.Rect(0, 0, 595, 8), color=None, fill=BLUE)
        self.y = 36

    def gap(self, height):
        if self.y + height > 800:
            self._page()

    def text(self, value, size=11, color=INK, gap=8):
        value = re.sub(r'\s+', ' ', str(value)).strip()
        if not value:
            return
        lines = max(1, -(-len(value) // 88))
        height = int(size * 1.45 * lines) + 6
        self.gap(height)
        self.page.insert_textbox(fitz.Rect(40, self.y, 555, self.y + height), value, fontsize=size, fontname='helv', color=color, align=fitz.TEXT_ALIGN_LEFT)
        self.y += height + gap

    def finish(self):
        data = self.doc.tobytes()
        self.doc.close()
        return data


def _chart(pdf, chart):
    points = chart['points'][:8]
    if not points:
        return
    pdf.gap(190)
    pdf.text(chart['title'], size=13, gap=1)
    pdf.text(chart['subtitle'], size=9, color=MUTED, gap=6)
    top, left, width, height = pdf.y, 48, 500, 132
    pdf.page.draw_rect(fitz.Rect(40, top - 4, 555, top + height + 8), color=LINE, fill=(0.97, 0.98, 0.99), width=0.6)
    peak = max(point['value'] for point in points) or 1
    kind = chart['kind']
    if kind == 'donut':
        _donut(pdf.page, points, left + 70, top + 66)
    elif kind == 'bar':
        _bars(pdf.page, points, left, top, width - 20, height, peak, horizontal=True)
    elif kind == 'column':
        _bars(pdf.page, points, left, top, width - 20, height, peak, horizontal=False)
    else:
        _area(pdf.page, points, left + 8, top + 8, width - 36, height - 24, peak)
    pdf.y = top + height + 22


def _area(page, points, left, top, width, height, peak):
    count = len(points)
    step = width / max(count - 1, 1)
    coords = [(left + index * step, top + height - (point['value'] / peak) * height) for index, point in enumerate(points)]
    shape = page.new_shape()
    shape.draw_polyline([fitz.Point(coords[0][0], top + height), *[fitz.Point(*item) for item in coords], fitz.Point(coords[-1][0], top + height)])
    shape.finish(color=None, fill=BLUE, fill_opacity=0.16, closePath=True)
    shape.draw_polyline([fitz.Point(*item) for item in coords])
    shape.finish(color=BLUE, width=1.8)
    shape.commit()
    page.insert_text(fitz.Point(coords[0][0], top + height + 12), points[0]['name'][:12], fontsize=8, fontname='helv', color=MUTED)
    if count > 1:
        page.insert_text(fitz.Point(coords[-1][0] - 28, top + height + 12), points[-1]['name'][:12], fontsize=8, fontname='helv', color=MUTED)


def _bars(page, points, left, top, width, height, peak, horizontal):
    count = len(points)
    if horizontal:
        band = height / count
        for index, point in enumerate(points):
            length = max(2, (point['value'] / peak) * (width - 110))
            y = top + index * band + 4
            page.draw_rect(fitz.Rect(left + 92, y, left + 92 + length, y + band * 0.62), color=None, fill=PALETTE[index % len(PALETTE)])
            page.insert_text(fitz.Point(left, y + 9), str(point['name'])[:14], fontsize=8, fontname='helv', color=INK)
    else:
        band = width / count
        for index, point in enumerate(points):
            bar = max(2, (point['value'] / peak) * (height - 18))
            x = left + index * band + band * 0.22
            page.draw_rect(fitz.Rect(x, top + height - 16 - bar, x + band * 0.5, top + height - 16), color=None, fill=PALETTE[index % len(PALETTE)])
            page.insert_text(fitz.Point(x, top + height - 4), str(point['name'])[:8], fontsize=7, fontname='helv', color=MUTED)


def _donut(page, points, cx, cy):
    import math
    total = sum(point['value'] for point in points) or 1
    radius, angle = 46, -90
    shape = page.new_shape()
    for index, point in enumerate(points):
        sweep = 360 * point['value'] / total
        if sweep <= 0:
            continue
        start = fitz.Point(cx + radius * math.cos(math.radians(angle)), cy + radius * math.sin(math.radians(angle)))
        shape.draw_sector(fitz.Point(cx, cy), start, sweep, fullSector=True)
        shape.finish(color=None, fill=PALETTE[index % len(PALETTE)], closePath=True)
        angle += sweep
    shape.commit()
    page.draw_circle(fitz.Point(cx, cy), 27, color=None, fill=(0.97, 0.98, 0.99))
    for index, point in enumerate(points[:6]):
        page.draw_rect(fitz.Rect(cx + 70, cy - 40 + index * 14, cx + 80, cy - 32 + index * 14), color=None, fill=PALETTE[index % len(PALETTE)])
        page.insert_text(fitz.Point(cx + 86, cy - 30 + index * 14), f"{str(point['name'])[:16]}  {point['value']}", fontsize=8, fontname='helv', color=INK)


def render_pdf(response):
    pdf = _Pdf()
    pdf.text('BANKWEAVE AI  ·  RESEARCH BRIEF  ·  SYNTHETIC HISTORICAL DATA', size=8, color=BLUE, gap=6)
    pdf.text(response.get('title') or 'Research brief', size=20, gap=2)
    analysis = response.get('analysis') or {}
    pdf.text(' · '.join(filter(None, [response.get('id'), analysis.get('datasetName'), analysis.get('period'), analysis.get('currency')])), size=9, color=MUTED, gap=8)
    pdf.text(response.get('question') or '', size=11, gap=10)
    for block in response.get('blocks') or []:
        kind = block.get('type')
        if kind == 'TEXT':
            pdf.text(block.get('text') or '')
        elif kind == 'KPI':
            for metric in block.get('metrics') or []:
                pdf.text(f"{metric.get('label')}: {metric.get('value')} ({metric.get('change')})", size=11)
        elif kind == 'CHART':
            _chart(pdf, block)
        elif kind == 'TABLE':
            data = block.get('data') or {}
            pdf.text(block.get('title') or 'Table', size=13, gap=3)
            columns = data.get('columns') or []
            pdf.text(' | '.join(str(column) for column in columns), size=8, color=MUTED, gap=2)
            for row in (data.get('rows') or [])[:8]:
                pdf.text(' | '.join(str(cell) for cell in row), size=8, gap=2)
        elif kind == 'INSIGHT':
            pdf.text(block.get('title') or 'Note', size=12, gap=2)
            pdf.text(block.get('text') or '', size=10)
    pdf.text('Historical synthetic observations. Human review is required. No payment, account opening, or KYC decision was made.', size=8, color=MUTED, gap=0)
    return pdf.finish()


def load_brief(message_id):
    import json
    from .security import require
    from .sessions import artifact_access
    require('read')
    if not re.fullmatch(r'MSG-[a-f0-9]{12}', message_id or ''):
        raise ValueError('Select a saved research answer.')
    artifact_access(message_id)
    with connect() as db:
        row = db.execute("SELECT payload FROM artifacts WHERE id=? AND kind='analyst'", (message_id,)).fetchone()
    if not row:
        raise ValueError('Saved research answer not found.')
    payload = json.loads(row['payload'])
    if not payload.get('research'):
        raise ValueError('This answer is not a research brief. Ask a research question or turn on Research mode.')
    return payload
