"""Desktop-only JSON adapter. No changes to upstream formulas or skills."""
import contextlib
import dataclasses
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

def main():
    from runner import sim
    from calculator.sim_result import analyze_team
    raw = sys.stdin.buffer.read(262145)
    if len(raw) > 262144:
        raise ValueError('Request too large')
    request = json.loads(raw)
    detail = request.pop("_desktop_detail", False)
    with contextlib.redirect_stdout(sys.stderr):
        run = sim.prepare(request)
        result = sim.execute(run)
        out = sim.payload(run, result)
        analysis = analyze_team(result)
    out['evaluator'] = {'repo':'Jgaram/nikke-calc', 'commit':'67835ca3033a95482749ea2db35a8ee2a0856a92', 'dirty':False}
    seconds = max(1, math.ceil(result.duration))
    buckets = {name:[0]*(seconds+1) for name in run.members}
    for hit in result.hits:
        if hit.caster in buckets:
            buckets[hit.caster][min(seconds, max(0, math.ceil(hit.t)))] += hit.damage
    for values in buckets.values():
        for i in range(1, len(values)):
            values[i] += values[i-1]
    out['desktop'] = {
        'cumulative':buckets,
        'analysis':[dataclasses.asdict(a) for a in analysis],
        'burst':[dataclasses.asdict(e) for e in (result.log.burst_log if result.log else [])][:3000],
        'detailSource':'upstream SimResult; per-second cumulative hit damage',
    }
    if detail:
        def finite(value):
            if isinstance(value, float) and not math.isfinite(value):
                return None
            if isinstance(value, dict):
                return {key: finite(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [finite(item) for item in value]
            return value

        event_sources = {
            'ammo': result.log.ammo_log,
            'reload': result.log.reload_log,
            'buffs': result.log.buff_events,
            'instant': result.log.instant_events,
            'gauge': result.log.gauge_log,
            'control': result.log.control_log,
            'hits': result.hits,
        }
        events = {}
        for key, source in event_sources.items():
            rows = [dataclasses.asdict(event) for event in source[:4000]]
            if key == 'hits':
                fields = ('t', 'caster', 'damage', 'skill_name', 'hit_tag', 'is_crit', 'target')
                rows = [{field: row[field] for field in fields} for row in rows]
            events[key] = {'rows': finite(rows), 'total': len(source), 'truncated': len(source) > 4000}
        out['desktop']['events'] = events
    return out

if __name__ == '__main__':
    try:
        output = main()
    except (Exception, SystemExit) as exc:
        output = {'error':{'type':'simulation_error', 'message':str(exc)}}
    print(json.dumps(output, ensure_ascii=False, allow_nan=False))
