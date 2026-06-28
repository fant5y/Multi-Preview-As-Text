from comfy_api.latest import ComfyExtension, io

from .any_to_string import AnyToString
from .extract_info import ExtractInfo
from .extract_info_plus import ExtractInfoPlus
from .multi_preview_any import MultiPreviewAny


class MyCustomSuiteExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        # Return all nodes belonging to this package
        return [
            MultiPreviewAny,
            ExtractInfoPlus,
            ExtractInfo,
            AnyToString

        ]

# ComfyUI V3 will look for this exact function name to load your entire suite
async def comfy_entrypoint() -> ComfyExtension:
    return MyCustomSuiteExtension()

# from comfy_api.latest import ComfyExtension, io
# from .any_to_string import AnyToString
# from .extract_info import ExtractInfo
# from .extract_info_plus import ExtractInfoPlus
# from .multi_preview_any import MultiPreviewAny
#
# NODE_CLASS_MAPPINGS = {
#     # "MultiPreviewAny": MultiPreviewAny,
#     "ExtractInfoPlus": ExtractInfoPlus,
#     "AnyToString": AnyToString,
#     "ExtractInfo": ExtractInfo,
# }
#
# NODE_DISPLAY_NAME_MAPPINGS = {
#     # "MultiPreviewAny": "Preview as Text (Multi)",
#     "ExtractInfoPlus": "Extract Extended Info",
#     "AnyToString": "Any to String",
#     "ExtractInfo": "Extract Object Metadata",
# }
#
#
# # V3 replaces NODE_CLASS_MAPPINGS with an asynchronous extension entrypoint
# class MultiPreviewExtension(ComfyExtension):
#     async def get_node_list(self) -> list[type[io.ComfyNode]]:
#         return [MultiPreviewAny]
#
# async def comfy_entrypoint() -> ComfyExtension:
#     return MultiPreviewExtension()
#
# # V3 replaces NODE_CLASS_MAPPINGS with a ComfyExtension interface
# class ExtractInfoPlusExtension(ComfyExtension):
#     async def get_node_list(self) -> list[type[io.ComfyNode]]:
#         return [ExtractInfoPlus]
#
#
# async def comfy_entrypoint() -> ComfyExtension:
#     return ExtractInfoPlusExtension()
