"""Pause a real collector wait between captures, using a virtual clock and no controller."""
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation/maanikke'))
from collection_worker import Collector


def check(folder, popup):
    clock = [0.]
    captures = []
    pause_file = folder / 'pause'
    collector = Collector({'ownerPid': os.getpid(), 'characters': [{}]}, folder)
    collector.pages = SimpleNamespace(image=np.full((1080, 1920, 3), 255, dtype=np.uint8), page=lambda: 'overload')

    def sleep(seconds):
        if pause_file.exists():
            clock[0] += 30
            pause_file.unlink()
        else:
            clock[0] += seconds

    def capture(record=False):
        if len(captures) == 1:
            pause_file.touch()
        collector.guard()
        captures.append(clock[0])

    collector.capture = capture
    with patch('collection_worker.time.monotonic', lambda: clock[0]), patch('collection_worker.time.sleep', sleep):
        if popup:
            collector.wait_popup(timeout=2)
        else:
            collector.wait(lambda: True, '确认列表', initial=0, timeout=2, record=False)
    assert len([at for at in captures if at >= 30]) >= 2, captures


with tempfile.TemporaryDirectory(dir=os.environ.get('NIKKE_CACHE_DIR')) as tmp:
    for popup in (False, True):
        check(Path(tmp), popup)
print('Page and equipment popup both require fresh confirmations after a 30-second pause.')
