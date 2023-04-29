const {
  CompositeDisposable,
  Emitter,
  Point,
  Range,
  TextBuffer,
  TextEditor
} = require('atom');
const Clusterize = require('clusterize.js');
const etch = require('etch');
const $ = etch.dom;

function gre (str, ...args) {
  let replacements = args.map(str => {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  });

  let raw = String.raw(str, ...replacements);
  return new RegExp(raw, 'g');
}

function escapeType (type) {
  return JSON.stringify(type);
}

const MAX_RANGE = new Range(Point.ZERO, Point.INFINITY).freeze();

class TreeSitterInspectorView {
  getTitle () {
    return `Inspector (${this.editor.getTitle()})`;
  }

  constructor (serializedState) {
    if (serializedState.editorId) {
      this.editorId = serializedState.editorId;
      this.uri = serializedState.uri;
    }
    this.queryBuffer = new TextBuffer();
    this.emitter = new Emitter();

    this.showAnonymousNodes = false;

    this.activeLayer = null;
    this.activeLayerId = null;

    etch.initialize(this);

    this.cluster = new Clusterize({
      rows: [],
      noDataText:  null,
      contentElem: this.output,
      scrollElem: this.output.parentNode
    });

    this.subscriptions = new CompositeDisposable();

    this.output.addEventListener('click', this.handleTreeClick.bind(this));
    this.form.addEventListener('click', this.handleFormClick.bind(this));
    this.buttonBar.addEventListener('click', this.handleButtonBarClick.bind(this));

    this.refs.layerDropdown.addEventListener('change',
      this.handleLayerDropdownChange.bind(this));

    let grammar = atom.grammars.grammarForScopeName('source.scm');
    if (grammar) {
      this.scmGrammar = grammar;
    }

    if (this.editorId) {
      let editor = this.findEditorById(this.editorId);
      if (editor) { this.attachToEditor(editor); }
    }
  }

  get form () { return this.refs?.form; }
  get element () { return this.refs?.element; }
  get buttonBar () { return this.refs?.buttonBar; }
  get output () { return this.refs?.output; }
  get queryEditor () { return this.refs?.queryEditor; }

  getURI () {
    return this.uri;
  }

  compileQuery (contents) {
    let language = this.activeLayer?.language;
    if (!language) { return null; }
    let query = language.query(contents);
    return query;
  }

  findEditorById (id) {
    let allEditors = atom.workspace.getTextEditors();
    return allEditors.find(editor => editor.id === id);
  }

  attachToEditor (editor) {
    let { languageMode } = editor;

    if (!languageMode.rootLanguageLayer) {
      console.error('Not a tree-sitter language mode!');
      return false;
    }

    this.resetEditor();
    let buffer = editor.getBuffer();

    this.subscriptions.dispose();
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(
      editor.onDidChangeCursorPosition(() => {
        this.handleCursorMovement();
        this.markOrClearInjectionRanges();
      }),
      buffer.onDidStopChanging(() => {
        this.bufferDidUpdate();
      }),
      buffer.onDidChangeLanguageMode(() => {
        this.closeInspectorView();
        this.destroy();
      }),
      editor.onDidDestroy(() => {
        this.closeInspectorView();
        this.destroy();
      }),
      this.onDidChangeActiveLayer(newId => {
        // There's a low likelihood that the query from a different layer will
        // even be valid in this layer.
        this.clearTreeQuery();
        if (newId === 0) {
          this.showInjectionRanges = false;
        }
        this.update();
      })
    );

    this.editor = editor;
    this.languageMode = languageMode;

    this.activeLayer = languageMode.rootLanguageLayer;
    this.activeLayerId = 0;
    this.updateLayers();

    this.markerLayer = this.editor.addMarkerLayer({
      role: 'tree-sitter-tools-query'
    });
    this.markerLayerDecoration = this.editor.decorateMarkerLayer(
      this.markerLayer,
      {
        type: 'highlight',
        class: 'region--query-match'
      }
    );

    this.injectionRangeLayer = this.editor.addMarkerLayer({
      role: 'tree-sitter-tools-injection-ranges'
    });
    this.injectionRangeLayerDecoration = this.editor.decorateMarkerLayer(
      this.injectionRangeLayer,
      {
        type: 'highlight',
        class: 'region--query-match'
      }
    );

    this.update();

    if (this.scmGrammar) {
      let WASMTreeSitterLanguageMode = this.editor.getBuffer().getLanguageMode().constructor;
      let languageMode = new WASMTreeSitterLanguageMode({
        grammar: this.scmGrammar,
        buffer: this.refs.queryEditor.getBuffer(),
        config: atom.config,
        grammars: atom.grammars
      });
      this.refs.queryEditor.getBuffer().setLanguageMode(languageMode);

      this.queryEditorMarkerLayer = this.queryEditor.addMarkerLayer({
        role: 'tree-sitter-inspector'
      });

      this.queryEditorMarkerLayerDecoration = this.queryEditor.decorateMarkerLayer(
        this.queryEditorMarkerLayer,
        {
          type: 'highlight',
          class: 'region--query-match'
        }
      );
    }
  }

