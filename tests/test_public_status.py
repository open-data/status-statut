import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).resolve().parents[1]/'tools/publish-public-status.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class PublicDataPrivacy(unittest.TestCase):
    def test_summary_keeps_required_link_but_redacts_credentials(self):
        rows = publisher.public_summary([
            {'name':'Public','slug':'public','url':'https://open.canada.ca/?resource_id=grants','icon':'https://example.com/icon.png','time':42,'token':'never-export'},
            {'name':'Private','url':'https://user:password@example.com/','icon':'https://example.com/icon?api_key=secret'},
            {'name':'Token','url':'https://example.com/?access_token=secret'}])
        self.assertEqual(rows[0]['url'],'https://open.canada.ca/?resource_id=grants')
        self.assertEqual(rows[0]['time'],42)
        self.assertNotIn('token', rows[0])
        self.assertEqual(rows[1]['url'],'#')
        self.assertEqual(rows[1]['icon'],'#')
        self.assertEqual(rows[2]['url'],'#')
    def test_credential_guard_refuses_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'manifest.json').write_text(json.dumps({'body':'synthetic-server-token'}))
            with self.assertRaises(ValueError): publisher.assert_no_credentials(folder,'synthetic-server-token')
    def test_issue_export_excludes_unneeded_fields(self):
        result=publisher.sanitize_issue({'number':1,'title':'Public incident','body':None,'labels':[{'name':'status','description':'extra'}],'user':{'login':'public-user','html_url':'https://github.com/public-user','token':'ignore'},'unrelated_secret':'ignore'})
        self.assertEqual(result['body'],'')
        self.assertNotIn('unrelated_secret',result)
        self.assertNotIn('token',result['user'])

if __name__=='__main__': unittest.main()
