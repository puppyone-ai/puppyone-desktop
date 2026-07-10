# Markdown editor source architecture

The public assembly stays at this directory root (`index.ts` plus the editor
and extension entry points). Internal code follows a
hybrid modular-monolith layout:

- `core/` owns the canonical source pipeline, syntax projection, render-plan
  contract, editor commands, decorations, and generic interaction state.
- `features/` owns vertical Markdown capabilities such as table, HTML,
  Mermaid, image, and code block. A complex feature keeps its model, plan,
  commands, state, widget, and focused tests together.
- `platform/` owns editor-scoped brokers, sessions, security policy, and
  CodeMirror host adapters. Features request capability through these ports.
- `shared/` contains feature-agnostic widget DOM and measurement primitives.

Dependency rules:

1. Markdown source is the only committed document truth.
2. Pure models and plans never own DOM or persistence.
3. Concrete feature widgets are composed only through the feature registries.
4. Widget construction is render-only; state changes happen through commands,
   effects, and editor-scoped coordinators.
5. `shared/` never imports `core/`, `features/`, or `platform/`.
6. `platform/` never imports a concrete feature.

Run `npm run check:markdown-architecture` after changing these boundaries.