  closeInspectorView () {
    const previewPane = atom.workspace.paneForURI(this.uri);
    if (previewPane != null) {
      previewPane.destroyItem(previewPane.itemForURI(this.uri));
      return true;
    } else {
      return false;
    }
  }

  updateLayers () {
    let rootLayer = this.languageMode.rootLanguageLayer;
    let layers = this.languageMode.getAllInjectionLayers();
    this.layers = [rootLayer, ...layers];

    let activeLayer = this.layers.find(layer => {
      return (layer.marker?.id ?? 0) === this.activeLayerId;
    });
    if (!activeLayer) {
      // Our layer ceased to exist. Revert to the root layer.
      this.activeLayer = rootLayer;
      this.activeLayerId = 0;
      this.emitter.emit('did-change-active-layer', this.activeLayerId);
    }
  }

  listLayers () {
    if (!this.layers) { return []; }
    return this.layers.map(layer => {
      let extent = layer.getExtent().toString();
      let grammar = layer.grammar.scopeName;
      let id = layer.marker?.id ?? 0;
      let description = `${grammar} ${extent}`;
      return { id, description };
    });
  }

  renderLayersList (activeLayerId) {
    return this.listLayers().map(({ id, description }) => {
      return $.option(
        { value: id, selected: id === activeLayerId },
        description
      );
    });
  }

  handleLayerDropdownChange (event) {
    let targetId = Number(event.target.value);
    this.activeLayer = this.layers.find(layer => {
      return (layer.marker?.id ?? 0) === targetId;
    });
    if (!this.activeLayer) {
      throw new Error(`Can't find layer with id: ${event.target.value}`);
    }
    this.activeLayerId = targetId;
    this.emitter.emit('did-change-active-layer', this.activeLayerId);
  }

  onDidChangeActiveLayer (callback) {
    return this.emitter.on('did-change-active-layer', callback);
  }

  resetEditor () {
    this.treeRows = null;
    this.treeRowHighlightedIndex = -1;
    this.parseCount = 0;
    this.isRendering = 0;
    this.markerLayer?.destroy();
  }

  resetMarkers () {
    this.markerLayer?.destroy();
    this.markerLayer = this.editor.getBuffer().addMarkerLayer({
      role: 'tree-sitter-inspector'
    });
  }

  bufferDidUpdate () {
    this.update();
    this.updateLayers();
    this.handleCursorMovement();
  }

  async update () {
    let tree = this.activeLayer?.tree;
    if (!tree) {
      console.error('No tree!');
      return;
    }
    let { showAnonymousNodes } = this;
    await this.renderTree(tree, { showAnonymousNodes });
    await etch.update(this);

    this.output.innerHTML = this.treeRows ? this.treeRows.join('') : '';
    this.highlightActiveNode();

    if (this.query) {
      this.runTreeQuery(this.query);
    }
    this.markOrClearInjectionRanges();
  }

  markOrClearInjectionRanges () {
    this.injectionRangeLayer?.clear();
    if (!this.showInjectionRanges) {
      return;
    }
    let id = this.activeLayerId;
    if (id === 0) { return; }
    let ranges = this.activeLayer.getCurrentRanges();

    for (let range of ranges) {
      let marker = this.injectionRangeLayer.markBufferRange(range, {
        invalidate: 'touch'
      });
      this.injectionRangeLayerDecoration.setPropertiesForMarker(marker, {
        type: 'highlight',
        class: 'query-match-color-5'
      });
    }
  }

