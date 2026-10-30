"""Exercise the production execute method using a minimal external Comfy API stub."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'src/multi_preview_as_text'


class NodeOutput:
    def __init__(self, *values, ui):
        self.result = values
        self.ui = ui


class PreviewPayloadTest(unittest.TestCase):
    def test_structured_entries_preserve_content_and_passthrough(self):
        modules_patch = patch.dict(sys.modules)
        modules_patch.start()
        self.addCleanup(modules_patch.stop)
        package = types.ModuleType('preview_test_package')
        package.__path__ = [str(ROOT)]
        sys.modules[package.__name__] = package
        latest = types.ModuleType('comfy_api.latest')
        latest.io = types.SimpleNamespace(ComfyNode=object, NodeOutput=NodeOutput)
        sys.modules['comfy_api'] = types.ModuleType('comfy_api')
        sys.modules['comfy_api.latest'] = latest
        any_type = types.ModuleType('preview_test_package.any_type')
        any_type.AnyType = str
        sys.modules[any_type.__name__] = any_type
        spec = importlib.util.spec_from_file_location('preview_test_package.multi_preview_any', ROOT / 'multi_preview_any.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        node = module.MultiPreviewAny
        node.hidden = types.SimpleNamespace(unique_id='252', prompt={
            '252': {'inputs': {'source_0': ['242', 0], 'source_1': ['243', 0]}},
            '242': {'_meta': {'title': 'Text'}, 'class_type': 'String'},
            '243': {'_meta': {'title': 'Audio'}, 'class_type': 'Audio'},
        })
        content = '  first line\n\n---\n\n[source_9 | This is user text]\nlast line  \n'
        result = node.execute(source_0=content, source_1={'sample_rate': 24000})
        self.assertEqual(result.result[0], content)
        self.assertEqual(len(result.ui['entries']), 2)
        self.assertEqual(result.ui['entries'][0]['text'], content)
        self.assertEqual(result.ui['entries'][0]['header'], '[source_0 | Text (#242) › slot 0 | TYPE: str ]')
        self.assertEqual(result.ui['entries'][1]['text'], '{\n  "sample_rate": 24000\n}')
        self.assertIn(content, result.ui['text'][0])


if __name__ == '__main__':
    unittest.main()
