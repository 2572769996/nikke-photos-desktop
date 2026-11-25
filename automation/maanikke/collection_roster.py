"""Pure collection membership validation; no game or native controller imports."""
import json
from datetime import datetime, timezone


def search_term(character):
    return character['nameCn'].lower()


def load_collection_roster(project, codes, now=None):
    roster = {c['nameCode']: c for c in json.loads((project / 'src/data/roster.json').read_text('utf-8'))['characters']}
    definition = json.loads((project / 'src/data/cn-roster.json').read_text('utf-8'))
    if definition.get('version') != 1:
        raise RuntimeError('Unsupported CN roster version')
    now = datetime.now(timezone.utc) if now is None else now
    unlocks = definition.get('unlockAt', {})
    cn_codes = {code for code in definition['nameCodes']
                if code not in unlocks or now >= datetime.fromisoformat(unlocks[code])}
    if (not isinstance(codes, list) or not codes or len(codes) > len(cn_codes)
            or any(not isinstance(code, str) for code in codes)
            or len(set(codes)) != len(codes)
            or any(code not in roster or code not in cn_codes for code in codes)):
        raise RuntimeError('Invalid CN roster selection')
    # An event variant can already appear in search before its permanent pool unlocks.
    search_names = {code: search_term(roster[code]) for code in definition['nameCodes']}
    selected = []
    for code in codes:
        term = search_names[code]
        alternatives = [roster[other] for other, name in search_names.items()
                        if other != code and term in name]
        selected.append({**roster[code], 'searchAlternatives': alternatives})
    return selected
