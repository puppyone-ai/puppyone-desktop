# Core

The core turns the canonical CodeMirror source into semantic elements and
typed render plans, then adapts those plans to editor decorations and generic
commands. It may consume feature models and plan compilers, but it must not
construct concrete feature widgets directly.
