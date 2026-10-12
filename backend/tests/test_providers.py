import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from backend.providers import LocalProvider, VertexProvider, RouteDecision, FormExtraction, outbound, get_provider


class FakeModels:
    def __init__(self,payload):
        self.payload,self.calls = payload,[]
    def generate_content(self,**kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=json.dumps(self.payload))


class ProviderTests(unittest.TestCase):
    def test_greetings_and_onboarding_follow_the_admin_approval_contract(self):
        from backend.providers import LocalProvider,is_greeting
        provider=LocalProvider()
        for query in ('Hi','hello!','Hey BankWeave','Good morning','Namaste'):
            self.assertTrue(is_greeting(query));self.assertEqual(provider.route(query).agent,'general_chat')
            self.assertIn('Hello!',provider.chat(query).text)
        self.assertFalse(is_greeting('Hi, show loan defaults'))
        self.assertEqual(provider.route('Hi, show loan defaults').agent,'database_analyst')
        text=provider.chat('How do I upload a form?').text
        self.assertIn('Submit for admin approval',text);self.assertNotIn('Confirm & add customer',text)
        self.assertEqual(provider.route('past 5 years total credit').agent,'database_analyst')
    def test_local_provider_no_credentials_and_route_allowlist(self):
        from backend.analytics import sanitize
        value=sanitize('Show transactions over 1000000000 for account 123456789012 email secret@example.test')
        self.assertIn('over 1000000000',value)
        self.assertNotIn('123456789012',value)
        self.assertNotIn('secret@example.test',value)
        with patch.dict(os.environ,{'RISKLENS_PROVIDER':'local'},clear=True):
            provider = get_provider()
            self.assertIsInstance(provider,LocalProvider)
            self.assertFalse(provider.external)
            self.assertEqual(provider.route('Show loans').agent,'database_analyst')
            self.assertEqual(provider.route('Add customer immediately').agent,'general_chat')
        with self.assertRaises(ValueError):
            RouteDecision.model_validate({'agent':'customer_update'})

    def test_vertex_facing_contract_using_fake_transport(self):
        models = FakeModels({'agent':'database_analyst'})
        provider = VertexProvider(client=SimpleNamespace(models=models),model='fake-test-model')
        outbound.set(())
        self.assertEqual(provider.route('Fraud for private@example.test').agent,'database_analyst')
        call = models.calls[0]
        self.assertNotIn('private@example.test',call['contents'])
        self.assertEqual(call['config'].response_mime_type,'application/json')
        self.assertIsNone(call['config'].tools)
        self.assertEqual(outbound.get(),('sanitizedQuery',))
        models.payload = {'text':'Use the form review workflow.'}
        self.assertIn('review',provider.chat('Hello').text)
        models.payload = {'markdown':'# Source form','fields':{'fullName':'Demo'},'warnings':['DOB missing']}
        result = provider.extract_form(b'fake-only-transport','image/png')
        self.assertIsInstance(result,FormExtraction)
        self.assertEqual(result.fields.dateOfBirth,'')
        self.assertIn('uploadedDocumentBytes',outbound.get())

    def test_invalid_provider_output_and_failures_are_bounded(self):
        models = FakeModels({'agent':'customer_update','sql':'DROP TABLE customers'})
        provider = VertexProvider(client=SimpleNamespace(models=models),model='fake-test-model')
        with self.assertRaisesRegex(ValueError,'invalid result'):
            provider.route('Write records')
        with patch.object(models,'generate_content',side_effect=TimeoutError('Sensitive transport detail')):
            with self.assertRaisesRegex(ValueError,'provider is unavailable'):
                provider.chat('Hello')
        with patch.dict(os.environ,{'RISKLENS_PROVIDER':'vertex','RISKLENS_VERTEX_MODEL':'fake','RISKLENS_ENABLE_VERTEX':'false'},clear=True):
            with self.assertRaisesRegex(ValueError,'disabled'):
                get_provider()
