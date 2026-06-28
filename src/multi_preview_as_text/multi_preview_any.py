from comfy_api.latest import io
from .any_type import AnyType
from .constants import MAIN_CATEGORY
from .utils import human_readable_repr


class MultiPreviewAny(io.ComfyNode):
    """
    Preview node that accepts a dynamic number of inputs of any type,
    renders them as formatted text, and provides them as passthrough outputs.
    """

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MultiPreviewAny",
            display_name="Multi Preview Any",
            category=f"{MAIN_CATEGORY}/utils",
            is_output_node=True,
            inputs=[
                AnyType.Input("source_0", optional=True),
            ],
            outputs=[AnyType.Output(f"source_{i}") for i in range(100)],
            hidden=[
                io.Hidden.prompt,
                io.Hidden.unique_id,
            ],
        )

    @classmethod
    def execute(cls, **kwargs) -> io.NodeOutput:
        """
        Process inputs and format them for UI preview.
        """
        if not kwargs:
            return io.NodeOutput(*[], ui={"text": ("(no inputs connected)",)})

        prompt_data = cls.hidden.prompt
        my_node_id = cls.hidden.unique_id

        my_node_info = prompt_data.get(my_node_id, {})
        raw_inputs = my_node_info.get("inputs", {})

        source_pairs = []
        max_index = -1

        for key, value in kwargs.items():
            if key.startswith("source_"):
                try:
                    idx = int(key.split("_")[1])
                    source_pairs.append((idx, key, value))
                    if idx > max_index:
                        max_index = idx
                except ValueError:
                    continue

        source_pairs.sort(key=lambda x: x[0])

        values = [None] * (max_index + 1)
        output_lines = []

        for idx, key, value in source_pairs:
            values[idx] = value

            # Build the rich header string
            header = f"[{key}]"
            link_info = raw_inputs.get(key)

            if isinstance(link_info, list) and len(link_info) >= 2:
                upstream_id = str(link_info[0])
                upstream_slot = link_info[1]

                upstream_node = prompt_data.get(upstream_id)
                if upstream_node:
                    node_title = upstream_node.get("_meta", {}).get("title", upstream_node.get("class_type", "unknown"))
                    type_str = type(value).__name__
                    header = f"[{key} | {node_title} (#{upstream_id}) › slot {upstream_slot} | TYPE: {type_str} ]"

            serialized = human_readable_repr(value)
            output_lines.append(f"{header}\n\n{serialized}")

        display_text = "\n\n---\n\n".join(output_lines) if output_lines else "(no inputs connected)"

        return io.NodeOutput(*values, ui={"text": (display_text,)})
