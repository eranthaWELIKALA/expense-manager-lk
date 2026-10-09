import React, { useId, useState } from "react";
import { cx } from "./cx";

/**
 * Searchable select with an optional "Create …" choice (ARIA combobox pattern).
 *
 *   options:  [{value, label, sub?, meta?}] — filtered by the typed text
 *   value:    the chosen option's value, or "" while the text is free-typed
 *   text:     what's in the box
 *   onTextChange(text)       typing (the caller should clear `value`)
 *   onSelect(option)         an option was picked
 *   onCreate(text)?          offer "Create “text”" when nothing matches exactly
 *
 * Arrow keys move, Enter picks, Escape closes the list (without closing a dialog).
 * Field-provided props (id, aria-*) land on the input.
 */
export function Combobox({ options, value, text, onTextChange, onSelect, onCreate, createLabel = (t) => `Create “${t}”`,
  placeholder, autoFocus, emptyText = "No matches", className, ...inputProps }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = text.trim().toLowerCase();
  const matches = q && !value ? options.filter((o) => (o.label + " " + (o.sub || "")).toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.label.trim().toLowerCase() === q);
  const items = [
    ...matches.map((o) => ({ kind: "opt", o })),
    ...(onCreate && q && !exact ? [{ kind: "new" }] : []),
  ];
  const at = Math.min(active, Math.max(0, items.length - 1));

  const choose = (it) => {
    if (!it) return;
    if (it.kind === "new") onCreate(text.trim()); else onSelect(it.o);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const n = items.length;
      if (n) setActive((at + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter" && open && items.length) {
      e.preventDefault(); // pick, don't submit the form
      choose(items[at]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation(); // close the list, not the dialog
      setOpen(false);
    }
  };

  const optId = (i) => listId + "-o" + i;
  return (
    <div className={cx("cbx", className)}>
      <input
        {...inputProps}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items.length ? optId(at) : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => { onTextChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="cbx-list" role="listbox" id={listId}>
          {items.length === 0 && <li className="cbx-empty">{emptyText}</li>}
          {items.map((it, i) => (
            <li
              key={it.kind === "new" ? "__new" : it.o.value}
              id={optId(i)}
              role="option"
              aria-selected={i === at}
              className={cx("cbx-opt", i === at && "on", it.kind === "new" && "new", it.kind === "opt" && it.o.value === value && "sel")}
              onMouseDown={(e) => { e.preventDefault(); choose(it); }} // before the input blurs
              onMouseEnter={() => setActive(i)}
            >
              {it.kind === "new" ? <b>+ {createLabel(text.trim())}</b> : (
                <>
                  <span className="cbx-main"><b>{it.o.label}</b>{it.o.sub && <small>{it.o.sub}</small>}</span>
                  {it.o.meta && <span className="cbx-meta">{it.o.meta}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
