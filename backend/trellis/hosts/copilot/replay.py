from ...util.javascript import js_trim, parse_json


def list_position(key: object) -> int | None:
    if isinstance(key, bool) or not isinstance(key, int) or key < 0:
        return None
    return key


def child_of(container: object, key: object) -> object:
    if isinstance(container, list):
        position = list_position(key)
        if position is not None and position < len(container):
            return container[position]
    elif isinstance(container, dict) and isinstance(key, str):
        return container.get(key)
    return None


def set_child(container: object, key: object, value: object) -> None:
    if isinstance(container, list):
        position = list_position(key)
        if position is None:
            return
        while len(container) <= position:
            container.append(None)
        container[position] = value
    elif isinstance(container, dict) and isinstance(key, str):
        container[key] = value


def delete_child(container: object, key: object) -> None:
    if isinstance(container, list):
        position = list_position(key)
        if position is not None and position < len(container):
            container[position] = None
    elif isinstance(container, dict) and isinstance(key, str):
        container.pop(key, None)


def replace_tail(array: list, start: object, values: list) -> None:
    if isinstance(start, (int, float)) and not isinstance(start, bool):
        array[int(start) :] = values
    else:
        array.extend(values)


class LogReplayer:
    def __init__(self) -> None:
        self.state: object = None

    def replay(self, file: str) -> object:
        with open(file, "rb") as handle:
            text = handle.read().decode("utf-8", "replace")
        for line in text.split("\n"):
            if not js_trim(line):
                continue
            try:
                mutation = parse_json(line)
            except ValueError:
                continue
            if isinstance(mutation, dict):
                self.apply(mutation)
        return self.state

    def apply(self, mutation: dict) -> None:
        kind = mutation.get("kind")
        if isinstance(kind, bool) or not isinstance(kind, (int, float)):
            return
        if kind == 0:
            self.state = mutation.get("v")
            return
        path = mutation.get("k")
        if not isinstance(self.state, (dict, list)) or not isinstance(path, list):
            return
        is_push = kind == 2
        if not is_push and not path:
            return
        container = self.state
        for key in path if is_push else path[:-1]:
            container = child_of(container, key)
        if container is None:
            return
        if kind == 1:
            set_child(container, path[-1], mutation.get("v"))
        elif is_push and isinstance(container, list):
            values = mutation.get("v")
            if values is None:
                values = []
            if isinstance(values, list):
                replace_tail(container, mutation.get("i"), values)
        elif kind == 3:
            delete_child(container, path[-1])


def replay_log(file: str) -> object:
    return LogReplayer().replay(file)
