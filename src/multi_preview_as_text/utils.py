import json
from contextlib import suppress


def human_readable_repr(value) -> str:
    """
    Serialize any value into a human-readable string for the UI.

    Parameters
    ----------
    value : Any
        The value to serialize.

    Returns
    -------
    str
        A formatted string representation of the value.
    """
    # Handle dicts and lists first using standard JSON
    if isinstance(value, (dict, list)):
        with suppress(Exception):
            return json.dumps(value, indent=2, default=lambda o: f"<{type(o).__name__}>")
        return str(value)

    # Handle primitive types
    if isinstance(value, (str, int, float, bool, type(None))):
        return str(value)

    # Handle PyTorch Tensors (Images, Latents, Masks)
    if hasattr(value, "shape") and hasattr(value, "dtype"):
        try:
            shape = tuple(value.shape)
            device = getattr(value, "device", "unknown")
            return f"{type(value).__name__}\nShape: {shape}\nDtype: {value.dtype}\nDevice: {device}"
        except Exception:
            pass

    # Handle complex ComfyUI objects (Models, VAEs, CLIPs)
    info = {"Type": type(value).__name__}

    keys_to_check = ["name", "device", "current_device", "load_device"]
    for key in keys_to_check:
        if hasattr(value, key):
            val = getattr(value, key)
            info[key.replace("_", " ").title()] = str(val)

    # Dig into ComfyUI's specific architectures
    if hasattr(value, "model") and hasattr(value.model, "__class__"):
        info["Architecture"] = value.model.__class__.__name__
    elif hasattr(value, "first_stage_model") and hasattr(value.first_stage_model, "__class__"):
        info["Architecture"] = value.first_stage_model.__class__.__name__
    elif hasattr(value, "cond_stage_model") and hasattr(value.cond_stage_model, "__class__"):
        info["Architecture"] = value.cond_stage_model.__class__.__name__

    # If we didn't find specific Comfy attributes, fetch some safe public properties
    if len(info) == 1:
        safe_attrs = {}
        for attr in dir(value):
            if not attr.startswith("_"):
                try:
                    val = getattr(value, attr)
                    # Only grab primitive properties to prevent deep recursion
                    if isinstance(val, (str, int, float, bool)):
                        safe_attrs[attr] = val
                except Exception:
                    pass
        if safe_attrs:
            info["Attributes"] = safe_attrs

    try:
        return json.dumps(info, indent=2)
    except Exception:
        return f"{info['Type']}\n{str(value)}"
