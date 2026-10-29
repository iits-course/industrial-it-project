#!/usr/bin/env python3
"""Offline project gates for OpenAPI/AsyncAPI contracts.

This complements, but does not replace, full standard linters. It deliberately
checks course/project invariants: versioned addresses, idempotency, timeouts and
the common event envelope.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Iterable

import yaml
from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
MUTATING_METHODS = {"post", "put", "patch", "delete"}
EVENT_FIELDS = {
    "event_id",
    "event_type",
    "event_version",
    "occurred_at",
    "correlation_id",
    "aggregate_id",
    "aggregate_version",
    "producer",
    "data",
}


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def _construct_mapping(loader: UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False) -> dict[str, Any]:
    mapping: dict[str, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"duplicate YAML key {key!r} at line {key_node.start_mark.line + 1}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_mapping,
)


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as stream:
        value = yaml.load(stream, Loader=UniqueKeyLoader)
    if not isinstance(value, dict):
        raise ValueError("document root must be an object")
    return value


def resolve_pointer(document: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        raise ValueError(f"only local refs are permitted, got {ref!r}")
    current: Any = document
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            raise ValueError(f"unresolved ref {ref!r}")
        current = current[part]
    return current


def dereference(document: dict[str, Any], value: Any) -> Any:
    visited: set[str] = set()
    while isinstance(value, dict) and set(value) == {"$ref"}:
        ref = value["$ref"]
        if ref in visited:
            raise ValueError(f"cyclic direct ref {ref!r}")
        visited.add(ref)
        value = resolve_pointer(document, ref)
    return value


def expand_schema_refs(document: dict[str, Any], value: Any, trail: tuple[str, ...] = ()) -> Any:
    """Inline local schema refs so example validation stays dependency-local."""
    if isinstance(value, dict) and "$ref" in value:
        ref = value["$ref"]
        if ref in trail:
            raise ValueError(f"cyclic schema ref {ref!r}")
        expanded = expand_schema_refs(document, resolve_pointer(document, ref), (*trail, ref))
        siblings = {key: nested for key, nested in value.items() if key != "$ref"}
        if siblings:
            return {**expanded, **expand_schema_refs(document, siblings, trail)}
        return expanded
    if isinstance(value, dict):
        return {key: expand_schema_refs(document, nested, trail) for key, nested in value.items()}
    if isinstance(value, list):
        return [expand_schema_refs(document, nested, trail) for nested in value]
    return value


def walk(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, dict):
        for nested in value.values():
            yield from walk(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from walk(nested)


def validate_all_refs(document: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for value in walk(document):
        if isinstance(value, dict) and "$ref" in value:
            try:
                resolve_pointer(document, value["$ref"])
            except (TypeError, ValueError) as error:
                errors.append(str(error))
    return errors


def operation_parameters(document: dict[str, Any], path_item: dict[str, Any], operation: dict[str, Any]) -> list[dict[str, Any]]:
    values = [*path_item.get("parameters", []), *operation.get("parameters", [])]
    return [dereference(document, item) for item in values]


def validate_openapi(path: Path, document: dict[str, Any]) -> list[str]:
    errors = validate_all_refs(document)
    version = str(document.get("openapi", ""))
    if not version.startswith("3.0."):
        errors.append(f"openapi must be 3.0.x, got {version!r}")
    info_version = str(document.get("info", {}).get("version", ""))
    major = info_version.split(".", 1)[0]
    if not major.isdigit():
        errors.append("info.version must use SemVer")

    operation_ids: set[str] = set()
    for route, raw_path_item in document.get("paths", {}).items():
        path_item = dereference(document, raw_path_item)
        if not route.startswith(f"/v{major}/"):
            errors.append(f"{route}: path major must match info.version {info_version}")
        for method, operation in path_item.items():
            if method not in HTTP_METHODS:
                continue
            operation = dereference(document, operation)
            label = f"{method.upper()} {route}"
            operation_id = operation.get("operationId")
            if not operation_id:
                errors.append(f"{label}: operationId is required")
            elif operation_id in operation_ids:
                errors.append(f"{label}: duplicate operationId {operation_id!r}")
            else:
                operation_ids.add(operation_id)
            timeout = operation.get("x-timeout-ms")
            if not isinstance(timeout, int) or timeout <= 0:
                errors.append(f"{label}: positive x-timeout-ms is required")

            responses = operation.get("responses", {})
            if not any(str(code).startswith("2") for code in responses):
                errors.append(f"{label}: a success response is required")
            if not any(str(code).startswith("4") for code in responses):
                errors.append(f"{label}: a documented 4xx response is required")
            if not any(str(code).startswith("5") for code in responses):
                errors.append(f"{label}: a documented 5xx response is required")

            if method in MUTATING_METHODS and operation.get("x-idempotent"):
                parameters = operation_parameters(document, path_item, operation)
                if not any(item.get("in") == "header" and item.get("name", "").lower() == "idempotency-key" and item.get("required") is True for item in parameters):
                    errors.append(f"{label}: x-idempotent command requires a mandatory Idempotency-Key header")
    return errors


def validate_asyncapi(path: Path, document: dict[str, Any]) -> list[str]:
    errors = validate_all_refs(document)
    version = str(document.get("asyncapi", ""))
    if not version.startswith("3."):
        errors.append(f"asyncapi must be 3.x, got {version!r}")
    info_version = str(document.get("info", {}).get("version", ""))
    major = info_version.split(".", 1)[0]
    if not major.isdigit():
        errors.append("info.version must use SemVer")

    for channel_name, channel in document.get("channels", {}).items():
        channel = dereference(document, channel)
        address = str(channel.get("address", ""))
        if not address.endswith(f".v{major}"):
            errors.append(f"channel {channel_name}: address major must match info.version {info_version}")

    for message_name, message in document.get("components", {}).get("messages", {}).items():
        message = dereference(document, message)
        payload = dereference(document, message.get("payload", {}))
        required = set(payload.get("required", []))
        missing = EVENT_FIELDS - required
        if missing:
            errors.append(f"message {message_name}: event envelope misses required fields {sorted(missing)}")

        traits = [dereference(document, trait) for trait in message.get("traits", [])]
        if not any(trait.get("x-delivery-guarantee") == "at-least-once" for trait in traits):
            errors.append(f"message {message_name}: at-least-once trait is required")
        if not any(trait.get("x-deduplication-key") == "event_id" for trait in traits):
            errors.append(f"message {message_name}: event_id deduplication trait is required")
        if not any(trait.get("x-ordering-key") == "aggregate_id" for trait in traits):
            errors.append(f"message {message_name}: aggregate_id ordering trait is required")

        schema_validator = Draft202012Validator(expand_schema_refs(document, payload))
        for example in message.get("examples", []):
            for validation_error in schema_validator.iter_errors(example.get("payload")):
                location = "/".join(str(part) for part in validation_error.absolute_path)
                errors.append(f"message {message_name} example {example.get('name', '<unnamed>')} payload/{location}: {validation_error.message}")
    return errors


def main() -> int:
    targets = [
        *(sorted((ROOT / "openapi").glob("*.yaml"))),
        *(sorted((ROOT / "asyncapi").glob("*.yaml"))),
    ]
    if not targets:
        print("No contract files found", file=sys.stderr)
        return 1

    failed = False
    for path in targets:
        try:
            document = load_yaml(path)
            if path.parent.name == "openapi":
                errors = validate_openapi(path, document)
            else:
                errors = validate_asyncapi(path, document)
        except Exception as error:  # report malformed documents uniformly
            errors = [str(error)]
        relative = path.relative_to(ROOT)
        if errors:
            failed = True
            print(f"FAIL {relative}")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"PASS {relative}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
