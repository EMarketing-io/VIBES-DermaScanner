from __future__ import annotations

import hashlib
import json
import os

from config import CACHE_FILE


def _image_hash(image_path):
    with open(image_path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

def _load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                cache = json.load(f)
                if not isinstance(cache, dict):
                    return {}
                return {
                    key: value
                    for key, value in cache.items()
                    if ":" in str(key) and isinstance(value, dict) and value.get("analysis_source") == "openai"
                }
        except Exception:
            pass
    return {}

def _save_cache(cache):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass
