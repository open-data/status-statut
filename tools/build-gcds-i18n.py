#!/usr/bin/env python3
"""Generate the optional browser dictionary from Upptime's existing bilingual i18n.
Requires Python 3 and PyYAML. Run from the repository root after editing .upptimerc.yml.
No network access; generated output is committed with the theme.
"""
import json
from pathlib import Path
import yaml

root = Path(__file__).resolve().parents[1]
config = yaml.safe_load((root / '.upptimerc.yml').read_text())
messages = []

def add(source, en, fr):
    if source.strip():
        messages.append(dict(source=source, en=en, fr=fr))

website = config.get('status-website', {})
values = list(config.get('i18n', {}).values())
values += [website.get(key, '') for key in ('name', 'introTitle', 'introMessage')]
values += [item['title'] for item in website.get('navbar', [])]
for value in values:
    if not isinstance(value, str) or ' / ' not in value:
        continue
    en, fr = value.split(' / ', 1)
    for token in ('$UPTIME', '$TIME'):
        if token in value:
            # A shared trailing value is often present only after the French label.
            if token not in en: en += ' ' + value[value.index(token):]
            if token not in fr: fr += ' ' + value[value.index(token):]
    add(value, en, fr)
    # LiveStatus splits these templates into separate DOM fragments around values.
    # The numeric values themselves stay owned by Upptime and are never rewritten.
    for token in ('$UPTIME', '$TIME'):
        if token in value:
            source_parts = value.split(token)
            en_parts = en.split(token)
            fr_parts = fr.split(token)
            for i, part in enumerate(source_parts):
                add(part, en_parts[i] if i < len(en_parts) else '', fr_parts[i] if i < len(fr_parts) else '')
extra = root / 'assets/gcds-messages.json'
if extra.exists():
    messages.extend(json.loads(extra.read_text()))
# Longest first avoids a short label matching a larger dynamic template first.
messages.sort(key=lambda m: len(m['source']), reverse=True)
output = {'defaultLanguage': 'en', 'messages': messages, 'repositoryUrl': f"https://github.com/{config['owner']}/{config['repo']}"}
history_back = config.get('i18n', {}).get('historyBack', '')
if ' / ' in history_back:
    en, fr = history_back.split(' / ', 1)
    output['historyBack'] = {'en': en, 'fr': fr}
(root / 'assets/gcds-i18n.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(f'Generated {len(messages)} interface messages.')