  ignoringCursorMovement (callback) {
    let wasIgnoring = this.ignoreCursorMovement;
    this.ignoreCursorMovement = true;
    callback();
    this.ignoreCursorMovement = wasIgnoring;
  }

  highlightActiveNode ({ scroll = true } = {}) {
    if (!this.treeRows.length) { return; }

    if (this.treeRowHighlightedIndex !== -1) {
      let row = this.treeRows[this.treeRowHighlightedIndex];
      if (row) {
        this.treeRows[this.treeRowHighlightedIndex] = row.replace('highlighted', 'plain');
      }
    }

    if (this.activeNodeId) {
      this.treeRowHighlightedIndex = this.treeRows.findIndex(
        row => row.includes(`data-id=${this.activeNodeId}`)
      );
      if (this.treeRowHighlightedIndex !== -1) {
        let row = this.treeRows[this.treeRowHighlightedIndex];
        if (row) {
          this.treeRows[this.treeRowHighlightedIndex] =
            row.replace('plain', 'highlighted');
        }
      }
    }

    this.cluster.update(this.treeRows);

    if (!scroll) { return; }

    // Scroll it into view.
    if (this.treeRowHighlightedIndex !== -1) {
      let scrollContainer = this.output.parentNode;
      let lineHeight = this.cluster.options.item_height;
      let scrollTop = this.output.parentNode.scrollTop;
      let containerHeight = this.output.parentNode.clientHeight;
      let offset = this.treeRowHighlightedIndex * lineHeight;

      let elem = this.output.querySelector(`a[data-id="${this.activeNodeId}"]`);

      if (elem) {
        elem.scrollIntoView({ block: 'center' });
      } else {
        // Not on screen. Get it close, then scroll it into view properly once
        // the node exists.
        scrollContainer.scrollTop = offset;
        requestAnimationFrame(() => {
          let elem = this.output.querySelector(`a[data-id="${this.activeNodeId}"]`);
          if (elem) {
            elem.scrollIntoView({ block: 'center' });
          }

        });
      }
    }
  }

  async renderTree (tree, options = {}) {
    let { showAnonymousNodes = false } = options;
    this.isRendering++;
    let cursor = tree.walk();

    let currentRenderCount = this.parseCount;
    let row = '';
    let rows = [];
    let finishedRow = false;
    let visitedChildren = false;
    let indentLevel = 0;

    for (let i = 0;; i++) {
      if (i > 0 && i % 10000 === 0) {
        await new Promise(r => setTimeout(r, 0));
        if (this.parseCount !== currentRenderCount) {
          cursor.delete();
          this.isRendering--;
          return;
        }
      }

      let displayName;
      if (cursor.nodeIsMissing) {
        displayName = `MISSING ${cursor.nodeType}`;
      } else if (cursor.nodeIsNamed) {
        displayName = cursor.nodeType;
      } else if (showAnonymousNodes) {
        displayName = escapeType(cursor.nodeType);
      }

      if (visitedChildren) {
        if (displayName) {
          finishedRow = true;
        }

        if (cursor.gotoNextSibling()) {
          visitedChildren = false;
        } else if (cursor.gotoParent()) {
          visitedChildren = true;
          indentLevel--;
        } else {
          break;
        }
      } else {
        if (displayName) {
          if (finishedRow) {
            row += '</div>';
            rows.push(row);
            finishedRow = false;
          }
          const start = cursor.startPosition;
          const end = cursor.endPosition;
          const id = cursor.nodeId;
          let fieldName = cursor.currentFieldName();
          if (fieldName) {
            fieldName = `<span class="field-name">${fieldName}:</span> `;
          } else {
            fieldName = '';
          }
          row = `<div>${'  '.repeat(indentLevel)}${fieldName}<a class='plain' href="#" data-id=${id} data-range="${start.row},${start.column},${end.row},${end.column}">${displayName}</a> <span class="range">(${start.row}, ${start.column}) – (${end.row}, ${end.column})</span>`;
          finishedRow = true;
        }

        if (cursor.gotoFirstChild()) {
          visitedChildren = false;
          indentLevel++;
        } else {
          visitedChildren = true;
        }
      }
    }
    if (finishedRow) {
      row += '</div>';
      rows.push(row);
    }
    cursor.delete();
    this.cluster.update(rows);
    this.treeRows = rows;
    this.isRendering--;
  }

