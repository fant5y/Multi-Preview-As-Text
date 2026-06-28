from comfy_api.latest import io


# Using "*" tells the ComfyUI frontend to natively allow connections from any socket
@io.comfytype(io_type="*")
class AnyType(str):
    """Wildcard type that matches any ComfyUI type without raising mismatch errors."""

    # 'object' is a more accurate Python type hint for a wildcard than 'str'
    Type = object

    # Python-side fallbacks to ensure backend validation allows any connection
    def __ne__(self, other: object) -> bool:
        return False

    def __eq__(self, other: object) -> bool:
        return True

    class Input(io.Input):
        def __init__(self, id: str, **kwargs):
            super().__init__(id, **kwargs)

    class Output(io.Output):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)


# We can instantiate a constant for fallback usage, but it is less necessary now.
ANY_TYPE = AnyType("*")
# from comfy_api.latest import io
#
# @io.comfytype(io_type="AnyType")
# class AnyType(str):
#     """Wildcard type that matches any ComfyUI type without raising mismatch errors."""
#     Type = str
#
#     def __ne__(self, other: object) -> bool:
#         return False
#
#     class Input(io.Input):
#         def __init__(self, id: str, **kwargs):
#             super().__init__(id, **kwargs)
#
#     class Output(io.Output):
#         def __init__(self, **kwargs):
#             super().__init__(**kwargs)
