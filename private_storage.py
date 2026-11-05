"""Owner-only files; fail closed when permissions cannot be applied."""
import os
import stat
from pathlib import Path
from runtime import run_process

_directories = set()


def protect(target, directory):
    info = os.lstat(target)
    if stat.S_ISLNK(info.st_mode) or (getattr(info, "st_file_attributes", 0) & 0x400) or (not directory and (info.st_nlink != 1 or not stat.S_ISREG(info.st_mode))):
        raise ValueError("Refusing linked private storage")
    if os.name == "nt":
        run_process(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(Path(__file__).parent / "scripts/private-acl.ps1"), "-Target", target],
                    timeout=10, check=True, capture_output=True, creationflags=0x08000000)
    else:
        if info.st_uid != os.getuid():
            raise ValueError("Private storage must belong to the current user")
        os.chmod(target, 0o700 if directory else 0o600)


def private_file(directory, name, create=False):
    directory = os.path.abspath(directory)
    if directory not in _directories:
        os.makedirs(directory, mode=0o700, exist_ok=True)
        protect(directory, True)
        _directories.add(directory)
    target = os.path.join(directory, name)
    if os.path.dirname(target) != directory:
        raise ValueError("Invalid private storage name")
    if create:
        try:
            protect(target, False)
        except FileNotFoundError:
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
            os.close(fd)
    try:
        protect(target, False)
    except FileNotFoundError:
        pass
    return target
