import os, sys, time, subprocess, tempfile
lock = os.path.join(tempfile.gettempdir(), "interaction-lab-headless.lock")
start = time.time()
while True:
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode()); os.close(fd)
        break
    except FileExistsError:
        try:
            stale = time.time() - os.path.getmtime(lock) > 900
        except OSError:
            stale = False
        if stale:
            try: os.remove(lock)
            except OSError: pass
        time.sleep(2)
try:
    r = subprocess.run(sys.argv[1:])
finally:
    try:
        if open(lock).read().strip() == str(os.getpid()):
            os.remove(lock)
    except OSError:
        pass
sys.exit(r.returncode)
