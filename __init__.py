"""Top-level package for multi_preview_as_text."""

__all__ = [
    "comfy_entrypoint",
    "WEB_DIRECTORY",
]

__author__ = """Vroni"""
__email__ = "vroni@salala.de"
__version__ = "0.0.1"

# Import the V3 entry point from your nodes module
from .src.multi_preview_as_text.nodes import comfy_entrypoint

WEB_DIRECTORY = "./web/js"
# """Top-level package for multi_preview_as_text."""
#
# __all__ = [
#     "NODE_CLASS_MAPPINGS",
#     "NODE_DISPLAY_NAME_MAPPINGS",
#     "WEB_DIRECTORY",
# ]
#
# __author__ = """Vroni"""
# __email__ = "vroni@salala.de"
# __version__ = "0.0.1"
#
# from .src.multi_preview_as_text.nodes import NODE_CLASS_MAPPINGS
# from .src.multi_preview_as_text.nodes import NODE_DISPLAY_NAME_MAPPINGS
#
# WEB_DIRECTORY = "./web/js"
