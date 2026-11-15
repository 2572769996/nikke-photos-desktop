"""Offline fallback state-machine tests. No windows/controllers/game inputs."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

sys.dont_write_bytecode = True
PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / 'automation/maanikke'))
from capture_backend import CaptureBackend, WindowStateError, validate_frame
from worker import Service


def image():
    rng = np.random.default_rng(5136)
    return rng.integers(0, 256, (90, 160, 3), dtype=np.uint8)


class Job:
    def __init__(self, ok=True): self.succeeded = ok
    def wait(self): return self


class Controller:
    def __init__(self, connected=True, frames=None):
        self.connected = connected
        self.frames = list(frames) if frames is not None else [image()]
        self.cached_image = None
        self.inputs = 0
        self.captures = 0
        self.raw = False
    def set_screenshot_use_raw_size(self, value): self.raw = value; return True
    def post_connection(self): return Job(self.connected)
    def post_screencap(self):
        self.captures += 1
        value = self.frames.pop(0) if len(self.frames) > 1 else self.frames[0]
        if isinstance(value, Exception): raise value
        self.cached_image = value
        return Job(value is not None)


class FallbackTests(unittest.TestCase):
    def test_printwindow_only_never_constructs_framepool_even_on_failure(self):
        for fails in (False, True):
            calls=[]
            controller=Controller(connected=not fails)
            def factory(method):
                calls.append(method)
                self.assertEqual(method,'PrintWindow')
                return controller
            backend=CaptureBackend(factory,lambda:{'size':(160,90)},lambda _:True,policy='printwindow-only')
            if fails:
                with self.assertRaisesRegex(RuntimeError,'FramePool已禁用'):backend.connect()
                self.assertTrue(backend.closed)
            else:
                backend.connect();backend.capture()
                self.assertEqual(backend.status()['capturePolicy'],'printwindow-only')
                self.assertEqual(backend.status()['captureBackend'],'PrintWindow')
                controller.frames=[RuntimeError('failed later')]
                with self.assertRaises(RuntimeError):backend.capture()
            self.assertEqual(calls,['PrintWindow'])
            with self.assertRaisesRegex(RuntimeError,'禁用FramePool'):backend._start('FramePool')

    def test_service_forced_policy_reaches_native_factory(self):
        from maa.define import MaaWin32ScreencapMethodEnum as S
        with tempfile.TemporaryDirectory(dir=PROJECT.parent/'codex temp/nikke-desktop') as folder:
            with patch.dict('os.environ',{'NIKKE_CAPTURE_POLICY':'printwindow-only'}):service=Service(folder)
            target={'hwnd':'123','pid':123}
            service.windows=lambda:{'windows':[target]}
            service.tasker=SimpleNamespace(bind=lambda *_:True);service.resource=object()
            calls=[]
            def native(hwnd,method,*_):
                calls.append(method);self.assertEqual(method,S.PrintWindow)
                return Controller()
            with patch('maa.controller.Win32Controller',side_effect=native),patch('capture_backend.window_state',return_value={'size':(160,90)}):
                self.assertEqual(service.connect('123')['capturePolicy'],'printwindow-only')
                service.capture(export=False)
            self.assertEqual(calls,[S.PrintWindow])

    def setup_backend(self, default=None, fallback=None):
        self.state = {'hwnd':'123', 'pid':123, 'size':(160,90)}
        self.created, self.bound, self.records = [], [], []
        self.controllers = {'FramePool':default or Controller(), 'PrintWindow':fallback or Controller()}
        def factory(method): self.created.append(method); return self.controllers[method]
        def bind(controller): self.bound.append(controller); return True
        self.backend = CaptureBackend(factory, lambda:copy.deepcopy(self.state), bind, self.records.append)
        return self.backend

    def test_healthy_default_never_constructs_fallback(self):
        backend = self.setup_backend()
        backend.connect(); backend.capture()
        self.assertEqual(self.created, ['FramePool'])
        self.assertTrue(self.controllers['FramePool'].raw)
        self.assertEqual(backend.status()['captureBackend'], 'FramePool')

    def test_failed_connection_falls_back_and_binds_only_valid_controller(self):
        backend = self.setup_backend(default=Controller(connected=False))
        frame = backend.connect(); backend.capture()
        self.assertEqual(frame.shape, (90,160,3))
        self.assertEqual(self.created, ['FramePool','PrintWindow'])
        self.assertEqual(self.bound, [self.controllers['PrintWindow']])
        self.assertTrue(backend.status()['captureFallback'])

    def test_exception_and_blank_or_wrong_size_first_frames_fall_back(self):
        for value in [None, RuntimeError('RPC failed'), np.zeros((90,160,3),np.uint8), image()[:80]]:
            with self.subTest(value=type(value)):
                backend = self.setup_backend(default=Controller(frames=[value]))
                backend.connect()
                self.assertEqual(backend.method, 'PrintWindow')
                self.assertEqual(self.bound, [self.controllers['PrintWindow']])

    def test_runtime_failure_switches_once_then_keeps_printwindow(self):
        backend = self.setup_backend(default=Controller(frames=[image(), None]))
        backend.connect(); backend.capture(); backend.capture()
        self.assertEqual(self.created, ['FramePool','PrintWindow'])
        self.assertEqual(backend.method, 'PrintWindow')
        self.assertEqual(len(self.bound), 2)

    def test_both_fail_closed_without_retrying_or_binding_invalid_frame(self):
        backend = self.setup_backend(default=Controller(connected=False), fallback=Controller(frames=[None]))
        with self.assertRaisesRegex(RuntimeError, '均不可用'): backend.connect()
        self.assertEqual(self.created, ['FramePool','PrintWindow'])
        self.assertEqual(self.bound, [])
        with self.assertRaises(RuntimeError): backend.capture()
        self.assertEqual(self.created, ['FramePool','PrintWindow'])

    def test_runtime_fallback_failure_invalidates_session(self):
        backend = self.setup_backend(default=Controller(frames=[image(), None]), fallback=Controller(connected=False))
        backend.connect()
        with self.assertRaises(RuntimeError): backend.capture()
        self.assertTrue(backend.closed)
        with self.assertRaises(RuntimeError): backend.capture()
        self.assertEqual(self.created, ['FramePool','PrintWindow'])

    def test_printwindow_later_failure_never_retries_wgc(self):
        backend = self.setup_backend(default=Controller(connected=False), fallback=Controller(frames=[image(),None]))
        backend.connect()
        with self.assertRaises(RuntimeError): backend.capture()
        self.assertEqual(self.created, ['FramePool','PrintWindow'])
        self.assertIsNone(backend.controller)

    def test_target_guard_failure_does_not_try_another_backend(self):
        backend = self.setup_backend()
        backend.inspect = lambda: (_ for _ in ()).throw(WindowStateError('minimized or reused HWND'))
        with self.assertRaises(WindowStateError): backend.connect()
        self.assertEqual(self.created, [])

    def test_geometry_change_during_capture_stops_instead_of_fallback(self):
        backend = self.setup_backend()
        states = iter([copy.deepcopy(self.state), {**self.state,'size':(200,100)}])
        backend.inspect = lambda: next(states)
        with self.assertRaises(WindowStateError): backend.connect()
        self.assertEqual(self.created, ['FramePool'])
        self.assertEqual(self.bound, [])

    def test_frame_contract_rejects_bad_type_channels_size_and_uniform_color(self):
        for frame in [None, image().astype('float32'), image()[:,:,0], image()[:80],
                      np.full((90,160,3),255,np.uint8), np.tile(np.array([255,0,0],np.uint8),(90,160,1))]:
            with self.assertRaises(RuntimeError): validate_frame(frame,(160,90))
        source = image(); result = validate_frame(source,(160,90))
        self.assertTrue(np.array_equal(source,result)); self.assertFalse(np.shares_memory(source,result))

    def test_failed_capture_clears_service_frame_and_connection(self):
        with tempfile.TemporaryDirectory(dir=PROJECT.parent/'codex temp/nikke-desktop') as folder:
            service = Service(folder); service.connection={'hwnd':'123'}; service.last=image()
            service.capture_backend=SimpleNamespace(capture=lambda: (_ for _ in ()).throw(RuntimeError('both failed')))
            with self.assertRaises(RuntimeError): service.capture(export=False)
            self.assertIsNone(service.last); self.assertIsNone(service.connection)

    def test_raw_capture_and_png_export_preserve_selected_backend(self):
        backend = self.setup_backend(default=Controller(connected=False));backend.connect()
        with tempfile.TemporaryDirectory(dir=PROJECT.parent/'codex temp/nikke-desktop') as folder:
            service=Service(folder);service.connection={'hwnd':'123'};service.capture_backend=backend
            with patch('worker.encode_png',return_value=b'png') as png:
                raw=service.capture(export=False);self.assertEqual(png.call_count,0)
                encoded=service.capture();self.assertEqual(png.call_count,1)
            self.assertEqual(raw['captureBackend'],'PrintWindow')
            self.assertEqual(encoded['captureBackend'],'PrintWindow')
            self.assertTrue(encoded['image'].startswith('data:image/png;base64,'))

    def test_service_connect_returns_fallback_and_failed_reconnect_clears_old_identity(self):
        from maa.define import MaaWin32ScreencapMethodEnum as S
        with tempfile.TemporaryDirectory(dir=PROJECT.parent/'codex temp/nikke-desktop') as folder:
            service=Service(folder)
            target={'hwnd':'123','pid':123,'title':'owned mock','className':'UnityWndClass'}
            service.windows=lambda:{'windows':[target]}
            service.tasker=SimpleNamespace(bind=lambda *_:True);service.resource=object()
            default,fallback=Controller(connected=False),Controller()
            with patch('maa.controller.Win32Controller',side_effect=lambda hwnd,method,mouse,key:default if method==S.FramePool else fallback),patch('capture_backend.window_state',return_value={'hwnd':'123','pid':123,'size':(160,90)}):
                connected=service.connect('123')
                self.assertEqual(connected['captureBackend'],'PrintWindow')
                self.assertEqual(connected['settings']['screencap'],'PrintWindow')
                self.assertFalse(connected['gameInputEnabled'])
                self.assertIs(service.controller,fallback)
                self.assertEqual(service.capture(export=False)['captureBackend'],'PrintWindow')
                with self.assertRaises(RuntimeError):service.connect('999')
                self.assertIsNone(service.last);self.assertIsNone(service.connection)


if __name__ == '__main__': unittest.main(verbosity=2)
