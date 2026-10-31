import sys, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
class S(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
port = int(sys.argv[1]); root = sys.argv[2]
S(("127.0.0.1", port), functools.partial(Q, directory=root)).serve_forever()
