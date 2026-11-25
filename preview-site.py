"""Serve this folder locally and open the website in the default browser."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser
from threading import Timer

directory = Path(__file__).resolve().parent
handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
if "--check" in sys.argv:
    print(f"Preview ready with Python {sys.version.split()[0]}.")
    raise SystemExit(0)
preferred_port = 8771
try:
    server = ThreadingHTTPServer(("127.0.0.1", preferred_port), handler)
except OSError as error:
    if getattr(error, "winerror", None) != 10048 and error.errno != 98:
        raise
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)

with server:
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/index.html"
    print(f"Website: {url}", flush=True)
    print(f"Staff tools: http://127.0.0.1:{port}/staff.html", flush=True)
    print("Keep this window open while using the site. Close it when finished.", flush=True)
    if "--no-browser" not in sys.argv:
        Timer(0.3, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

