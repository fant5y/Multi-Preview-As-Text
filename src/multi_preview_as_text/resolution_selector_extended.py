"""Resolution Selector node that also exposes its selector values as outputs.

Reimplements ComfyUI's built-in ResolutionSelector (aspect_ratio + megapixels,
rounded to the nearest multiple) and additionally outputs aspect_ratio,
megapixels, and multiple so they can be reused by downstream nodes.
"""

import math

from comfy_api.latest import ComfyExtension, io
from typing_extensions import override

from .constants import MAIN_CATEGORY

# label -> (ratio_width, ratio_height)
ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1 (Square)": (1, 1),
    "3:2 (Photo Format)": (3, 2),
    "4:3 (Standard Format)": (4, 3),
    "5:4 (Canvas Format)": (5, 4),
    "16:9 (Widescreen)": (16, 9),
    "21:9 (Ultrawide)": (21, 9),
    "3:1 (Panorama)": (3, 1),
    "2:3 (Medium Portrait)": (2, 3),
    "3:4 (Standard Portrait)": (3, 4),
    "4:5 (Canvas Portrait)": (4, 5),
    "9:16 (Tall Portrait)": (9, 16),
    "1:3 (Tall Panorama)": (1, 3),
}

MULTIPLE = [1, 8, 16, 32, 64, 128, 256]

PIXELS_PER_MEGAPIXEL = 1024 * 1024


class ResolutionSelectorExtended(io.ComfyNode):
    """Aspect-ratio/megapixel resolution calculator with extra passthrough outputs."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="ResolutionSelectorExtended",
            display_name="Resolution Selector - Extended Outputs",
            category=f"{MAIN_CATEGORY}/utils",
            description=(
                "Calculates width/height from an aspect ratio and target megapixels, "
                "rounded to the nearest multiple. Also outputs the selected "
                "aspect_ratio label, megapixels, and multiple as separate values."
            ),
            inputs=[
                io.Combo.Input(
                    "aspect_ratio",
                    options=list(ASPECT_RATIOS.keys()),
                    default="1:1 (Square)",
                ),
                io.Float.Input(
                    "megapixels",
                    default=1.0,
                    min=0.065,
                    max=32.0,
                    step=0.001,
                ),
                io.Combo.Input(
                    "multiple",
                    options=MULTIPLE,
                    default=32,
                ),
            ],
            outputs=[
                io.Int.Output("width"),
                io.Int.Output("height"),
                io.String.Output("aspect_ratio_string", display_name="aspect_ratio_string"),
                io.Float.Output("aspect_ratio_float", display_name="aspect_ratio_float"),
                io.Float.Output("megapixels_out", display_name="megapixels"),
                io.Int.Output("multiple_out", display_name="multiple"),
            ],
        )

    @classmethod
    def execute(cls, aspect_ratio: str, megapixels: float, multiple: int) -> io.NodeOutput:
        ratio_width, ratio_height = ASPECT_RATIOS[aspect_ratio]
        target_pixel_count = megapixels * PIXELS_PER_MEGAPIXEL
        aspect_ratio_float = ratio_width / ratio_height
        raw_height = math.sqrt(target_pixel_count * ratio_height / ratio_width)
        raw_width = raw_height * ratio_width / ratio_height

        width = cls._round_to_multiple(raw_width, multiple)
        height = cls._round_to_multiple(raw_height, multiple)

        return io.NodeOutput(width, height, aspect_ratio, aspect_ratio_float, megapixels, multiple)

    @staticmethod
    def _round_to_multiple(value: float, multiple: int) -> int:
        """Round a pixel dimension to the nearest multiple.

        Parameters
        ----------
        value : float
            Unrounded pixel dimension.
        multiple : int
            Multiple to round to (e.g. 8, 32, 64).

        Returns
        -------
        int
            `value` rounded to the nearest multiple, clamped to at least one multiple.
        """
        rounded = round(value / multiple) * multiple
        return max(multiple, int(rounded))


class ResolutionSelectorExtendedExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [ResolutionSelectorExtended]


# async def comfy_entrypoint() -> ResolutionSelectorExtendedExtension:
#     return ResolutionSelectorExtendedExtension()
