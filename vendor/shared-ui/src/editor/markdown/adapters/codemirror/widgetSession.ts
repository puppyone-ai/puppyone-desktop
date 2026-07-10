/**
 * DOM-owned widget sessions. WidgetType descriptors are immutable; mounted
 * observers/timers/async work belong to the session tied to the exact DOM node.
 */

export type WidgetSession = {
  dom: HTMLElement;
  generation: number;
  dispose(): void;
};

export type WidgetSessionRegistry = {
  byDom: WeakMap<HTMLElement, WidgetSession>;
  active: Set<WidgetSession>;
  mount(dom: HTMLElement, create: (generation: number) => Omit<WidgetSession, "dom" | "generation"> & { dispose(): void }): WidgetSession;
  get(dom: HTMLElement): WidgetSession | undefined;
  dispose(dom: HTMLElement): void;
  disposeAll(): void;
};

export function createWidgetSessionRegistry(): WidgetSessionRegistry {
  const byDom = new WeakMap<HTMLElement, WidgetSession>();
  const active = new Set<WidgetSession>();
  let generation = 0;

  const registry: WidgetSessionRegistry = {
    byDom,
    active,
    mount(dom, create) {
      const existing = byDom.get(dom);
      if (existing) {
        existing.dispose();
        active.delete(existing);
      }

      const currentGeneration = ++generation;
      const created = create(currentGeneration);
      const session: WidgetSession = {
        dom,
        generation: currentGeneration,
        dispose() {
          if (session.generation !== currentGeneration) return;
          created.dispose();
          active.delete(session);
          byDom.delete(dom);
        },
      };
      byDom.set(dom, session);
      active.add(session);
      return session;
    },
    get(dom) {
      return byDom.get(dom);
    },
    dispose(dom) {
      const session = byDom.get(dom);
      if (!session) return;
      session.dispose();
    },
    disposeAll() {
      for (const session of Array.from(active)) session.dispose();
      active.clear();
    },
  };

  return registry;
}
