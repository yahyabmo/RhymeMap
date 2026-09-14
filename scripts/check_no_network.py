"""Run the test suite with every outbound connection blocked.

    python -m scripts.check_no_network

The song loader is network-bound by nature: YouTube, and a lyrics database. A
test that quietly reached either would be flaky in CI, slow, and dependent on a
third party's uptime -- and would pass locally for whoever wrote it, which is
how such a test survives review.

So the seams (`rhymemap.sources.youtube._import_yt_dlp` and
`rhymemap.sources.lrclib.fetch`) are substituted in tests, and this asserts that
they really are. Loopback is allowed: the server tests genuinely bind a socket.

Exits non-zero if any test fails *or* if anything tried to leave the machine.
"""

from __future__ import annotations

import ipaddress
import socket
import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex

_attempts: list = []


def _is_loopback(address) -> bool:
    try:
        host = address[0]
    except (TypeError, IndexError):
        return True                       # AF_UNIX and friends: not the network
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False                      # a hostname that is not localhost


def _guarded_connect(self, address, *args, **kwargs):
    if not _is_loopback(address):
        _attempts.append(address)
        raise OSError(f"blocked outbound connection to {address}")
    return _real_connect(self, address, *args, **kwargs)


def _guarded_connect_ex(self, address, *args, **kwargs):
    if not _is_loopback(address):
        _attempts.append(address)
        return 1
    return _real_connect_ex(self, address, *args, **kwargs)


def main(argv=None) -> int:
    socket.socket.connect = _guarded_connect
    socket.socket.connect_ex = _guarded_connect_ex

    suite = unittest.TestLoader().discover(
        str(PROJECT_ROOT / "tests"), top_level_dir=str(PROJECT_ROOT))
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    print()
    if _attempts:
        print(f"FAIL: {len(_attempts)} outbound connection(s) attempted:")
        for address in dict.fromkeys(map(str, _attempts)):
            print(f"  - {address}")
        print("\nSubstitute the network seam instead. See DOC_DEV.md section 5f.")
        return 1

    print(f"{result.testsRun} tests, no outbound connections attempted.")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
