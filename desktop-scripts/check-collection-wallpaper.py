"""Run offline Maa recognition against supplied hidden, normal, shown and unrelated game screenshots."""
import argparse
import os
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from maa.tasker import Tasker

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation/maanikke'))
from collection_vision import COLLECTIBLE_TOGGLE_BOXES
from collection_worker import Pages
from worker import Service


def read_pixels(path):
    with Image.open(path) as source:
        assert source.size == (1920, 1080), (path, source.size)
        return np.asarray(source.convert('RGB'))[:, :, ::-1].copy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('hidden', 'normal', 'shown', 'unrelated'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    hidden, normal, shown, unrelated = map(read_pixels, (args.hidden, args.normal, args.shown, args.unrelated))

    folder = Path(os.environ.get('NIKKE_CACHE_DIR', tempfile.gettempdir())) / 'collection-wallpaper-vision'
    service = Service(folder)
    try:
        service.initialize()  # OfflineController only. No game discovery or connection.
        Tasker.set_save_on_error(False)
        Tasker.set_save_draw(False)
        Tasker.set_recording(False)
        pages = Pages(service)

        def classify(frame):
            service.last = frame
            pages.reset()
            return pages.page()

        for frame, expected in [(hidden, 'detail_wallpaper_hidden'), (normal, 'detail'), (shown, 'detail')]:
            assert classify(frame) == expected, expected
            scaled = Image.fromarray(frame).resize((2560, 1440), Image.Resampling.LANCZOS)
            assert classify(np.asarray(scaled)) == expected, '2K ' + expected

        original_page = classify(unrelated)
        assert original_page not in ('detail', 'detail_wallpaper_hidden'), original_page
        fake = unrelated.copy()
        for x, y, width, height in COLLECTIBLE_TOGGLE_BOXES:
            single = hidden.copy()
            single[y:y+height, x:x+width] = 0
            assert classify(single) != 'detail_wallpaper_hidden', 'Missing switch accepted'
            fake[y:y+height, x:x+width] = hidden[y:y+height, x:x+width]
        assert classify(fake) == original_page, 'Foreign page with two switches accepted as details'
        print('Three source frames at 1080p and resampled 1440p, both single-switch negatives,',
              'and two fake switches on', original_page, 'passed. Game inputs: 0.')
    finally:
        service.close()


if __name__ == '__main__':
    main()