  get tree () { return this.activeLayer?.tree; }

  clearTreeQuery () {
    this.query = null;
    this.markerLayer?.clear();
    this.queryEditorMarkerLayer?.clear();
    this.queryEditor.setText('');
  }

  runTreeQuery (query, startRow = null, endRow = null) {
    this.markerLayer?.clear();
    this.queryEditorMarkerLayer?.clear();
    let scopeResolver = this.activeLayer.scopeResolver;
    scopeResolver.reset();
    if (endRow === null) {
      let range = MAX_RANGE.copy();
      range = this.editor.clipBufferRange(range);
      startRow = range.start.row;
      endRow = range.end.row;
    }

    let captures = query.captures(
      this.tree.rootNode,
      { row: startRow, column: 0 },
      { row: endRow, column: 0 }
    );
    let lastNodeId;

    let queryEditorRange = this.queryEditor.getBuffer().getRange();
    let index = 0;
    for (let name of query.captureNames) {
      let colorIndex = (index % 5) + 1;
      let pattern = gre`@${name}(?![\.\w])`;
      this.queryEditor.scanInBufferRange(pattern, queryEditorRange, (match) => {
        let { range } = match;
        let marker = this.queryEditorMarkerLayer.markBufferRange(range, {
          invalidate: 'touch'
        });

        this.queryEditorMarkerLayerDecoration.setPropertiesForMarker(marker, {
          type: 'highlight',
          class: `query-match-color-${colorIndex}`
        });
      });
      index++;
    }

    for (let capture of captures) {
      let { name, node } = capture;
      let range = scopeResolver.store(capture);
      if (!range) { continue; }
      if (node.id === lastNodeId) { continue; }
      lastNodeId = node.id;
      let { start, end } = range;

      let colorClass = this.classForCaptureName(name, query);
      let marker = this.markerLayer.markBufferRange(node.range, {
        invalidate: 'touch'
      });

      this.markerLayerDecoration.setPropertiesForMarker(marker, {
        type: 'highlight',
        class: colorClass
      });
    }

    scopeResolver.reset();
  }

  handleCursorMovement () {
    if (this.isRendering) { return; }
    if (!this.tree) { return; }
    if (this.ignoreCursorMovement) { return; }

    let selection = this.editor.getLastSelection();
    let { start, end } = selection.getBufferRange();

    // Match it with a node in the tree.
    let node;
    let root = this.tree.rootNode;
    if (this.showAnonymousNodes) {
      node = root.descendantForPosition(start, end);
    } else {
      node = root.namedDescendantForPosition(start, end);
    }

    if (node) {
      this.activeNodeId = node.id;
    } else {
      this.activeNodeId = null;
    }

    this.highlightActiveNode();
  }

  handleButtonBarClick (event) {
    if (event.target.webkitMatchesSelector('.btn-group#showAnonymousNodes .btn')) {
      let button = event.target;
      button.classList.add('selected');

      let btns = button.parentNode.querySelectorAll('.btn');
      for (let btn of [...btns]) {
        if (btn !== button) {
          btn.classList.remove('selected');
        }
      }

      if (button.dataset.action === 'hide') {
        this.showAnonymousNodes = false;
      } else {
        this.showAnonymousNodes = true;
      }
    }

    if (event.target.webkitMatchesSelector('input.show-injection-ranges')) {
      let checked = event.target.checked;
      this.showInjectionRanges = checked;
    }

    return this.update();
  }

  handleFormClick (event) {
    if (!event.target.webkitMatchesSelector('.btn')) {
      return;
    }

    let { classList } = event.target;

    if (classList.contains('run-query')) {
      let queryText = this.refs.queryEditor.getText();
      try {
        this.query = this.compileQuery(queryText);
        this.runTreeQuery(this.query);
        this.refs.status.innerHTML = '';
      } catch (e) {
        console.error('Error compiling query:');
        console.error(e);
        this.refs.status.innerHTML = e.message;
        this.query = null;
      }
    } else if (classList.contains('clear-query')) {
      this.clearTreeQuery();
    }

    event.preventDefault();
  }

