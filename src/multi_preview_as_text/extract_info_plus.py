from comfy_api.latest import ComfyExtension, io

from .constants import MAIN_CATEGORY
from .any_type import ANY_TYPE, AnyType


def _norm(v):
    if isinstance(v, list) and v:
        return v[0]
    return v


class ExtractInfoPlus(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        # V3 explicitly defines all schema details via io.Schema instead of class properties
        return io.Schema(
            node_id="ExtractInfoPlus",
            display_name="Extract Info Plus",
            category=f"{MAIN_CATEGORY}/utils",
            inputs=[
                AnyType.Input("any_object"),
            ],
            outputs=[
                io.String.Output("model_name"),
                io.String.Output("sampler_name"),
                io.String.Output("scheduler"),
                io.String.Output("steps"),
                io.String.Output("cfg"),
                io.String.Output("denoise"),
                io.String.Output("seed"),
                io.String.Output("upstream_type"),
            ],
            hidden=[
                # Request the execution graph and the node's unique ID directly
                io.Hidden.unique_id,
                io.Hidden.prompt,
            ],
        )

    # In V3, the execution method is always a classmethod named "execute"
    @classmethod
    def execute(cls, any_object, **kwargs) -> io.NodeOutput:
        # Hidden values are now cleanly accessed via cls.hidden instead of kwargs
        my_node_id = cls.hidden.unique_id
        prompt_data = cls.hidden.prompt

        if not prompt_data or my_node_id is None or my_node_id not in prompt_data:
            return io.NodeOutput(*(["unknown"] * 8))

        # Retrieve the current node's configuration from the prompt data
        my_node_info = prompt_data[my_node_id]
        my_inputs = my_node_info.get("inputs", {})

        # Connections in the execution prompt dict are natively passed as lists: [upstream_node_id, output_index]
        any_obj_link = my_inputs.get("any_object")

        upstream_id = None
        if isinstance(any_obj_link, list) and len(any_obj_link) >= 1:
            upstream_id = str(any_obj_link[0])

        if not upstream_id or upstream_id not in prompt_data:
            return io.NodeOutput(*(["unknown"] * 8))

        # Fetch the upstream node
        upstream_node = prompt_data[upstream_id]
        inputs = upstream_node.get("inputs", {})
        upstream_type = upstream_node.get("class_type", "unknown")

        # --- MODEL NAME (supports Diffusion Model loader) ---
        model_name = (
            _norm(inputs.get("unet_name"))
            or _norm(inputs.get("ckpt_name"))
            or _norm(inputs.get("model_name"))
            or _norm(inputs.get("vae_name"))
            or _norm(inputs.get("clip_name"))
            or "unknown"
        )

        # --- SAMPLER SETTINGS ---
        sampler_name = _norm(inputs.get("sampler_name", "unknown"))
        scheduler = _norm(inputs.get("scheduler", "unknown"))
        steps = str(_norm(inputs.get("steps", "unknown")))
        cfg = str(_norm(inputs.get("cfg", "unknown")))
        denoise = str(_norm(inputs.get("denoise", "unknown")))
        seed = str(_norm(inputs.get("seed", "unknown")))

        # In V3, return outputs positionally through the NodeOutput wrapper
        return io.NodeOutput(
            str(model_name),
            str(sampler_name),
            str(scheduler),
            steps,
            cfg,
            denoise,
            seed,
            upstream_type,
        )


# from comfy_api.latest import io
#
# from .constants import MAIN_CATEGORY
# from .multi_preview_any import ANY_TYPE
#
#
# def _norm(v):
#     if isinstance(v, list) and v:
#         return v[0]
#     return v
#
#
# class ExtractInfoPlus(io.ComfyNode):
#     @classmethod
#     def define_schema(cls):
#         return {
#             "required": {
#                 "any_object": (ANY_TYPE,),
#             }
#         }
#
#     RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
#
#     RETURN_NAMES = ("model_name", "sampler_name", "scheduler", "steps", "cfg", "denoise", "seed", "upstream_type")
#
#     FUNCTION = "extract"
#     CATEGORY = f"{MAIN_CATEGORY}/utils"
#
#     def extract(self, any_object, **kwargs):
#         graph = kwargs.get("extra_data", {}).get("graph")
#         my_node_id = kwargs.get("node_id")
#
#         if not graph or my_node_id is None:
#             return ("unknown",) * 8
#
#         # Find upstream node
#         upstream_id = None
#         for link in graph["links"]:
#             if link["dst"] == my_node_id and link["dst_input"] == "any_object":
#                 upstream_id = link["src"]
#                 break
#
#         if upstream_id is None:
#             return ("unknown",) * 8
#
#         upstream_node = graph["nodes"][upstream_id]
#         inputs = upstream_node.get("inputs", {})
#         upstream_type = upstream_node.get("class_type", "unknown")
#
#         # --- MODEL NAME (supports Diffusion Model loader) ---
#         model_name = (
#             _norm(inputs.get("unet_name"))
#             or _norm(inputs.get("ckpt_name"))
#             or _norm(inputs.get("model_name"))
#             or _norm(inputs.get("vae_name"))
#             or _norm(inputs.get("clip_name"))
#             or "unknown"
#         )
#
#         # --- SAMPLER SETTINGS ---
#         sampler_name = _norm(inputs.get("sampler_name", "unknown"))
#         scheduler = _norm(inputs.get("scheduler", "unknown"))
#         steps = str(_norm(inputs.get("steps", "unknown")))
#         cfg = str(_norm(inputs.get("cfg", "unknown")))
#         denoise = str(_norm(inputs.get("denoise", "unknown")))
#         seed = str(_norm(inputs.get("seed", "unknown")))
#
#         return (
#             str(model_name),
#             str(sampler_name),
#             str(scheduler),
#             steps,
#             cfg,
#             denoise,
#             seed,
#             upstream_type,
#         )
