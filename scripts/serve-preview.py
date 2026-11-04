#!/usr/bin/env python3
"""Serve public assets only, on localhost, without stale module caching."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        for name in ('If-Modified-Since', 'If-None-Match'):
            if name in self.headers:
                del self.headers[name]
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4301)
    options = parser.parse_args()
    public = Path(__file__).resolve().parents[1] / 'dist'
    print(f'本机预览：http://127.0.0.1:{options.port}/#assistant', flush=True)
    print('保持此窗口开启；按 Ctrl+C 停止。原有线上平台不受影响。', flush=True)
    ThreadingHTTPServer(('127.0.0.1', options.port), partial(PreviewHandler, directory=str(public))).serve_forever()