  handleTreeClick (event) {
    if (event.target.tagName === 'A') {
      event.preventDefault();
      let [startRow, startColumn, endRow, endColumn] = event
        .target
        .dataset
        .range
        .split(',')
        .map(n => Number(n));

      let range = new Range(
        [startRow, startColumn],
        [endRow, endColumn]
      );

      let nodeId = Number(event.target.dataset.id);
      if (nodeId) {
        this.activeNodeId = nodeId;
        this.highlightActiveNode({ scroll: false });
      }

      let node = this.languageMode.getSyntaxNodeAtPosition(
        new Point(startRow, startColumn),
        (node) => {
          return node.id === nodeId;
        }
      );

      if (!node) {
        atom.beep();
        console.error("Node not found!");
      } else {
        // Log the node to the console.
        console.info(`NODE:`, node);
      }

      this.ignoringCursorMovement(() => {
        this.editor.setSelectedBufferRange(range);
      });
    }
  }

  serialize () {
    return {};
  }

  // Tear down any state and detach
  async destroy () {
    this.markerLayer?.destroy();
    this.markerLayerDecoration?.destroy();
    this.refs?.queryEditor?.destroy();
    this.subscriptions?.dispose();
    await etch.destroy(this);
  }

  getElement () {
    return this.element;
  }

  render () {
    let ready = !!this.editor;

    let blankSlate = null;
    if (!ready) {
      blankSlate = $.ul(
        { className: 'background-message centered' },
        $.li({}, 'Attaching to editor…')
      );
    }

    let headingText = '';
    let rootClasses = 'tree-sitter-inspector pane-item';
    if (this.editor) {
      headingText = `Tree for ${this.editor.getTitle()}`;
    }

    if (!ready) {
      rootClasses = `${rootClasses} editor-loading`;
    }

    let anonymousNodesButtonClass = '';
    if (this.showAnonymousNodes) {
      anonymousNodesButtonClass = ' selected';
    }

    let showInjectionRangesIsDisabled = this.activeLayerId === 0;

    let result = (
      $.div({ ref: 'element', className: rootClasses },
        blankSlate,
        $.div({ className: 'inspector-view' },
          $.div({ ref: 'heading', className: 'block section-heading icon icon-code' }, headingText),
          $.div({ ref: 'layerSelector', className: 'block layer-selector' },
            $.select({ ref: 'layerDropdown', className: 'input-select' },
              ...this.renderLayersList(this.activeLayerId)
            ),
          ),
          $.div({ ref: 'buttonBar', className: 'block button-bar' },
            $.div({ className: `injection-ranges-container ${showInjectionRangesIsDisabled ? 'disabled' : ''}` },
              $.label({ className: 'input-label'},
                $.input({ className: 'input-checkbox show-injection-ranges', type: 'checkbox', checked: this.showInjectionRanges, disabled: showInjectionRangesIsDisabled }),
                'Show injection ranges'
              )
            ),
            $.div({ className: 'toggle-container' },
              $.label({ for: 'showAnonymousNodes' }, 'Anonymous nodes:'),
              $.div({ className: 'btn-group', id: 'showAnonymousNodes' },
                $.button({ dataset: { action: 'hide' }, className: `btn btn-sm ${this.showAnonymousNodes ? '' : 'selected'}` }, 'Hide'),
                $.button({ dataset: { action: 'show' }, className: `btn btn-sm ${this.showAnonymousNodes ? 'selected' : ''}` }, 'Show')
              )
            )
          ),
          $.pre({ className: 'output-container-scroll' },
            $.div({ ref: 'output', className: 'output-container' })
          ),
          $.ul({ className: 'error-messages block' },
            $.li({ ref: 'status' }, '')
          ),
          $.div({ className: 'form-container' },
            $.form({ ref: 'form', className: 'query-form block' },
              $.div({ className: 'block' },
                $(TextEditor, {
                  ref: 'queryEditor',
                  autoHeight: false,
                  placeholderText: 'Query'
                })
              ),
              $.div({ className: 'inline-block buttons' },
                $.button({ ref: 'clearQueryButton', className: 'clear-query btn btn-secondary' }, 'Clear Query'),
                $.button({ ref: 'runQueryButton', className: 'run-query btn btn-primary' }, 'Run Query')
              )
            )
          )
        )
      )
    );

    return result;
  }

  classForCaptureName (name, query) {
    let index = query.captureNames.indexOf(name);
    let num = index % 5;
    return `query-match-color-${num + 1}`;
  }
}

module.exports = TreeSitterInspectorView;
