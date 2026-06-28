from typing import TYPE_CHECKING

from comfy_api.latest import io, ui

from .any_type import ANY_TYPE, AnyType
from .constants import MAIN_CATEGORY, NODES_PREFIX
from .utils import human_readable_repr

if TYPE_CHECKING:
    from comfy_api.latest import io, ui


class AnyToString(io.ComfyNode):
    """Convert any ComfyUI type into a string representation."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        """Defines required inputs."""
        return io.Schema(
            node_id="AnyToString",
            display_name=f"{NODES_PREFIX} Any To String",
            category=f"{MAIN_CATEGORY}/utils",
            description="Convert any ComfyUI type into a string representation.",
            inputs=[AnyType.Input("any_value")],
            outputs=[io.String.Output("string")],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, any_value) -> io.NodeOutput:
        """
        Convert input to string.

        Parameters
        ----------
        any_value : Any
            The value to serialize.

        Returns
        -------
        io.NodeOutput
            Contains the serialized string for downstream nodes and UI preview.
        """
        result_str = human_readable_repr(any_value)

        # Fixed: ui.PreviewText must be instantiated with the text you want to display
        return io.NodeOutput(result_str, ui=ui.PreviewText(result_str))


# from typing import TYPE_CHECKING
#
# from comfy_api.latest import io, ui
#
# from .constants import MAIN_CATEGORY, NODES_PREFIX
# from .multi_preview_any import ANY_TYPE
# from .utils import human_readable_repr
#
# if TYPE_CHECKING:
#     from latest import io, ui
#
# class AnyToString(io.ComfyNode):
#     """Convert any ComfyUI type into a string representation."""
#
#     @classmethod
#     def define_schema(cls) -> io.Schema:
#         """Defines required inputs."""
#         return io.Schema(
#             node_id="AnyToString",
#             display_name=f"{NODES_PREFIX} Any To String",
#             category=f"{MAIN_CATEGORY}/utils",
#             description="Convert any ComfyUI type into a string representation.",
#             inputs=[io.Custom("any_value").Input(ANY_TYPE)],
#             outputs=[io.String.Output()],
#             is_output_node=True,
#         )
#
#     #
#     # RETURN_TYPES = ("STRING",)
#     # FUNCTION = "convert"
#     # CATEGORY = f"{MAIN_CATEGORY}/utils"
#     @classmethod
#     def execute(cls, any_value) -> io.NodeOutput:
#         """
#         Convert input to string.
#
#         Parameters
#         ----------
#         any_value : Any
#             The value to serialize.
#
#         Returns
#         -------
#         tuple
#             Tuple containing the serialized string.
#         """
#         return io.NodeOutput(human_readable_repr(any_value), ui=ui.PreviewText)
#         # return (human_readable_repr(any_value),)
