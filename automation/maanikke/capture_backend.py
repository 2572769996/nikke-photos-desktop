"""Explicit WGC -> PrintWindow/GDI fallback. This module never sends input."""
import ctypes
from ctypes import wintypes

import numpy as np


class WindowStateError(RuntimeError):
    """Target identity/geometry changed; another backend must not bypass it."""


def window_state(hwnd, expected_pid):
    """Read physical client dimensions without moving/activating the window."""
    user = ctypes.WinDLL('user32', use_last_error=True)
    user.IsWindow.argtypes = user.IsIconic.argtypes = user.IsWindowVisible.argtypes = [wintypes.HWND]
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user.SetThreadDpiAwarenessContext.argtypes = [wintypes.HANDLE]
    user.SetThreadDpiAwarenessContext.restype = wintypes.HANDLE
    handle = wintypes.HWND(int(hwnd))
    if not user.IsWindow(handle):
        raise WindowStateError('目标窗口已关闭, 请重新连接')
    pid = wintypes.DWORD()
    if not user.GetWindowThreadProcessId(handle, ctypes.byref(pid)) or pid.value != expected_pid:
        raise WindowStateError('窗口进程身份已改变, 请重新连接')
    if user.IsIconic(handle) or not user.IsWindowVisible(handle):
        raise WindowStateError('游戏已最小化或隐藏, 请手动恢复后重试')
    previous = user.SetThreadDpiAwarenessContext(wintypes.HANDLE(-4))
    if not previous:
        raise WindowStateError('无法确认窗口DPI坐标, 请重新连接')
    try:
        rect = wintypes.RECT()
        if not user.GetClientRect(handle, ctypes.byref(rect)):
            raise WindowStateError('无法读取游戏客户区尺寸')
        size = (rect.right - rect.left, rect.bottom - rect.top)
        if min(size) <= 0:
            raise WindowStateError('游戏客户区尺寸无效')
        return {'hwnd': str(hwnd), 'pid': pid.value, 'size': size}
    finally:
        user.SetThreadDpiAwarenessContext(previous)


def validate_frame(image, size):
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3 or image.dtype != np.uint8:
        raise RuntimeError('截图必须是三通道uint8 BGR')
    if (image.shape[1], image.shape[0]) != tuple(size):
        raise RuntimeError('截图尺寸与窗口客户区不一致, 拒绝猜测或缩放坐标')
    if float(image[::8, ::8].std(axis=(0, 1)).max()) < 1:
        raise RuntimeError('截图接近纯色或全黑, 无法确认画面')
    return image.copy()


class CaptureBackend:
    """One default attempt, then one fallback; reconnect starts a new selection.

    Factories/guards/binders are supplied by Service, not by external RPC callers.
    The fallback is the pinned MaaFramework PrintWindow backend (GDI DC/bitmap),
    not desktop capture. Existing page/anchor/stable-frame guards stay in force.
    """
    def __init__(self, factory, inspect, bind, record=lambda _: None, *, policy='auto'):
        if policy not in ('auto', 'printwindow-only'):
            raise ValueError('未知截图策略，拒绝启动')
        self.policy = policy
        self.factory, self.inspect, self.bind, self.record = factory, inspect, bind, record
        self.controller = None
        self.method = None
        self.events = []
        self.closed = False

    def status(self):
        return {'captureBackend': self.method, 'captureFallback': self.method == 'PrintWindow', 'capturePolicy': self.policy,
                'captureAttempts': list(self.events)}

    def _event(self, method, outcome, reason=None):
        self.events.append({'backend': method, 'outcome': outcome, **({'reason': str(reason)[:1000]} if reason else {})})
        self.record(self.status())

    def _read(self, controller, before):
        if not controller.post_screencap().wait().succeeded:
            raise RuntimeError('原生截图请求失败')
        after = self.inspect()
        if before != after:
            raise WindowStateError('截图期间窗口身份或客户区尺寸变化, 请重新连接')
        return validate_frame(controller.cached_image, after['size'])

    def _start(self, method):
        if self.policy == 'printwindow-only' and method != 'PrintWindow':
            raise RuntimeError('本次测试已禁用FramePool，只允许PrintWindow/GDI')
        before = self.inspect()
        controller = self.factory(method)
        if not controller.set_screenshot_use_raw_size(True):
            raise RuntimeError('无法启用原始客户区尺寸截图')
        if not controller.post_connection().wait().succeeded:
            raise RuntimeError('原生窗口连接失败')
        # No controller is published/bound until a fresh client-sized frame passes.
        image = self._read(controller, before)
        if self.bind(controller) is False:
            raise RuntimeError('识别控制器绑定失败')
        self.controller, self.method = controller, method
        self._event(method, 'selected')
        return image

    def connect(self):
        if self.closed:
            raise RuntimeError('截图会话已结束, 请重新连接')
        for method in (('PrintWindow',) if self.policy == 'printwindow-only' else ('FramePool', 'PrintWindow')):
            try:
                return self._start(method)
            except WindowStateError:
                self.close()
                raise
            except Exception as error:
                self._event(method, 'failed', error)
        self.close()
        if self.policy == 'printwindow-only':
            raise RuntimeError('PrintWindow/GDI专用测试连接失败，FramePool已禁用；请查看截图后端日志')
        raise RuntimeError('FramePool和备用PrintWindow/GDI均不可用，请查看截图后端日志')

    def capture(self):
        if self.closed or self.controller is None:
            raise RuntimeError('截图连接已失效, 请重新连接')
        try:
            before = self.inspect()
            return self._read(self.controller, before)
        except WindowStateError:
            self.close()
            raise
        except Exception as error:
            failed = self.method
            self._event(failed, 'failed', error)
            if failed == 'FramePool':
                try:
                    return self._start('PrintWindow')
                except WindowStateError:
                    self.close()
                    raise
                except Exception as fallback_error:
                    self._event('PrintWindow', 'failed', fallback_error)
            self.close()
            raise RuntimeError('截图后端失败且备用PrintWindow/GDI不可用, 已停止; 请重新连接') from error

    def close(self):
        self.controller = None
        self.closed = True
