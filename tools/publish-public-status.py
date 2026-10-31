#!/usr/bin/env python3
"""Export public Upptime data; publish only to dedicated data/Pages branches.
The Actions token is used for server-side GETs and Git pushes, never serialized.
"""
import argparse, base64, concurrent.futures, datetime as dt, hashlib, json, os
from pathlib import Path
import re, shutil, subprocess, tempfile, time, urllib.parse, urllib.request

FIELDS = ('number', 'title', 'state', 'created_at', 'updated_at', 'closed_at', 'html_url', 'comments', 'body')

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def dump(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'
def sanitize_issue(issue):
    result = {key: issue.get(key) for key in FIELDS}
    result['body'] = result['body'] or ''
    result['labels'] = [{'name': label['name']} for label in issue.get('labels', [])]
    result['user'] = {key: issue.get('user', {}).get(key, '') for key in ('login', 'html_url')}
    return result

def public_summary(values):
    allowed = {'name','url','slug','status','icon','showAverageResponseTime','dailyMinutesDown'}
    result = [{k:v for k,v in item.items() if k in allowed or k.startswith('uptime') or k.startswith('time')} for item in values]
    for item in result:
        item.setdefault('url', '#')
        for key in ('url', 'icon'):
            url = item.get(key, '')
            parsed = urllib.parse.urlsplit(url)
            if parsed.username or parsed.password or any(re.search(r'token|secret|api.?key|password|credential|signature', field, re.I) for field in urllib.parse.parse_qs(parsed.query)):
                item[key] = '#'
    return result

def assert_no_credentials(directory, token):
    if not token: return
    encoded = base64.b64encode(('x-access-token:' + token).encode()).decode()
    for file in Path(directory).rglob('*.json'):
        content = file.read_text()
        if token in content or encoded in content:
            raise ValueError('Credential detected in export; nothing published')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', default=os.getenv('GITHUB_REPOSITORY'))
    parser.add_argument('--source', default='.')
    parser.add_argument('--work-dir', required=True)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--local-gh', action='store_true')
    parser.add_argument('--fresh-comments', action='store_true')
    args = parser.parse_args()
    if not args.repository or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        raise ValueError('A public owner/repository is required')
    repo = args.repository
    source = Path(args.source).resolve()
    work = Path(args.work_dir).resolve(); work.mkdir(parents=True, exist_ok=True)
    token = os.getenv('GITHUB_TOKEN', '')
    if not token and not args.local_gh: raise ValueError('A server-side GITHUB_TOKEN is required')
    git_env = os.environ.copy()
    git_env['GIT_TERMINAL_PROMPT'] = '0'
    if args.local_gh:
        git_env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='credential.helper', GIT_CONFIG_VALUE_0='!gh auth git-credential')
    if token:
        credential = base64.b64encode(('x-access-token:' + token).encode()).decode()
        git_env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0='AUTHORIZATION: basic ' + credential)
    def git(folder, *cmd, check=True):
        return subprocess.run(['git', '-C', str(folder), *cmd], env=git_env, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def api(path):
        if path != '/repos/' + repo and not path.startswith('/repos/' + repo + '/'):
            raise ValueError('API request outside the configured repository')
        for attempt in range(3):
            try:
                if args.local_gh:
                    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))
                request = urllib.request.Request('https://api.github.com' + path, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'public-upptime-export'})
                with urllib.request.urlopen(request, timeout=60) as response: return json.load(response)
            except Exception:
                if attempt == 2: raise RuntimeError('GitHub API export failed; previous public snapshot retained') from None
                time.sleep(2 ** attempt)
    def pages(endpoint, **query):
        result = []
        for page in range(1, 1001):
            values = api('/repos/' + repo + '/' + endpoint + '?' + urllib.parse.urlencode({**query, 'per_page':100, 'page':page}))
            if not isinstance(values, list): raise ValueError('Expected a complete public API list')
            result.extend(values)
            if len(values) < 100: return result
        raise ValueError('Pagination limit exceeded; no partial snapshot published')
    def checkout(branch, directory, allow_missing=False):
        directory.mkdir(parents=True, exist_ok=True)
        git(directory, 'init', '-q')
        if not git(directory, 'remote', 'get-url', 'origin', check=False).returncode == 0:
            git(directory, 'remote', 'add', 'origin', 'https://github.com/' + repo + '.git')
        exists = git(directory, 'ls-remote', '--exit-code', 'origin', 'refs/heads/' + branch, check=False)
        if exists.returncode == 2 and allow_missing:
            git(directory, 'symbolic-ref', 'HEAD', 'refs/heads/' + branch); return
        if exists.returncode: raise RuntimeError('Cannot read publishing branch ' + branch)
        git(directory, 'fetch', '--depth=1', 'origin', branch)
        git(directory, 'checkout', '-B', branch, 'FETCH_HEAD')
        git(directory, 'reset', '--hard', 'FETCH_HEAD')
    if api('/repos/' + repo).get('private') is not False:
        raise ValueError('Only public repositories may be exported')
    data_checkout = work / 'data-cache'
    checkout('public-status-data', data_checkout, allow_missing=True)
    previous = {}
    if (data_checkout / 'manifest.json').exists():
        previous = json.loads((data_checkout / 'manifest.json').read_text())
        if previous.get('repository') != repo or previous.get('schemaVersion') != 1: raise ValueError('Publishing branch belongs to a different data format')
    output = work / 'export'
    if output.exists(): shutil.rmtree(output)
    (output / 'issues').mkdir(parents=True)
    summary = json.loads((source / 'history/summary.json').read_text())
    summary = public_summary(summary)
    issues = {}
    node_ids = {}
    for label in ('status', 'maintenance'):
        for issue in pages('issues', state='all', labels=label, sort='created', direction='desc'):
            if 'pull_request' not in issue:
                issues[issue['number']] = sanitize_issue(issue)
                node_ids[issue['number']] = issue['node_id']
    generated_at = now()
    cached_details = {}
    for issue in issues.values():
        number = str(issue['number']); old = previous.get('details', {}).get(number)
        if old and old.get('updatedAt') == issue['updated_at'] and not args.fresh_comments:
            cached_path = data_checkout / old['path']
            if cached_path.is_file() and not cached_path.is_symlink() and cached_path.parent == data_checkout / 'issues':
                cached = json.loads(cached_path.read_text())
                age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(cached['exportedAt'])).total_seconds()
                if age < (600 if issue['state']=='open' else 86400): cached_details[number] = cached
    def graphql(query, variables):
        payload = json.dumps({'query': query, 'variables': variables})
        if args.local_gh:
            result = json.loads(subprocess.check_output(['gh','api','graphql','--input','-'], input=payload, text=True))
        else:
            request = urllib.request.Request('https://api.github.com/graphql', data=payload.encode(), headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','User-Agent':'public-upptime-export'})
            with urllib.request.urlopen(request, timeout=90) as response: result = json.load(response)
        if result.get('errors'): raise RuntimeError('Public incident comments export failed; previous snapshot retained')
        return result['data']
    comment_fields = 'nodes { databaseId body url createdAt updatedAt author { login url } } pageInfo { hasNextPage endCursor }'
    query = 'query($ids:[ID!]!) { nodes(ids:$ids) { ... on Issue { id comments(first:100) { '+comment_fields+' } } } }'
    need_comments = [number for number, issue in issues.items() if str(number) not in cached_details and issue['comments']]
    comments_by_number = {}
    by_node = {value:key for key,value in node_ids.items()}
    def convert_comments(values):
        return [{'id':value['databaseId'],'body':value['body'],'html_url':value['url'],'created_at':value['createdAt'],'updated_at':value['updatedAt'],'user':{'login':(value['author'] or {}).get('login','ghost'),'html_url':(value['author'] or {}).get('url','https://github.com/ghost')}} for value in values]
    # Batch connections rather than making one REST request per archived issue.
    for index in range(0, len(need_comments), 20):
        result = graphql(query, {'ids':[node_ids[number] for number in need_comments[index:index+20]]})
        for node in result['nodes']:
            if node is None: raise RuntimeError('Incident changed during export; retry instead of publishing partial data')
            number = by_node[node['id']]; connection = node['comments']
            values = list(connection['nodes'])
            while connection['pageInfo']['hasNextPage']:
                tail_query = 'query($id:ID!, $after:String!) { node(id:$id) { ... on Issue { comments(first:100,after:$after) { '+comment_fields+' } } } }'
                connection = graphql(tail_query, {'id':node['id'],'after':connection['pageInfo']['endCursor']})['node']['comments']
                values.extend(connection['nodes'])
            comments_by_number[number] = convert_comments(values)
    def export_issue(issue):
        number = str(issue['number'])
        detail = cached_details.get(number)
        if detail is None:
            detail = {'schemaVersion':1,'repository':repo,'exportedAt':generated_at,'issue':issue,'comments':comments_by_number.get(issue['number'],[])}
        content = dump(detail)
        path = 'issues/' + number + '-' + hashlib.sha256(content.encode()).hexdigest()[:16] + '.json'
        (output / path).write_text(content)
        return number, {'path':path,'updatedAt':issue['updated_at']}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        details = dict(pool.map(export_issue, issues.values()))
    slugs = [file.stem for file in (source / 'history').glob('*.yml') if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', file.stem)]
    source_commit = git(source, 'rev-parse', 'HEAD').stdout.strip()
    def export_commits(slug):
        values = api('/repos/' + repo + '/commits?' + urllib.parse.urlencode({'path':'history/'+slug+'.yml','per_page':28,'sha':source_commit}))
        return slug, [{'sha':item['sha'],'html_url':item.get('html_url',''),'commit':{'message':item['commit']['message'],'committer':{'date':item['commit']['committer']['date']}}} for item in values]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        commits = dict(pool.map(export_commits, slugs))
    source_commit = git(source, 'rev-parse', 'HEAD').stdout.strip()
    summary_history = api('/repos/' + repo + '/commits?' + urllib.parse.urlencode({'path':'history/summary.json','per_page':1,'sha':source_commit}))
    source_updated = summary_history[0]['commit']['committer']['date'] if summary_history else generated_at
    public_issues = []
    for issue in issues.values():
        item = dict(issue)
        if not any(label['name']=='maintenance' for label in item['labels']): item.pop('body',None)
        public_issues.append(item)
    manifest = {'schemaVersion':1,'repository':repo,'generatedAt':generated_at,'sourceUpdatedAt':source_updated,'sourceCommit':source_commit,'summary':summary,'issues':public_issues,'commits':commits,'details':details}
    (output / 'manifest.json').write_text(dump(manifest))
    assert_no_credentials(output, token)
    print(f'Exported {len(summary)} services, {len(issues)} issues and {len(commits)} history series; no credentials in public data.')
    if not args.publish: return
    def publish(branch, directory, copy_output):
        for attempt in range(5):
            checkout(branch, directory, allow_missing=(branch=='public-status-data'))
            copy_output(directory)
            git(directory, 'config', 'user.name', 'Public Status Bot')
            git(directory, 'config', 'user.email', 'github-actions[bot]@users.noreply.github.com')
            git(directory, 'add', '--all')
            if git(directory, 'diff', '--cached', '--quiet', check=False).returncode == 0:
                return git(directory, 'rev-parse', 'HEAD').stdout.strip()
            git(directory, 'commit', '-m', 'Publish credential-free public status [skip ci]')
            result = git(directory, 'push', 'origin', 'HEAD:refs/heads/' + branch, check=False)
            if result.returncode == 0: return git(directory, 'rev-parse', 'HEAD').stdout.strip()
            time.sleep(2 ** attempt)
        raise RuntimeError('Publishing branch changed repeatedly; previous snapshot retained')
    def copy_data(directory):
        for path in directory.iterdir():
            if path.name == '.git': continue
            if path.is_dir(): shutil.rmtree(path)
            else: path.unlink()
        for path in output.iterdir():
            if path.is_dir(): shutil.copytree(path, directory/path.name)
            else: shutil.copyfile(path, directory/path.name)
    data_commit = publish('public-status-data', data_checkout, copy_data)
    for attempt in range(5):
        try:
            with urllib.request.urlopen('https://cdn.jsdelivr.net/gh/' + repo + '@' + data_commit + '/manifest.json', timeout=60) as response:
                if response.status != 200: raise RuntimeError('CDN snapshot unavailable')
                response.read()
            break
        except Exception:
            if attempt == 4: raise RuntimeError('Snapshot could not be read through jsDelivr; previous Pages pointer retained') from None
            time.sleep(2 ** attempt)
    pointer = {'schemaVersion':1,'repository':repo,'generatedAt':generated_at,'dataCommit':data_commit}
    publish('gh-pages', work/'pages-cache', lambda directory: (directory/'public-status.json').write_text(dump(pointer)))
    print('Published public snapshot and Pages pointer; source monitoring files were not modified.')

if __name__ == '__main__': main()
