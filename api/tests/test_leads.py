from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from gspread.utils import ValueInputOption

from api.main import HEADERS, _worksheet, app, worksheet

VALID = dict(name='Тест QA', phone='+7 (999) 123-45-67', email='qa@example.invalid', order='Тестовая заявка', note='', source='test')


@pytest.fixture
def client():
    ws = Mock()
    app.dependency_overrides[worksheet] = lambda: ws
    with TestClient(app) as client:
        yield client, ws
    app.dependency_overrides.clear()


def test_write_confirmed_and_raw(client):
    http, ws = client
    data = dict(VALID, order='=1+1')
    assert http.post('/api/leads', json=data).json() == {'ok': True}
    row = ws.append_row.call_args.args[0]
    assert row[1:] == ['test', VALID['name'], VALID['phone'], VALID['email'], '=1+1', '']
    assert ws.append_row.call_args.kwargs['value_input_option'] == ValueInputOption.raw


@pytest.mark.parametrize('field,value', [
    ('name', '  '), ('name', 'X'), ('name', 'x' * 101),
    ('phone', '12345'), ('phone', 'aaaaaaaaaa1234567890'),
    ('phone', '++79991234567'), ('phone', '1' * 16),
    ('email', 'qa@'), ('email', 'qa @example.com'), ('email', 'x' * 161),
    ('order', ' '), ('order', 'x' * 501), ('note', 'x' * 2001),
])
def test_invalid_never_written(client, field, value):
    http, ws = client
    assert http.post('/api/leads', json=dict(VALID, **{field: value})).status_code == 422
    ws.append_row.assert_not_called()


@pytest.mark.parametrize('field', ['name', 'phone', 'email', 'order'])
def test_required(client, field):
    http, ws = client
    data = dict(VALID)
    del data[field]
    assert http.post('/api/leads', json=data).status_code == 422
    ws.append_row.assert_not_called()


def test_google_failure_no_false_success(client):
    http, ws = client
    ws.append_row.side_effect = RuntimeError('private credentials detail')
    response = http.post('/api/leads', json=VALID)
    assert response.status_code == 502
    assert 'private' not in response.text
    assert response.json().get('ok') is not True


def test_missing_configuration_is_generic_502():
    # Replace the internal factory, not external Google configuration.
    from unittest.mock import patch
    with patch('api.main._worksheet', side_effect=RuntimeError('secret path')):
        with TestClient(app) as http:
            response = http.post('/api/leads', json=VALID)
    assert response.status_code == 502
    assert 'secret' not in response.text


def test_health_static_and_cors(client):
    http, _ = client
    assert http.get('/api/health').json() == {'ok': True}
    assert 'request-form' in http.get('/calculator.html').text
    assert http.get('/api/.env').status_code == 404
    response = http.options('/api/leads', headers={'Origin': 'https://untrusted.invalid', 'Access-Control-Request-Method': 'POST'})
    assert 'access-control-allow-origin' not in response.headers


def test_existing_sheet_headers_not_overwritten():
    from unittest.mock import patch
    from api.config import config
    client = Mock()
    ws = client.open_by_key.return_value.worksheet.return_value
    ws.row_values.return_value = ['Other data']
    _worksheet.cache_clear()
    with patch.object(config, 'sheet_id', 'mock-id'), patch.object(config, 'credentials'), patch('api.main.gspread.authorize', return_value=client):
        with pytest.raises(RuntimeError, match='headers differ'):
            _worksheet()
    ws.update.assert_not_called()
    _worksheet.cache_clear()
