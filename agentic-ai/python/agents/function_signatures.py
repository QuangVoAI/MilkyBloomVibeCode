"""
Function signature validator - Prevent parameter mismatch bugs
"""
import inspect
from typing import Callable

def validate_call(func: Callable, **kwargs) -> dict:
    """
    Validate kwargs against function signature before calling.
    Returns: (is_valid, missing_params, extra_params, validated_kwargs)
    """
    sig = inspect.signature(func)
    params = sig.parameters
    
    missing = []
    extra = []
    validated = {}
    
    # Check required params
    for param_name, param in params.items():
        if param_name == 'self':
            continue
        if param.default == inspect.Parameter.empty and param_name not in kwargs:
            # Required param missing
            if param.kind not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD):
                missing.append(param_name)
        elif param_name in kwargs:
            validated[param_name] = kwargs[param_name]
    
    # Check extra params
    for key in kwargs:
        if key not in params:
            extra.append(key)
    
    return {
        "valid": len(missing) == 0 and len(extra) == 0,
        "missing": missing,
        "extra": extra,
        "validated_kwargs": validated
    }

# Usage example:
# validation = validate_call(my_func, param1="value", param2="value", wrong_param="oops")
# if not validation["valid"]:
#     raise TypeError(f"Missing: {validation['missing']}, Extra: {validation['extra']}")
