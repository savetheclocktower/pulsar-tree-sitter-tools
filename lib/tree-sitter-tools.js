const TreeSitterInspectorView = require('./tree-sitter-inspector-view');
const { CompositeDisposable, TextEditor } = require('atom');

function isInspectorView (view) {
  return view instanceof TreeSitterInspectorView;
}

function showInvalidEditorNotification () {
  atom.notifications.addError(
    `Tree-Sitter Inspector`, {
      description: `This editor does not appear to be using a tree-sitter language mode. Make sure you’ve selected a tree-sitter grammar.`,
      dismissable: true
    }
  );
}

module.exports = {
  treeSitterInspectorViews: new Map,
  subscriptions: null,

  activate (state) {
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(
      atom.commands.add('atom-workspace', {
        'tree-sitter-tools:open-inspector-for-editor': this.addInspectorForEditor.bind(this)
      }),
      atom.workspace.onDidDestroyPaneItem((item) => {
        if (!(item instanceof TreeSitterInspectorView)) { return; }
        item.destroy();
        if (typeof item.editorId !== 'number') { return; }
        this.treeSitterInspectorViews.delete(item.editorId);
      }),
      atom.workspace.addOpener(uriToOpen => {
        let [protocol, path] = uriToOpen.split('://');
        if (protocol !== 'tree-sitter-inspector') {
          return;
        }

        try {
          path = decodeURI(path);
        } catch (error) {
          return;
        }

        let editorId = Number(path);
        return this.createInspectorView({ editorId, uri: uriToOpen });
      })
    );
  },

  createInspectorView (state) {
    if (state.editorId) {
      let existingView = this.treeSitterInspectorViews.get(state.editorId);
      if (existingView) { existingView.destroy(); }

      let view = new TreeSitterInspectorView(state);
      this.treeSitterInspectorViews.set(state.editorId, view);
      return view;
    }
  },

  deactivate () {
    this.subscriptions.dispose();
    for (let view of this.treeSitterInspectorViews.values()) {
      view.destroy();
    }
    this.treeSitterInspectorViews.clear();
  },

  serialize () {
    return {};
  },

  uriForEditor (editor) {
    return `tree-sitter-inspector://${editor.id}`;
  },

  addInspectorForEditor () {
    let editor = atom.workspace.getActiveTextEditor();

    let languageMode = editor.getBuffer()?.getLanguageMode();
    if (!languageMode || !languageMode.rootLanguageLayer) {
      showInvalidEditorNotification();
      return;
    }

    const uri = this.uriForEditor(editor);
    const previousActivePane = atom.workspace.getActivePane();
    const options = { searchAllPanes: true, split: 'right' };

    return atom.workspace
      .open(uri, options)
      .then(view => {
        if (isInspectorView(view)) {
          previousActivePane.activate();
        }
      });
  }
};
