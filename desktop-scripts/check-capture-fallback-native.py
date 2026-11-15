"""Real PrintWindow/GDI captures of an owned fixture; no game HWND or input calls."""
import ctypes
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT/'automation/maanikke'))
from capture_backend import CaptureBackend, window_state
from worker import encode_png


def main():
    from maa.controller import Win32Controller
    from maa.define import MaaWin32ScreencapMethodEnum as S, MaaWin32InputMethodEnum as I
    from maa.tasker import Tasker
    folder=PROJECT.parent/'codex temp/nikke-desktop'/('printwindow-native-'+str(int(time.time()*1000)))
    folder.mkdir(parents=True)
    Tasker.set_log_dir(folder/'native-logs');Tasker.set_stdout_level(0)
    nonce=uuid.uuid4().hex
    log=(folder/'fixture.log').open('wb')
    process=subprocess.Popen(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(PROJECT/'desktop-scripts/capture-fallback-fixture.ps1'),'-Folder',str(folder),'-Nonce',nonce],
                             stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW,
                             env={**os.environ,'TEMP':str(folder),'TMP':str(folder)})
    backend=None;report={'gameInputs':0,'ownedFixtureOnly':True,'passed':False}
    def state():
        try: return json.loads((folder/'state.json').read_text('utf-8-sig'))
        except (FileNotFoundError,json.JSONDecodeError): return {}
    def until(predicate,label):
        deadline=time.monotonic()+15
        while time.monotonic()<deadline:
            if process.poll() is not None:raise RuntimeError('Owned fixture exited: '+label)
            if predicate(): return
            time.sleep(.1)
        raise RuntimeError('Fixture timeout: '+label)
    try:
        until(lambda:state().get('nonce')==nonce,'ready');target=state()
        hwnd=int(target['hwnd'])
        assert target['pid']==process.pid
        calls=[]
        def factory(method):
            calls.append(method)
            if method=='FramePool':
                # Simulated default failure; do not invoke WGC/CaptureService at all.
                job=SimpleNamespace(succeeded=False);job.wait=lambda:job
                return SimpleNamespace(set_screenshot_use_raw_size=lambda _:True,post_connection=lambda:job)
            return Win32Controller(hwnd,S.PrintWindow,I.SendMessageWithCursorPos,I.SendMessageWithCursorPos)
        backend=CaptureBackend(factory,lambda:window_state(hwnd,target['pid']),lambda _:True)
        first=backend.connect();assert first.shape==(360,640,3)
        assert list(first[40,40])==[0,0,255],first[40,40]
        assert list(first[170,320])==[255,0,0],first[170,320]
        (folder/'first.png').write_bytes(encode_png(first))
        (folder/'phase-1').touch();until(lambda:state().get('phase')==1,'repaint');time.sleep(.2)
        changed=backend.capture();assert list(changed[40,40])==[0,255,0],changed[40,40]
        (folder/'changed.png').write_bytes(encode_png(changed))
        (folder/'cover').touch();until(lambda:state().get('covered'),'cover');time.sleep(.2)
        covered=backend.capture();assert list(covered[40,40])==[0,255,0],covered[40,40]
        assert list(covered[170,320])==[255,0,0],covered[170,320]
        (folder/'covered.png').write_bytes(encode_png(covered))
        current=state();assert current['nonce']==nonce and current['pid']==process.pid
        assert calls==['FramePool','PrintWindow']
        report.update(passed=True,defaultFailure='simulated without WGC call',fallback='real Maa 5.12.2 PrintWindow',
                      exactClientSize=True,bgrPixelsCorrect=True,freshRepaintObserved=True,ownedOcclusionCorrect=True,
                      attempts=calls,backend=backend.status())
    except Exception as error:
        report['error']=str(error);raise
    finally:
        if backend:backend.close()
        (folder/'stop').touch()
        try:process.wait(timeout=5)
        except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        log.close();report['evidence']=str(folder)
        (folder/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
        print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':main()
