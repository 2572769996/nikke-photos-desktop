"""Pure collection membership validation; no game or native controller imports."""
import json
from datetime import datetime, timezone


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
    return [roster[code] for code in codes]
