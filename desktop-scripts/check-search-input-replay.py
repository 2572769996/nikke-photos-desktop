"""Replay saved pixels through the actual OCR; no window discovery/input/capture."""
import json
import re
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

sys.dont_write_bytecode=True
PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT/'automation/maanikke'))
from worker import Service
from collection_worker import Collector,Pages

image_file,name,output=Path(sys.argv[1]),sys.argv[2],Path(sys.argv[3])
output.mkdir(parents=True,exist_ok=True)
service=Service(output/'runtime')
try:
    service.initialize()
    service.last=np.asarray(Image.open(image_file).convert('RGB'))[:,:,::-1].copy()
    pages=Pages(service)
    old=pages.ocr([735,286,375,58],'^'+re.escape(name).replace('：','[：:]')+'$')
    current=pages.ocr([735,286,330,58])
    matched=Collector.query_matches(SimpleNamespace(pages=pages),name)
    report={'passed':bool(matched),'oldMatched':old['hit'],'newMatched':bool(matched),
            'expected':name,'oldDetails':old.get('detail'),'newDetails':current.get('detail'),
            'gameInputs':0,'gameCaptures':0,'savedImage':str(image_file)}
    (output/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    assert matched,json.dumps(report,ensure_ascii=False)
    print(json.dumps({'passed':True,'oldMatched':old['hit'],'newMatched':True,'texts':Pages.texts(current),'evidence':str(output),'gameInputs':0,'gameCaptures':0},ensure_ascii=False))
finally:
    service.close()
