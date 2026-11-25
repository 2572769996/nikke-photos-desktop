"""Offline CN membership boundary; does not import Maa or connect to the game."""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project / 'automation/maanikke'))
from collection_roster import load_collection_roster

definition = json.loads((project / 'src/data/cn-roster.json').read_text('utf-8'))
codes = definition['nameCodes']
full = json.loads((project / 'src/data/roster.json').read_text('utf-8'))['characters']
outside = next(c['nameCode'] for c in full if c['nameCode'] not in codes)
last_release = max(datetime.fromisoformat(date) for date in definition['unlockAt'].values())
ade=next(c for c in full if c['nameCn']=='爱德')
rabbit='5151'
before_unlock=datetime.fromisoformat(definition['unlockAt'][rabbit])-timedelta(seconds=1)
base_ade,=load_collection_roster(project,[ade['nameCode']],before_unlock)
assert rabbit in [c['nameCode'] for c in base_ade['searchAlternatives']]
assert [c['nameCode'] for c in load_collection_roster(project, codes, last_release)] == codes
for code, date in definition['unlockAt'].items():
    at = datetime.fromisoformat(date)
    try:
        load_collection_roster(project, [code], at - timedelta(milliseconds=1))
    except RuntimeError:
        pass
    else:
        raise AssertionError(f'{code} available before release')
    assert load_collection_roster(project, [code], at)[0]['nameCode'] == code
for invalid in [[], [outside], [codes[0], codes[0]], [None], [123], [{}], codes[0], ['unknown']]:
    try:
        load_collection_roster(project, invalid)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Invalid selection accepted')
print(json.dumps({'passed': True, 'cnCount': len(codes), 'outsideRejected': True, 'gameInputs': 0}))
