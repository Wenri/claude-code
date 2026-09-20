"""Verify that cached/downloaded packages and sysroot links remain isolated."""

import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location("matrix", Path(__file__).with_name("matrix.py"))
matrix = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(matrix)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = Path(self.directory.name)
        self.package = ("package.deb", hashlib.sha256(b"verified package").hexdigest())

    def test_cached_packages_are_verified_without_network(self):
        archive = self.cache / "downloads" / self.package[0]
        archive.parent.mkdir()
        archive.write_bytes(b"verified package")
        with mock.patch.object(matrix.urllib.request, "urlopen") as network:
            self.assertEqual(matrix.download(self.package, self.cache), archive)
            archive.write_bytes(b"corrupt cache")
            with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
                matrix.download(self.package, self.cache)
        network.assert_not_called()

    def test_failed_verification_does_not_publish_download(self):
        with mock.patch.object(matrix.urllib.request, "urlopen",
                               return_value=io.BytesIO(b"unexpected contents")):
            with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
                matrix.download(self.package, self.cache)
        self.assertEqual(list((self.cache / "downloads").iterdir()), [])

    def test_verified_download_is_cached(self):
        with mock.patch.object(matrix.urllib.request, "urlopen",
                               return_value=io.BytesIO(b"verified package")):
            archive = matrix.download(self.package, self.cache)
        self.assertEqual(archive.read_bytes(), b"verified package")

    def test_absolute_sysroot_links_do_not_resolve_to_host(self):
        library = self.cache / "lib" / "libpthread.so.0"
        library.parent.mkdir()
        library.write_bytes(b"sysroot library")
        link = self.cache / "usr" / "lib" / "libpthread.so"
        link.parent.mkdir(parents=True)
        link.symlink_to("/lib/libpthread.so.0")
        relative = link.with_name("relative.so")
        relative.symlink_to("libpthread.so")
        matrix.localize_symlinks(self.cache)
        self.assertEqual(link.resolve(), library)
        self.assertEqual(relative.resolve(), library)
        self.assertEqual(relative.read_bytes(), b"sysroot library")


if __name__ == "__main__":
    unittest.main()
