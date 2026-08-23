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
    # --- Portrait Formats ---
    "9:32 (Super Ultrawide)": (9, 32),
    "1:3 (Tall Panorama)": (1, 3),
    "9:24 (Full-Frame)": (9, 24),
    "1:2.39 (35mm Anamorphic)": (1, 2.39),
    "9:21 (Ultrawide Portrait)": (9, 21),
    "9:19.5 (Smartphone)":(9, 19.5),
    "1:1.91 (Social Feed)": (1, 1.91),
    "1:1.85 (American Widescreen)": (1, 1.85),
    "9:16 (Tall Portrait)": (9, 16),
    "10:16 (Golden Ratio)": (10, 16),
    "5:8 (Golden Ratio)": (5, 8),
    "2:3 (Medium Portrait)": (2, 3),
    "5:7 (International Portrait)": (5, 7),
    "3:4 (Standard Portrait)": (3, 4),
    "4:5 (Canvas Portrait)": (4, 5),
    # --- Square Formats ---
    "1:1 (Square)": (1, 1),
    # --- Landscape Formats ---
    "5:4 (Canvas Format)": (5, 4),
    "4:3 (Standard Format)": (4, 3),
    "7:5 (International Print)": (7, 5),
    "3:2 (Medium Landscape)": (3, 2),
    "8:5 (Golden Ratio)": (8, 5),
    "16:10 (Golden Ratio)": (16, 10),
    "16:9 (Widescreen)": (16, 9),
    "1.85:1 (American Widescreen)": (1.85, 1),
    "1.91:1 (Social Feed)": (1.91, 1),
    "19.5:9 (Smartphone)": (19.5, 9),
    "21:9 (Ultrawide)": (21, 9),
    "2.39:1 (35mm Anamorphic)": (2.39, 1),
    "24:9 (Full-Frame)": (24,9),
    "3:1 (Panorama)": (3, 1),
    "32:9 (Super Ultrawide)": (32, 9),
}
MULTIPLE = [1, 8, 16, 32, 64, 128, 256]

PIXELS_PER_MEGAPIXEL = 1024 * 1024

CUSTOM_PRESET_LABEL = "Custom (use megapixels slider)"

# label -> reference (width, height) used only to derive a target pixel count.
# The actual output shape still comes from the aspect_ratio input - e.g. "4K UHD"
# gives the real 3840x2160 at 16:9, but the same pixel budget (~8.29 MP) at 1:1
# becomes a ~2880x2880 square. None is the sentinel for "use the megapixels slider".
RESOLUTION_PRESETS: dict[str, tuple[int, int] | None] = {
    CUSTOM_PRESET_LABEL: None,
    "SD (480p)": (640, 480),
    "HD (720p)": (1280, 720),
    "FHD (1080p)": (1920, 1080),
    "QHD (1440p)": (2560, 1440),
    "4K (2160p)": (3840, 2160),
    "8K (4320p)": (7680, 4320),
}


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
                    "preset",
                    options=list(RESOLUTION_PRESETS.keys()),
                    default="HD (720p)",
                ),
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
                io.String.Input(
                    "aspect_ratio_override",
                    optional=True,
                    force_input=True,
                    tooltip=(
                        "Optional: connect a STRING (e.g. another instance's "
                        "aspect_ratio_string output) to override the aspect_ratio "
                        "dropdown above."
                    ),
                ),
                io.Int.Input(
                    "multiple_override",
                    optional=True,
                    force_input=True,
                    tooltip=(
                        "Optional: connect an INT (e.g. another instance's multiple_out output) to override the multiple dropdown above."
                    ),
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
    def execute(
        cls,
        preset: str,
        aspect_ratio: str,
        megapixels: float,
        multiple: int,
        aspect_ratio_override: str = None,
        multiple_override: int = None,
    ) -> io.NodeOutput:
        if aspect_ratio_override:
            if aspect_ratio_override not in ASPECT_RATIOS:
                raise ValueError(
                    f"aspect_ratio_override {aspect_ratio_override!r} is not a "
                    f"known aspect ratio label. Valid options: {list(ASPECT_RATIOS)}"
                )
            aspect_ratio = aspect_ratio_override

        if multiple_override is not None:
            if multiple_override <= 0:
                raise ValueError("multiple_override must be a positive integer.")
            multiple = multiple_override

        ratio_width, ratio_height = ASPECT_RATIOS[aspect_ratio]
        aspect_ratio_float = ratio_width / ratio_height

        preset_reference = RESOLUTION_PRESETS[preset]
        if preset_reference is not None:
            reference_width, reference_height = preset_reference
            megapixels = (reference_width * reference_height) / PIXELS_PER_MEGAPIXEL

        target_pixel_count = megapixels * PIXELS_PER_MEGAPIXEL
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
