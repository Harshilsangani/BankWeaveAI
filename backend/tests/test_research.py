import os
import tempfile
import unittest

os.environ['RISKLENS_CHECKPOINT_DB'] = os.path.join(tempfile.mkdtemp(prefix='bankweave-research-'), 'checkpoints.sqlite3')
os.environ['RISKLENS_PROVIDER'] = 'local'
os.environ['RISKLENS_DB'] = '/home/harshilsangani07/bankweave-state/storage/risklens.sqlite3'

from backend.agents import router
from backend.providers import LocalProvider, ResearchChartChoice, ResearchChartPlan, provider_override
from backend.research import answer, apply_plan, is_research_question, render_pdf


class ResearchModeTests(unittest.TestCase):
    def test_research_language_is_recognized_without_changing_ordinary_questions(self):
        self.assertTrue(is_research_question('Research the fraud increase'))
        self.assertTrue(is_research_question('Prepare a deep dive on loan defaults'))
        self.assertFalse(is_research_question('Why did fraud increase this month?'))
        self.assertEqual(LocalProvider().route('Research fraud by channel').agent, 'research_analyst')
        self.assertEqual(LocalProvider().route('Why did fraud increase this month?').agent, 'database_analyst')

    def test_router_uses_research_for_a_research_question_or_the_mode_flag(self):
        research = router(dict(operation='query', query='Write a research briefing on card fraud', scope=dict(datasetId='meridian', domain='fraud')))
        self.assertEqual(research['agent'], 'research_analyst')
        flagged = router(dict(operation='query', query='Why did fraud increase this month?', scope=dict(datasetId='meridian', domain='fraud', research=True)))
        self.assertEqual(flagged['agent'], 'research_analyst')
        ordinary = router(dict(operation='query', query='Why did fraud increase this month?', scope=dict(datasetId='meridian', domain='fraud')))
        self.assertEqual(ordinary['agent'], 'database_analyst')

    def test_chart_plan_cannot_invent_a_series(self):
        series = [dict(id='trend', title='Trend', subtitle='Count', points=[dict(name='Apr', value=10), dict(name='May', value=12)])]
        facts = {'summary': 'Flagged transactions: 10.'}
        plan = ResearchChartPlan(text='{summary}', charts=[ResearchChartChoice(series='merchant', kind='column')])
        text, charts = apply_plan(facts, series, plan)
        self.assertEqual(text, facts['summary'])
        self.assertEqual(charts[0]['id'], 'trend')
        self.assertEqual(charts[0]['kind'], 'area')
        self.assertEqual(charts[0]['points'][1]['value'], 12)

    def test_research_brief_uses_database_points_and_exports_pdf(self):
        token = provider_override.set(LocalProvider())
        try:
            result = answer('Research fraud across channels and regions', dict(datasetId='meridian', domain='fraud', period='2026-09'))
        finally:
            provider_override.reset(token)
        self.assertTrue(result['research'])
        self.assertNotIn('research', result['context'])
        charts = [block for block in result['blocks'] if block['type'] == 'CHART']
        self.assertGreaterEqual(len(charts), 2)
        self.assertTrue(all(block['tone'] == 'research' for block in charts))
        self.assertTrue(all(block['kind'] in ('area', 'bar', 'column', 'donut') for block in charts))
        self.assertTrue(any(point['value'] > 0 for block in charts for point in block['points']))
        document = render_pdf(result)
        self.assertTrue(document.startswith(b'%PDF'))
        import fitz
        opened = fitz.open(stream=document, filetype='pdf')
        self.assertIn('Research brief', ''.join(page.get_text() for page in opened))
        opened.close()
