"""Shared storage primitives for file-backed sections."""

from .frontmatter import FrontmatterDocument, FrontmatterMarkdownCodec
from .plain_yaml import PlainYamlDocument, read_yaml_document, write_yaml_document
from .repository import SectionRepository

__all__ = [
    "FrontmatterDocument",
    "FrontmatterMarkdownCodec",
    "PlainYamlDocument",
    "SectionRepository",
    "read_yaml_document",
    "write_yaml_document",
]
