#!/usr/bin/env python3
"""Exercise the jury REST scenario against explicitly seeded synthetic accounts."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    # Do not forward jury Authorization headers to a redirect target.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--access-file', type=Path, required=True)
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    url = urlsplit(base)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment:
        parser.error('Use an http(s) base URL without credentials, query or fragment.')
    access = json.loads(args.access_file.read_text())
    if access.get('synthetic') is not True:
        parser.error('Access file must come from prisma/seed-demo.mjs; do not use real accounts.')
    employer = access['employer']['token']
    candidate = access['candidate']['token']
    published_id = access['published_vacancy_id']
    opener = build_opener(NoRedirect())
    count = 0

    def check(method, path, expected_status, token=None, body=None, expected=None):
        nonlocal count
        headers = {'Accept': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        if body is not None:
            headers['Content-Type'] = 'application/json'
        request = Request(base + path, method=method, headers=headers,
                          data=None if body is None else json.dumps(body).encode())
        try:
            response = opener.open(request, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            code = response.code
            if code != expected_status:
                raise AssertionError(f'{method} {path}: expected HTTP {expected_status}, got {code}')
            if response.headers.get_content_type() != 'application/json':
                raise AssertionError(f'{method} {path}: expected JSON')
            data = json.load(response)
        for key, value in (expected or {}).items():
            actual = data
            for part in key.split('.'):
                actual = actual[part]
            if actual != value:
                raise AssertionError(f'{method} {path}: unexpected field {key}')
        count += 1
        print(f'PASS {method} {path}: {code}')
        return data

    check('GET', '/health', 200, expected={'ok': True, 'db': 'up'})
    check('GET', '/api/vacancies', 401, expected={'error.code': 'unauthorized'})
    check('POST', '/api/auth/max', 400, body={}, expected={'error.code': 'validation_error'})
    check('POST', '/api/vacancies', 400, employer, {}, {'error.code': 'validation_error'})
    draft = check('POST', '/api/vacancies', 201, employer,
                  json.loads(Path(__file__).with_name('vacancy-create.json').read_text()),
                  {'status': 'draft', 'employerUserId': access['employer']['user_id']})
    draft_path = f"/api/vacancies/{draft['id']}"
    check('GET', draft_path, 200, employer, expected={'id': draft['id']})
    check('GET', draft_path, 403, candidate, expected={'error.code': 'forbidden'})
    check('PATCH', draft_path, 200, employer, {'salary_min': 45000}, {'salaryMin': 45000})
    check('POST', draft_path + '/publish', 409, employer, expected={'error.code': 'employer_chat_missing'})
    check('GET', draft_path, 200, employer, expected={'status': 'draft'})
    check('POST', '/api/applications', 409, candidate, {'vacancy_id': draft['id']}, {'error.code': 'conflict'})
    check('GET', f'/api/vacancies/{published_id}', 200, employer, expected={'status': 'published'})
    check('PATCH', f'/api/vacancies/{published_id}', 409, employer, {'title': 'ДЕМО'}, {'error.code': 'conflict'})
    payload = {'vacancy_id': published_id, 'contact': 'demo-candidate@example.invalid'}
    application = check('POST', '/api/applications', 201, candidate, payload,
                        {'status': 'new', 'notified': False, 'candidateUserId': access['candidate']['user_id']})
    check('POST', '/api/applications', 409, candidate, payload, {'error.code': 'conflict'})
    items = check('GET', f'/api/vacancies/{published_id}/applications', 200, employer)
    assert len(items) == 1 and items[0]['id'] == application['id'] and 'candidate' in items[0]
    check('GET', f'/api/vacancies/{published_id}/applications', 403, candidate, expected={'error.code': 'forbidden'})
    result = check('GET', '/api/applications?status=new&limit=20&offset=0', 200, employer,
                   expected={'total': 1, 'limit': 20, 'offset': 0})
    assert result['items'][0]['id'] == application['id']
    application_path = f"/api/applications/{application['id']}"
    check('PATCH', application_path, 403, candidate, {'status': 'invited'}, {'error.code': 'forbidden'})
    check('PATCH', application_path, 200, employer, {'status': 'invited'},
          {'status': 'invited', 'notified': False, 'unchanged': False})
    check('PATCH', application_path, 200, employer, {'status': 'invited'},
          {'status': 'invited', 'notified': False, 'unchanged': True})
    check('POST', f'/api/vacancies/{published_id}/close', 200, employer, expected={'status': 'closed'})
    check('POST', '/api/applications', 409, candidate, payload, {'error.code': 'conflict'})
    check('POST', f'/api/vacancies/{published_id}/publish', 409, employer, expected={'error.code': 'conflict'})
    print(f'{count} API checks passed. Synthetic data only; live MAX delivery was not tested.')


if __name__ == '__main__':
    main()
