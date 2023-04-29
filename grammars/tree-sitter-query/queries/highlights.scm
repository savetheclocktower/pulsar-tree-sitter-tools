

(comment) @comment.line.semicolon.scm

((comment) @punctuation.definition.comment.scm
  (#set! adjust.endAfterFirstMatchOf "^;"))

(anonymous_node
  (identifier) @string.quoted.double.scm)
(string) @string.quoted.double.scm

(capture) @variable.other.capture.scm
(capture "@" @punctuation.definition.variable.scm)

(named_node
  name: (_) @constant.language.capture.scm)
(named_node
  "_" @constant.language.capture.wildcard.scm)

((field_definition) @storage.modifier.field.scm @entity.other.attribute-name.scm
  ; Extend to cover the colon.
  (#set! adjust.endAt firstChild.nextSibling.endPosition))

((predicate) @keyword.other.special-method.scm
  ; Span the `#` and `?/!` on either side.
  (#set! adjust.startAt firstChild.nextSibling.startPosition)
  (#set! adjust.endAt firstChild.nextSibling.nextSibling.nextSibling.endPosition))

(escape_sequence) @constant.character.escape.scm

(quantifier) @keyword.operator.quantifier.scm
