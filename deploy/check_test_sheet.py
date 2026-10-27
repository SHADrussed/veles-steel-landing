"""Operator-only smoke test. Never run against customer production sheets."""
import argparse
import os
import uuid

import gspread
import httpx
from google.oauth2.service_account import Credentials

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--api-url', required=True)
parser.add_argument('--test-sheet-id', required=True)
parser.add_argument('--worksheet', default='Заявки')
parser.add_argument('--confirm-test-write', action='store_true')
args = parser.parse_args()
if not args.confirm_test_write:
    parser.error('Requires explicit --confirm-test-write for an authorized test spreadsheet')
if not args.api_url.startswith('https://'):
    parser.error('Use HTTPS for the deployed test API')
# The API must be independently configured to this same TEST sheet before running.
marker = 'QA-' + uuid.uuid4().hex
payload = dict(name='QA Тест', phone='+7 999 123 45 67', email='qa@example.invalid', order=marker, source='test-smoke')
response = httpx.post(args.api_url.rstrip('/') + '/api/leads', json=payload, timeout=25)
response.raise_for_status()
if response.json().get('ok') is not True:
    raise RuntimeError('API did not acknowledge the lead')
credentials = Credentials.from_service_account_file(os.environ['GOOGLE_SERVICE_ACCOUNT_FILE'], scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
client = gspread.authorize(credentials)
client.set_timeout(10)
ws = client.open_by_key(args.test_sheet_id).worksheet(args.worksheet)
if marker not in ws.col_values(6):
    raise RuntimeError('API returned ok but marker is absent from the requested test worksheet')
print('PASS: API acknowledged the lead and the unique test marker exists in the test sheet')
