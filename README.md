# tree-sitter-tools

Tools for writing [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammars in Pulsar.

**IMPORTANT:** Currently only works on Pulsar v1.106.0 and up, and only with the `core.useExperimentalModernTreeSitter` setting enabled.

<img width="1304" alt="tree-sitter-tools screenshot" src="https://user-images.githubusercontent.com/3450/235327463-81e1cb14-f34c-4f2d-bc0f-dcfeb4816d16.png">

## Inspector

The Tree-sitter inspector pane is an enhanced version of the [Tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground).

When inside of a buffer using a modern-tree-sitter grammar, run the **Tree Sitter Inspector: Open Inspector For Editor** command. A pane will open on the right side showing a representation of the editor’s Tree-sitter tree.

Here’s what you can do:

* Clicking any node in the tree will select the corresponding editor range.
* Clicking any node will also log the node itself to the developer console for inspection.
* Moving the cursor will change what is focused in the inspector.
* You may also toggle whether anonymous nodes are shown or hidden.
* You may choose a different “language layer” via the drop-down menu if more than one layer is present. The first item in the list will always be the root language layer. If the layer you’re inspecting is destroyed as a result of buffer changes, the view will reset to the root layer.
* When you are inspecting a language layer other than the root, you may check the “Show injected ranges” checkbox to see the current content ranges of that layer’s injection. Editing the document while this option is checked is a useful visualization of how injection layers are re-processed in response to changes.

### Running queries

The query field is shown below the node inspector and accepts any valid [Tree-sitter query syntax](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries).

When a query runs, each capture name in the query will be annotated with a colored decoration, and any matches for that capture in the editor will have the same decoration.

The decorations will persist through editor changes, and will update when the editor updates. When the active layer is changed, the query editor will clear.

The built-in predicates `#match?` and `#eq?` are supported, as are certain custom predicates supported by Pulsar via `#set!`:

* scope tests (e.g., `test.onlyIfFirst`) will be applied, and any captures that fail their tests will not be decorated.
* scope adjustments (e.g., `adjust.startAndEndAroundFirstMatchOf "^#"`) will be applied, and the adjusted range will be decorated rather than the original capture range.

## Grammar

A grammar for Tree-sitter query files is included.

## Planned enhancements

* Ability to view or copy a node’s own `toString` (its description of itself in query syntax)
* Modes for assisting in writing and debugging queries for indents and folds
