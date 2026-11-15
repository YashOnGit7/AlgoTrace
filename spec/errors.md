<!-- Purpose: defines compiler error and warning identifiers. Connects: graph validation failures to clear user-facing messages. -->
# Compiler errors

Each diagnostic has `code`, `message`, `node id`, `port`, and `hint`.

- `AT-E001`: duplicate node id.
- `AT-E002`: unknown node type.
- `AT-E003`: edge points to a missing node or port.
- `AT-E004`: cycle (list the nodes in it).
- `AT-E005`: type mismatch.
- `AT-E006`: missing required input.
- `AT-E007`: parameter wrong type or out of range.
- `AT-E008`: no `STRATEGY` node.
- `AT-E009`: more than one `STRATEGY` node.
- `AT-E010`: comparison or math with two `Numbers` and no `Series`.
- `AT-W001`: unreachable node removed (warning).