# from comfy_api.latest import ComfyExtension, io
#
# from .any_type import AnyType
# from .constants import MAIN_CATEGORY
# from .utils import human_readable_repr
#
# ANY_TYPE = AnyType("*")
#
#
# class MultiPreviewAny(io.ComfyNode):
#     """
#     Preview node that accepts a dynamic number of inputs of any type,
#     renders them as formatted text, and provides them as passthrough outputs.
#     """
#
#     @classmethod
#     def define_schema(cls) -> io.Schema:
#         return io.Schema(
#             node_id="MultiPreviewAny",
#             display_name="Multi Preview Any",
#             category=f"{MAIN_CATEGORY}/utils",
#             is_output_node=True,
#             inputs=[
#                 AnyType.Input(
#                     "source_0",
#                     optional=True,
#                 ),
#             ],
#             outputs=[AnyType.Output(f"source_{i}") for i in range(100)],
#             hidden=[
#                 # Ask for the graph prompt to resolve upstream labels
#                 io.Hidden.prompt,
#                 io.Hidden.unique_id,
#             ],
#         )
#
#     @classmethod
#     def execute(cls, **kwargs) -> io.NodeOutput:
#         """
#         Process inputs and format them for UI preview.
#         """
#         if not kwargs:
#             # Returns an empty output with the UI payload
#             return io.NodeOutput(ui={"text": ("(no inputs connected)",)})
#         prompt_data = cls.hidden.prompt
#         my_node_id = cls.hidden.unique_id
#
#         # Get our raw node info to see where links are coming from
#         my_node_info = prompt_data.get(my_node_id, {})
#         raw_inputs = my_node_info.get("inputs", {})
#
#         source_pairs = []
#         max_index = -1
#
#         for key, value in kwargs.items():
#             if key.startswith("source_"):
#                 try:
#                     idx = int(key.split("_")[1])
#                     source_pairs.append((idx, key, value))
#                     if idx > max_index:
#                         max_index = idx
#                 except ValueError:
#                     continue
#
#         source_pairs.sort(key=lambda x: x[0])
#
#         values = [None] * (max_index + 1)
#         output_lines = []
#
#         for idx, key, value in source_pairs:
#             values[idx] = value
#
#             # --- Resolve Frontend-style Labels for the JS file! ---
#             header = f"[{key}]"
#
#             link_info = raw_inputs.get(key)
#             # link_info looks like: ["UpstreamNodeID", output_slot_index]
#             if isinstance(link_info, list) and len(link_info) >= 2:
#                 upstream_id = str(link_info[0])
#                 upstream_slot = link_info[1]
#
#                 upstream_node = prompt_data.get(upstream_id)
#                 if upstream_node:
#                     # Try to get the friendly title, fallback to the class type
#                     node_title = upstream_node.get("_meta", {}).get("title", upstream_node.get("class_type", "unknown"))
#                     type_str = type(value).__name__
#
#                     # This exactly matches the regex your JS file is looking for!
#                     header = f"[{key} | {node_title} (#{upstream_id}) › slot {upstream_slot} | TYPE: {type_str} ]"
#
#             serialized = human_readable_repr(value)
#             output_lines.append(f"{header}\n\n{serialized}")
#
#         display_text = "\n\n---\n\n".join(output_lines) if output_lines else "(no inputs connected)"
#
#         # In V3, returned outputs are passed as positional arguments to io.NodeOutput
#         return io.NodeOutput(*values, ui={"text": (display_text,)})
#
#     @classmethod
#     def validate_inputs(cls, **kwargs) -> bool | str:
#         return True
#
#
# # from comfy_api.latest import io
# # from .any_type import AnyType
# # from .constants import MAIN_CATEGORY
# # from .utils import human_readable_repr
# #
# # ANY_TYPE = AnyType("*")
# # # Socket-only multi-type input (no widget)
# # # ANY_TYPE = io.MultiType.Input("input", types=io.AnyType)
# #
# # class MultiPreviewAny(io.ComfyNode):
# #     """
# #     Preview node that accepts a dynamic number of inputs of any type,
# #     renders them as formatted text, and provides them as passthrough outputs.
# #     """
# #
# #     @classmethod
# #     def define_schema(cls):
# #         return {
# #             "required": {},
# #             "optional": {
# #                 "source_0": (ANY_TYPE,),
# #             },
# #         }
# #
# #     # Generous buffer of outputs to satisfy ComfyUI's graph validator when generating downstream
# #     RETURN_TYPES = tuple([ANY_TYPE] * 100)
# #     RETURN_NAMES = tuple([f"source_{i}" for i in range(100)])
# #     OUTPUT_NODE = True
# #     FUNCTION = "notify"
# #     CATEGORY = f"{MAIN_CATEGORY}/utils"
# #
# #     def notify(self, **kwargs):
# #         """
# #         Process inputs and format them for UI preview.
# #
# #         Parameters
# #         ----------
# #         **kwargs : dict
# #             All connected source_N inputs, collected dynamically.
# #
# #         Returns
# #         -------
# #         dict
# #             Contains "ui" update and standard "result" passthrough outputs.
# #         """
# #         if not kwargs:
# #             return {"ui": {"text": ("(no inputs connected)",)}, "result": tuple()}
# #
# #         # We need to find the max index to ensure our passthrough tuple accurately maps to outputs
# #         source_pairs = []
# #         max_index = -1
# #         for key, value in kwargs.items():
# #             if key.startswith("source_"):
# #                 idx = int(key.split("_")[1])
# #                 source_pairs.append((idx, key, value))
# #                 if idx > max_index:
# #                     max_index = idx
# #
# #         source_pairs.sort(key=lambda x: x[0])
# #
# #         # Pad the tuple with None for unconnected intermediate slots to ensure downstream nodes get the correct item
# #         values = [None] * (max_index + 1)
# #         output_lines = []
# #
# #         for idx, key, value in source_pairs:
# #             values[idx] = value
# #             serialized = human_readable_repr(value)
# #             output_lines.append(f"[{key}]\n{serialized}")
# #
# #         display_text = "\n\n---\n\n".join(output_lines) if output_lines else "(no inputs connected)"
# #
# #         # "result" provides the tuple values for actual node execution flow
# #         return {"ui": {"text": (display_text,)}, "result": tuple(*values)}
# #
# #     @classmethod
# #     def VALIDATE_INPUTS(s, input_types):
# #         return True
