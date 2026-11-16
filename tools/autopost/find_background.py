import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

MARK = '[의뢰 배경'


def lookup(query, run_id, since):
    base = os.environ['DASHBOARD_API_URL'].rstrip('/')
    params = {'run_id': run_id, 'q': query, 'from': since, 'to': datetime.date.today().isoformat()}
    req = urllib.request.Request(
        base + '/agent/conversations/lookup?' + urllib.parse.urlencode(params),
        headers={'Authorization': 'Bearer ' + os.environ['DASHBOARD_AGENT_TOKEN'], 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=90) as res:
        body = json.load(res)
    return body.get('data', body)


def background_blocks(notes):
    blocks, cur = [], None
    for line in (notes or '').splitlines():
        if line.startswith(MARK):
            cur = [line]
            blocks.append(cur)
        elif cur is not None:
            if line.startswith('[') and not line.startswith(MARK):
                cur = None
            else:
                cur.append(line)
    return ['\n'.join(b).strip() for b in blocks]


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 3:
        print('usage: python -I find_background.py 브랜드이름 실행번호 [since=YYYY-MM-DD]')
        sys.exit(1)
    query, run_id = sys.argv[1], sys.argv[2]
    since = sys.argv[3] if len(sys.argv) > 3 else (datetime.date.today() - datetime.timedelta(days=730)).isoformat()
    d = lookup(query, run_id, since)

    projects = []
    for p in d.get('projects') or []:
        blocks = background_blocks(p.get('notes'))
        projects.append({'id': p.get('id'), 'name': p.get('name'), 'background': blocks,
                         'url': f"https://dashboard.honest-family.com/projects/{p.get('id')}"})
    issues = [{'id': i.get('id'), 'title': i.get('title'), 'status': i.get('status')} for i in d.get('issues') or []]
    builds = [{'id': b.get('id'), 'client': b.get('client_name'), 'request': (b.get('request') or '')[:300]} for b in d.get('web_builds') or []]
    messages = d.get('messages') or []
    missing = [f"{s.get('label')}" for s in d.get('sources') or [] if not s.get('connected')]

    found = [p for p in projects if p['background']]
    if found:
        place = ', '.join(f"{p['name']} #{p['id']}" for p in found)
        head = f'프로젝트 정보({place})에 의뢰 배경 있음'
    elif projects:
        place = ', '.join(f"{p['name']} #{p['id']}" for p in projects)
        head = f'프로젝트 정보({place})에 의뢰 배경 없음'
    else:
        head = f"대시보드에 '{query}' 프로젝트 없음"
    parts = [head]
    if issues:
        parts.append(f"이슈 {len(issues)}건(" + ', '.join(f"#{i['id']}" for i in issues[:8]) + (' …' if len(issues) > 8 else '') + ')')
    else:
        parts.append('이슈 0건')
    parts.append(f'프로젝트 카드 {len(builds)}건')
    parts.append(f'대화 수집함 {len(messages)}건')
    if missing:
        parts.append('못 뒤진 곳: ' + ', '.join(dict.fromkeys(missing)))

    print(json.dumps({
        'query': query,
        'has_background': bool(found),
        'projects': projects,
        'issues': issues,
        'web_builds': builds,
        'message_count': len(messages),
        'searched_line': '찾아본 곳: ' + ' · '.join(parts),
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
