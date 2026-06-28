from comfy_api.latest import io

from .constants import MAIN_CATEGORY
from .any_type import ANY_TYPE, AnyType


class ExtractInfo(io.ComfyNode):
    """
    Attempts to extract common useful metadata (name, type, device, architecture)
    from any ComfyUI object and outputs them as separate strings.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ExtractInfo",
            display_name="Extract Info",
            category=f"{MAIN_CATEGORY}/utils",
            inputs=[
                AnyType.Input("any_object"),
            ],
            outputs=[
                io.String.Output("object_name"),
                io.String.Output("object_type"),
                io.String.Output("object_device"),
                io.String.Output("object_architecture"),
            ],
        )

    @classmethod
    def execute(cls, any_object, **kwargs) -> io.NodeOutput:
        """
        Extract multiple pieces of information from an object.
        """
        name = "unknown"
        obj_type = type(any_object).__name__
        device = "unknown"
        architecture = "unknown"

        # 1. Extract Name
        if isinstance(any_object, (str, int, float, bool)):
            name = str(any_object)
        else:
            for attr in ["name", "filename", "model_name", "title", "file"]:
                if hasattr(any_object, attr):
                    val = getattr(any_object, attr)
                    if isinstance(val, (str, int, float)):
                        name = str(val)
                        break
            if name == "unknown":
                name = obj_type

        # 2. Extract Device (Location)
        for attr in ["device", "current_device", "load_device"]:
            if hasattr(any_object, attr):
                device = str(getattr(any_object, attr))
                break

        # 3. Extract Architecture
        if hasattr(any_object, "model") and hasattr(any_object.model, "__class__"):
            architecture = any_object.model.__class__.__name__
        elif hasattr(any_object, "first_stage_model") and hasattr(any_object.first_stage_model, "__class__"):
            architecture = any_object.first_stage_model.__class__.__name__
        elif hasattr(any_object, "cond_stage_model") and hasattr(any_object.cond_stage_model, "__class__"):
            architecture = any_object.cond_stage_model.__class__.__name__

        # In V3, outputs are passed as positional arguments
        return io.NodeOutput(name, obj_type, device, architecture)


# from comfy_api.latest import io
#
# from .constants import MAIN_CATEGORY
# from .multi_preview_any import ANY_TYPE
#
#
# class ExtractInfo(io.ComfyNode):
#     """
#     Attempts to extract common useful metadata (name, type, device, architecture)
#     from any ComfyUI object and outputs them as separate strings.
#     """
#
#     @classmethod
#     def define_schema(cls):
#         return {
#             "required": {
#                 "any_object": (ANY_TYPE,),
#             },
#         }
#
#     RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
#     RETURN_NAMES = ("object_name", "object_type", "object_device", "object_architecture")
#     FUNCTION = "extract"
#     CATEGORY = f"{MAIN_CATEGORY}/utils"
#
#     def extract(self, any_object):
#         """
#         Extract multiple pieces of information from an object.
#
#         Parameters
#         ----------
#         any_object : Any
#             The value to extract info from.
#
#         Returns
#         -------
#         tuple
#             Tuple containing (object_name, object_type, object_device, object_architecture) strings.
#         """
#         name = "unknown"
#         obj_type = type(any_object).__name__
#         device = "unknown"
#         architecture = "unknown"
#
#         # 1. Extract Name
#         if isinstance(any_object, (str, int, float, bool)):
#             name = str(any_object)
#         else:
#             for attr in ["name", "filename", "model_name", "title", "file"]:
#                 if hasattr(any_object, attr):
#                     val = getattr(any_object, attr)
#                     if isinstance(val, (str, int, float)):
#                         name = str(val)
#                         break
#             if name == "unknown":
#                 name = obj_type
#
#         # 2. Extract Device (Location)
#         for attr in ["device", "current_device", "load_device"]:
#             if hasattr(any_object, attr):
#                 device = str(getattr(any_object, attr))
#                 break
#
#         # 3. Extract Architecture
#         if hasattr(any_object, "model") and hasattr(any_object.model, "__class__"):
#             architecture = any_object.model.__class__.__name__
#         elif hasattr(any_object, "first_stage_model") and hasattr(any_object.first_stage_model, "__class__"):
#             architecture = any_object.first_stage_model.__class__.__name__
#         elif hasattr(any_object, "cond_stage_model") and hasattr(any_object.cond_stage_model, "__class__"):
#             architecture = any_object.cond_stage_model.__class__.__name__
#
#         return name, obj_type, device, architecture
