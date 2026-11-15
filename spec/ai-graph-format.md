<!-- Purpose: defines the model response format for natural-language strategies. Connects: FastAPI AI proxy output to the graph canvas and compiler. -->
# AI graph format

The model must return either `{nodes: [{id, type, params}], edges: [{from, to, port}]}` with no screen positions, or `{clarification: 'one short question'}` when the request is ambiguous or impossible.

