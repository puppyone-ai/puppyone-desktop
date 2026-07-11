import { Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type AgentPickerOption = {
  id: string;
  label: string;
  description?: string;
  detail?: string;
  meta?: string;
  keywords?: string;
  selectable: boolean;
  selected?: boolean;
  kind?: "connected" | "local" | "model" | "status";
  icon?: ReactNode;
};

export type AgentPickerGroup = {
  id: string;
  label: string;
  options: AgentPickerOption[];
};

type AgentPickerPopoverProps = {
  ariaLabel: string;
  placeholder: string;
  valueLabel?: string | null;
  groups: AgentPickerGroup[];
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
  onOpen?: () => void;
  onSelect: (id: string) => void;
  onRefresh?: () => void;
};

export function AgentPickerPopover({
  ariaLabel,
  placeholder,
  valueLabel,
  groups,
  disabled = false,
  loading = false,
  error = null,
  className = "",
  onOpen,
  onSelect,
  onRefresh,
}: AgentPickerPopoverProps) {
  const popupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const typeaheadRef = useRef({ value: "", timer: 0 as number | undefined });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [inspected, setInspected] = useState<string | null>(null);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const filteredGroups = useMemo(() => filterGroups(groups, query), [groups, query]);
  const flatOptions = useMemo(() => filteredGroups.flatMap((group) => group.options), [filteredGroups]);
  const searchable = groups.reduce((count, group) => count + group.options.length, 0) > 6;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      close(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };
    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => () => {
    if (typeaheadRef.current.timer) window.clearTimeout(typeaheadRef.current.timer);
  }, []);

  const show = (focusDirection: "selected" | "first" | "last" = "selected") => {
    if (disabled) return;
    if (!open) {
      setOpen(true);
      setQuery("");
      setInspected(null);
      onOpen?.();
    }
    window.setTimeout(() => {
      const options = filterGroups(groups, "").flatMap((group) => group.options);
      const target = focusDirection === "last"
        ? options.at(-1)
        : focusDirection === "first"
          ? options[0]
          : options.find((option) => option.selected) ?? options[0];
      if (target) {
        setActiveOptionId(target.id);
        optionRefs.current.get(target.id)?.focus();
      }
    }, 0);
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setQuery("");
    setInspected(null);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const choose = (option: AgentPickerOption) => {
    if (!option.selectable) {
      setInspected((current) => current === option.id ? null : option.id);
      return;
    }
    onSelect(option.id);
    close(true);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLElement>, option: AgentPickerOption) => {
    const index = flatOptions.findIndex((entry) => entry.id === option.id);
    let nextIndex = index;
    if (event.key === "ArrowDown") nextIndex = Math.min(flatOptions.length - 1, index + 1);
    else if (event.key === "ArrowUp") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = flatOptions.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(option);
      return;
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      focusByTypeahead(event.key, flatOptions, optionRefs.current, typeaheadRef);
      return;
    } else return;
    event.preventDefault();
    const target = flatOptions[nextIndex];
    if (target) {
      setActiveOptionId(target.id);
      optionRefs.current.get(target.id)?.focus();
    }
  };

  return (
    <div ref={rootRef} className={`desktop-agent-picker ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="desktop-agent-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        disabled={disabled}
        onClick={() => open ? close(false) : show()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{valueLabel || placeholder}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div className="desktop-agent-picker-popover" data-loading={loading || undefined}>
          {searchable && (
            <label className="desktop-agent-picker-search">
              <Search size={13} aria-hidden="true" />
              <span className="desktop-agent-visually-hidden">Search {ariaLabel.toLowerCase()}</span>
              <input
                value={query}
                autoFocus
                placeholder={`Search ${ariaLabel.toLowerCase()}`}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" || flatOptions.length === 0) return;
                  event.preventDefault();
                  setActiveOptionId(flatOptions[0].id);
                  optionRefs.current.get(flatOptions[0].id)?.focus();
                }}
              />
            </label>
          )}
          <div id={popupId} className="desktop-agent-picker-list" role="listbox" aria-label={`${ariaLabel} options`}>
            {filteredGroups.map((group) => {
              const labelId = `${popupId}-${group.id}`;
              return (
                <div className="desktop-agent-picker-group" role="group" aria-labelledby={labelId} key={group.id}>
                  <div id={labelId} className="desktop-agent-picker-group-label">{group.label}</div>
                  {group.options.map((option) => (
                    <div className="desktop-agent-picker-option-shell" key={option.id}>
                      <button
                        ref={(node) => {
                          if (node) optionRefs.current.set(option.id, node);
                          else optionRefs.current.delete(option.id);
                        }}
                        type="button"
                        role="option"
                        aria-selected={Boolean(option.selected)}
                        aria-disabled={!option.selectable}
                        tabIndex={option.id === activeOptionId ? 0 : -1}
                        className={`desktop-agent-picker-option is-${option.kind || "status"}${option.selected ? " is-selected" : ""}`}
                        onClick={() => choose(option)}
                        onFocus={() => setActiveOptionId(option.id)}
                        onKeyDown={(event) => handleOptionKeyDown(event, option)}
                      >
                        <span className="desktop-agent-picker-option-icon" aria-hidden="true">{option.icon || initial(option.label)}</span>
                        <span className="desktop-agent-picker-option-copy">
                          <span><strong>{option.label}</strong>{option.meta && <small>{option.meta}</small>}</span>
                          {option.description && <span>{option.description}</span>}
                        </span>
                        {option.selected && <Check className="desktop-agent-picker-check" size={14} aria-hidden="true" />}
                      </button>
                      {inspected === option.id && option.detail && <div className="desktop-agent-picker-detail" role="note">{option.detail}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
            {flatOptions.length === 0 && <div className="desktop-agent-picker-empty">No matching options</div>}
          </div>
          {(error || onRefresh) && (
            <div className="desktop-agent-picker-footer">
              {error && <span role="status">{error}</span>}
              {onRefresh && (
                <button type="button" disabled={loading} onClick={onRefresh}>
                  <RefreshCw size={13} className={loading ? "desktop-agent-spin" : undefined} />
                  {loading ? "Checking" : "Refresh"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function filterGroups(groups: AgentPickerGroup[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;
  return groups.flatMap((group) => {
    const options = group.options.filter((option) => (
      `${option.label} ${option.description || ""} ${option.meta || ""} ${option.keywords || ""}`
        .toLowerCase()
        .includes(normalized)
    ));
    return options.length ? [{ ...group, options }] : [];
  });
}

function focusByTypeahead(
  key: string,
  options: AgentPickerOption[],
  refs: Map<string, HTMLButtonElement>,
  state: React.MutableRefObject<{ value: string; timer: number | undefined }>,
) {
  if (state.current.timer) window.clearTimeout(state.current.timer);
  state.current.value = `${state.current.value}${key}`.toLowerCase();
  const target = options.find((option) => option.label.toLowerCase().startsWith(state.current.value));
  if (target) refs.get(target.id)?.focus();
  state.current.timer = window.setTimeout(() => { state.current.value = ""; }, 500);
}

function initial(label: string) {
  return label.trim().slice(0, 1).toUpperCase();
}
