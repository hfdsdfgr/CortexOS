import { useId, useLayoutEffect, useRef, useState, type SelectHTMLAttributes } from "react";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string; disabled: boolean };

// Keep the real select, its labels, form value and change events. Only its popup is replaced.
export function SelectMenu({ children, className = "", onChange, onKeyDown, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const select = useRef<HTMLSelectElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: "", time: 0 });
  const supported = typeof HTMLElement.prototype.showPopover === "function";
  const close = () => { popup.current?.hidePopover(); setOpen(false); };
  const show = (edge?: "first" | "last") => {
    const element = select.current!;
    const items = Array.from(element.options, option => ({ value: option.value, label: option.label, disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) }));
    const enabled = items.map((item, index) => !item.disabled ? index : -1).filter(index => index >= 0);
    const selected = enabled.includes(element.selectedIndex) ? element.selectedIndex : enabled[0] ?? -1;
    setOptions(items);
    setActive(edge === "first" ? enabled[0] ?? -1 : edge === "last" ? enabled.at(-1) ?? -1 : selected);
    setOpen(true);
  };
  const choose = (index: number) => {
    const element = select.current, option = options[index];
    if (!element || element.disabled || !option || option.disabled) return;
    if (!Array.from(element.options).some(item => item.value === option.value && !item.disabled && !(item.parentElement instanceof HTMLOptGroupElement && item.parentElement.disabled))) { close(); return; }
    element.value = option.value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    element.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open || !popup.current || !select.current) return;
    const menu = popup.current;
    menu.showPopover();
    const position = () => {
      const anchor = select.current!.getBoundingClientRect();
      const width = Math.min(Math.max(anchor.width, 180), window.innerWidth - 24);
      const below = Math.max(0, window.innerHeight - anchor.bottom - 18);
      const above = Math.max(0, anchor.top - 18);
      const upward = below < 180 && above > below;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${Math.min(320, upward ? above : below)}px`;
      menu.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
      menu.style.top = `${upward ? Math.max(12, anchor.top - menu.offsetHeight - 6) : anchor.bottom + 6}px`;
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, options]);
  useLayoutEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  useLayoutEffect(() => {
    if (open) close();
  }, [props.disabled, props.value]);
  return <span className="select-field">
    <select {...props} ref={select} className={`select-control ${className}`} aria-expanded={supported ? open : undefined} aria-controls={open ? id : undefined} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
      onChange={event => { onChange?.(event); if (open) close(); }}
      onPointerDown={event => {
        if (!supported || props.multiple || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
      }}
      onClick={event => {
        props.onClick?.(event);
        if (!supported || props.multiple || event.defaultPrevented) return;
        event.preventDefault();
        if (open) close(); else show();
      }}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (!supported || props.multiple || event.defaultPrevented) return;
        if (event.key === "Tab") { if (open) close(); return; }
        if (event.key === "Escape") {
          if (open) { event.preventDefault(); event.stopPropagation(); close(); }
          return;
        }
        if (event.key === "F4") { event.preventDefault(); if (open) close(); else show(); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
          event.preventDefault();
          if (!open) { show(event.key === "Home" ? "first" : event.key === "End" ? "last" : undefined); return; }
          if (event.key === "Enter" || event.key === " ") { choose(active); return; }
          const enabled = options.map((option, index) => !option.disabled ? index : -1).filter(index => index >= 0);
          const offset = enabled.indexOf(active);
          setActive(event.key === "Home" ? enabled[0] ?? -1 : event.key === "End" ? enabled.at(-1) ?? -1 : enabled[(offset + (event.key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length] ?? -1);
        } else if (open && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const text = (Date.now() - typed.current.time < 700 ? typed.current.text : "") + event.key.toLocaleLowerCase();
          typed.current = { text, time: Date.now() };
          const index = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(text));
          if (index >= 0) setActive(index);
        }
      }}
      onBlur={event => { props.onBlur?.(event); if (open) close(); }}
    >{children}</select>
    <ChevronDown className="select-chevron" size={14} aria-hidden="true" />
    {supported && open && <span ref={popup} id={id} className="select-popup" popover="auto" role="listbox" aria-label={props["aria-label"] ? `${props["aria-label"]}选项` : "可选项"}
      onToggle={event => { if (!event.currentTarget.matches(":popover-open")) setOpen(false); }}
    >{options.map((option, index) => <span key={index} id={`${id}-${index}`} role="option" aria-selected={String(props.value ?? select.current?.value ?? "") === option.value} aria-disabled={option.disabled || undefined} className={`select-option ${active === index ? "is-active" : ""}`}
      title={option.label} onPointerMove={() => { if (!option.disabled) setActive(index); }}
      onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}
    ><span>{option.label}</span>{String(props.value ?? select.current?.value ?? "") === option.value && <Check size={15} aria-hidden="true" />}</span>)}</span>}
  </span>;
}
