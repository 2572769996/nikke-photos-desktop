"""Exercise a Windows reader that temporarily prevents a progress-file replacement."""
import json
import sys
import tempfile
from pathlib import Path
from threading import Timer

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation/maanikke'))
from collection_worker import Collector

if sys.platform != 'win32':
    print('SKIP: this regression requires Windows file sharing.')
    sys.exit(0)

with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    collector = Collector({}, folder)
    collector.progress('读取头部装备', slot='head')
    progress = folder / 'progress.json'
    with progress.open('rb') as reader:
        release = Timer(.12, reader.close)
        release.start()
        try:
            collector.progress('等待装备弹窗稳定')
        finally:
            release.join()
    recorded = json.loads(progress.read_text('utf-8'))
    assert recorded['phase'] == '等待装备弹窗稳定' and recorded['slot'] == 'head'
    assert recorded['inputRequests'] == 0 and not (folder / 'progress.next').exists()
    print('PASS: Windows progress reader released; new snapshot committed without a game action.')
