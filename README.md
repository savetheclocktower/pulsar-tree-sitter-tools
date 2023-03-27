# tree-sitter-inspector package

Tools for writing tree-sitter grammars in Pulsar.

**IMPORTANT:** Currently only works on the [experimental tree-sitter modernization branch](https://github.com/savetheclocktower/pulsar/tree/tree-sitter-hell).

<img width="599" alt="tree-sitter-tools screenshot" src="https://user-images.githubusercontent.com/3450/227824276-eadd65cf-1264-4a11-855b-574ac9ab6c96.png">

## Inspector

The tree-sitter inspector pane is an enhanced version of the [tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground).

When inside of a buffer using a modern-tree-sitter grammar, run the **Tree Sitter Inspector: Open Inspector For Editor** command. A pane will open on the right side showing a representation of the editor’s tree-sitter tree.

Here’s what you can do:

* Clicking any node in the tree will select the corresponding editor range.
* Clicking any node will also log the node itself to the developer console for inspection.
* Moving the cursor will change what is focused in the inspector.
* You may also toggle whether anonymous nodes are shown or hidden.

### Running queries

The query field is shown below the node inspector and accepts any valid [tree-sitter query syntax](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries).

When a query runs, each capture name in the query will be annotated with a colored decoration, and any matches for that capture in the editor will have the same decoration.

The decorations will persist through editor changes, and will update when the editor updates.

The predicates `#match?` and `#eq?` are supported — though currently the inspector has no knowledge of Pulsar’s custom predicates.

## Grammar

A grammar for tree-sitter query files is included.

## Planned enhancements

* Ability to view or copy a node’s own `toString` (its description of itself in query syntax)
* Modes for assisting in writing and debugging queries for indents and folds
