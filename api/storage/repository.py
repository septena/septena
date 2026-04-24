"""Generic repository for one-file-per-record frontmatter sections."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Generic, Optional, Protocol, TypeVar

from api import logger
from api.cache import invalidate, parse_dir_cached

from .frontmatter import FrontmatterDocument, FrontmatterMarkdownCodec

T = TypeVar("T")


class FrontmatterSchema(Protocol[T]):
    glob: str
    allowed_fields: frozenset[str]

    def parse(self, path: Path, document: FrontmatterDocument) -> Optional[T]: ...

    def serialize(
        self,
        record: T,
        existing: FrontmatterDocument | None = None,
    ) -> FrontmatterDocument: ...

    def record_id(self, record: T) -> str | None: ...

    def record_day(self, record: T) -> str | None: ...

    def next_path(self, directory: Path, record: T) -> Path: ...

    def glob_for_day(self, day: str) -> str: ...


class SectionRepository(Generic[T]):
    def __init__(
        self,
        directory: Path,
        schema: FrontmatterSchema[T],
        codec: FrontmatterMarkdownCodec | None = None,
    ) -> None:
        self.directory = directory
        self.schema = schema
        self.codec = codec or FrontmatterMarkdownCodec()

    def _parse_path(self, path: Path) -> T | None:
        try:
            document = self.codec.read(path)
            return self.schema.parse(path, document)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Skipping malformed file %s: %s", path.name, exc)
            return None

    def list(self) -> list[T]:
        return parse_dir_cached(self.directory, self.schema.glob, self._parse_path)

    def list_day(self, day: str) -> list[T]:
        return [record for record in self.list() if self.schema.record_day(record) == day]

    def get_by_id(self, record_id: str, day: str | None = None) -> T | None:
        records = self.list_day(day) if day else self.list()
        for record in records:
            if self.schema.record_id(record) == record_id:
                return record
        return None

    def next_path(self, record: T) -> Path:
        return self.schema.next_path(self.directory, record)

    def write(self, record: T, path: Path | None = None) -> Path:
        target = path or self.next_path(record)
        existing = self.codec.read(target) if target.exists() else None
        document = self.schema.serialize(record, existing=existing)
        self.codec.write(target, document)
        invalidate(self.directory)
        return target

    def path_of(self, record_id: str, day: str | None = None) -> Path | None:
        """Locate the file backing a given record id. Used by callers that
        need to update in place without renaming the file."""
        if not self.directory.exists():
            return None
        glob = self.schema.glob_for_day(day) if day else self.schema.glob
        for path in sorted(self.directory.glob(glob)):
            try:
                record = self._parse_path(path)
            except Exception:
                continue
            if record is not None and self.schema.record_id(record) == record_id:
                return path
        return None

    def delete(self, record_id: str, day: str | None = None) -> bool:
        if not self.directory.exists():
            return False
        glob = self.schema.glob_for_day(day) if day else self.schema.glob
        for path in sorted(self.directory.glob(glob)):
            try:
                record = self._parse_path(path)
            except Exception:
                continue
            if record is not None and self.schema.record_id(record) == record_id:
                path.unlink()
                invalidate(self.directory)
                return True
        return False
