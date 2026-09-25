// ThreeUI — AnimatedTopDock (modern / Command Bar), rev 5a736cd3c1f6f19802f61ebb10e1701b9f7aa26e
// Source: https://threeui.com/source-code/animated-top-dock.json
//
// This file is the exact upstream component with the following documented
// site adaptations (labels/actions wired to the real site navigation):
//   1. MODERN_ITEMS carries the site's six routes — Home, Projects,
//      Tower of Babel, Gov Contracts, About, Contact — instead of the
//      demo catalogue items. Home/Projects/About/Contact icons are reused
//      verbatim from the authored modern set (cube, layers, document,
//      tag); Tower of Babel (open book) and Gov Contracts (landmark) are
//      new icons drawn in the same 16px stroke style.
//   2. The brand wordmark reads "Antarctic Labs", navigates home, and
//      shows the active pill (data-active) when the route is "/".
//   3. The actions area keeps only the "Email me" mailto ghost button;
//      the "Start a project" CTA was removed (it duplicated Contact).
//   4. The demo showcase stage (aria-hidden "Everything above the fold"
//      headline) and the catalogue caption are not rendered; the bar is
//      the component here.
//   5. Two optional integration props: `activeId` (controlled active item,
//      synced when the route changes) and `onNavigate` (called with the
//      selected item's id + path). Defaults preserve standalone behaviour.
// Structure, styling hooks, motion, interactions, responsive behaviour,
// dependencies and asset paths are otherwise untouched.
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  createTopDockController,
  type TopDockOptions,
} from "./topDockController";

export type AnimatedTopDockVariant =
  | "sable"
  | "modern"
  | "retro"
  | "glass";

export type AnimatedTopDockProps = {
  className?: string;
  variant?: AnimatedTopDockVariant;
  /** site integration: id of the active nav item (synced on route change) */
  activeId?: string;
  /** site integration: called when a nav item is chosen */
  onNavigate?: (item: { id: string; path: string }) => void;
} & TopDockOptions;

type DockItem = {
  id: string;
  label: string;
  icon: ReactNode;
  path?: string;
};

type RetroReadout = { key: string; value: string };

const DOCK_CONTROLLER_DEFAULTS = {
  variant: "sable",
  proximity: 118,
  spring: 0.16,
  damping: 0.68,
  widthGrowth: 22,
  heightGrowth: 20,
  drop: 4,
} as const;

const BRAND_MARK = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#101218" />
    <rect
      x="1.5"
      y="1.5"
      width="21"
      height="21"
      rx="6"
      stroke="rgba(255,255,255,0.14)"
    />
    <path
      d="M7 15.5 12 8l5 7.5"
      stroke="#f4f5f9"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="16.4" r="1.15" fill="#8f7bff" />
  </svg>
);

const MODERN_ITEMS: readonly DockItem[] = [
  {
    id: "home",
    label: "Home",
    path: "/",
    icon: (
      <>
        <path d="M8 1.9 14.1 5v6L8 14.1 1.9 11V5z" />
        <path d="M1.9 5 8 8.1 14.1 5M8 8.1v6" />
      </>
    ),
  },
  {
    id: "projects",
    label: "Projects",
    path: "/projects",
    icon: (
      <>
        <path d="M8 1.9 14.4 5.6 8 9.3 1.6 5.6z" />
        <path d="m2.6 8 5.4 3.1L13.4 8M2.6 10.7 8 13.8l5.4-3.1" />
      </>
    ),
  },
  {
    id: "tower",
    label: "Tower of Babel",
    path: "/tower-of-babel",
    icon: (
      <>
        <path d="M3.2 2.6c1.6-.5 3.2-.5 4.8 0v10.8c-1.6-.5-3.2-.5-4.8 0z" />
        <path d="M12.8 2.6c-1.6-.5-3.2-.5-4.8 0v10.8c1.6-.5 3.2-.5 4.8 0z" />
      </>
    ),
  },
  {
    id: "gov",
    label: "Gov Contracts",
    path: "/government-contracting",
    icon: (
      <>
        <path d="M2.4 6.2 8 2.4l5.6 3.8" />
        <path d="M3.8 6.2v4.6M6.4 6.2v4.6M9.6 6.2v4.6M12.2 6.2v4.6" />
        <path d="M2.4 13.6h11.2" />
      </>
    ),
  },
  {
    id: "about",
    label: "About",
    path: "/about",
    icon: (
      <>
        <path d="M3.4 2.4h5.4l3.8 3.8v7.4H3.4z" />
        <path d="M8.8 2.4v3.8h3.8M5.9 9h4.2M5.9 11.2h3" />
      </>
    ),
  },
  {
    id: "contact",
    label: "Contact",
    path: "/contact",
    icon: (
      <>
        <path d="M8.6 2.2H13v4.4l-6.6 6.6a1.2 1.2 0 0 1-1.7 0L2.2 10.5a1.2 1.2 0 0 1 0-1.7z" />
        <circle cx="10.6" cy="4.6" r=".9" />
      </>
    ),
  },
];

const RETRO_ITEMS: readonly DockItem[] = [
  {
    id: "index",
    label: "Index",
    icon: (
      <>
        <rect x="3" y="3" width="4" height="4" />
        <rect x="9" y="3" width="4" height="4" />
        <rect x="3" y="9" width="4" height="4" />
        <rect x="9" y="9" width="1.8" height="4" />
      </>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <>
        <rect x="2.6" y="2.6" width="7" height="7" />
        <path d="M9.6 9.6l3.8 3.8M11.4 11.4h1.8v1.8h-1.8z" />
      </>
    ),
  },
  {
    id: "cart",
    label: "Cart",
    icon: (
      <>
        <path d="M2.4 3.4h2.2l1.4 6.4h6.6l1.4-4.6H5" />
        <rect x="5.6" y="11.4" width="1.8" height="1.8" />
        <rect x="10.4" y="11.4" width="1.8" height="1.8" />
      </>
    ),
  },
  {
    id: "account",
    label: "Account",
    icon: (
      <>
        <circle cx="8" cy="5.4" r="2.6" />
        <path d="M2.8 13.4c.7-2.8 2.7-4.2 5.2-4.2s4.5 1.4 5.2 4.2" />
      </>
    ),
  },
];

const RETRO_READOUT: readonly RetroReadout[] = [
  { key: "SYS", value: "READY" },
  { key: "MEM", value: "640K" },
  { key: "CRT", value: "60HZ" },
];

const GLASS_ITEMS: readonly DockItem[] = [
  {
    id: "prism-home",
    label: "Home",
    icon: (
      <>
        <path d="M8 2.2 13.8 6v6.2L8 14.6 2.2 12.2V6z" />
        <path d="M8 2.2v6.6M2.2 6l5.8 2.8 5.8-2.8" />
      </>
    ),
  },
  {
    id: "prism-work",
    label: "Work",
    icon: (
      <>
        <rect x="2.4" y="3" width="11.2" height="8.4" rx="1.6" />
        <path d="M5.4 13.8h5.2M8 11.4v2.4" />
      </>
    ),
  },
  {
    id: "prism-lab",
    label: "Lab",
    icon: (
      <>
        <path d="M6.4 2.2h3.2M7.2 2.2v4.2L3.2 12a1.4 1.4 0 0 0 1.2 2.1h7.2A1.4 1.4 0 0 0 12.8 12L8.8 6.4V2.2" />
        <path d="M5.2 10.4h5.6" />
      </>
    ),
  },
  {
    id: "prism-mail",
    label: "Mail",
    icon: (
      <>
        <rect x="2.2" y="3.6" width="11.6" height="8.8" rx="1.6" />
        <path d="m3 5 5 3.6L13 5" />
      </>
    ),
  },
];

const SABLE_BRAND = { word: "Lumina", glyph: "◍" };

const VARIANT_ITEMS: Record<AnimatedTopDockVariant, readonly DockItem[]> = {
  sable: MODERN_ITEMS,
  modern: MODERN_ITEMS,
  retro: RETRO_ITEMS,
  glass: GLASS_ITEMS,
};


function useDockController<T extends HTMLElement>(
  options: TopDockOptions & { variant: AnimatedTopDockVariant },
) {
  const rootRef = useRef<T | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const getOptions = () => optionsRef.current;
    const controller = createTopDockController(root, getOptions);
    return () => controller.destroy();
  }, []);
  return rootRef;
}

function DockIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="animated-top-dock__icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const preventDefault = (event: { preventDefault: () => void }) =>
  event.preventDefault();

export function AnimatedTopDock({
  className = "",
  variant = DOCK_CONTROLLER_DEFAULTS.variant,
  proximity = DOCK_CONTROLLER_DEFAULTS.proximity,
  spring = DOCK_CONTROLLER_DEFAULTS.spring,
  damping = DOCK_CONTROLLER_DEFAULTS.damping,
  widthGrowth = DOCK_CONTROLLER_DEFAULTS.widthGrowth,
  heightGrowth = DOCK_CONTROLLER_DEFAULTS.heightGrowth,
  drop = DOCK_CONTROLLER_DEFAULTS.drop,
  activeId,
  onNavigate,
}: AnimatedTopDockProps) {
  const items = VARIANT_ITEMS[variant];
  const [active, setActive] = useState(activeId ?? items[0].id);
  useEffect(() => {
    if (activeId !== undefined) setActive(activeId);
  }, [activeId]);
  const selectItem = (item: DockItem) => {
    setActive(item.id);
    if (item.path && onNavigate) onNavigate({ id: item.id, path: item.path });
  };
  const controllerOptions = {
    variant,
    proximity,
    spring,
    damping,
    widthGrowth,
    heightGrowth,
    drop,
    // Matches the authored demo wiring (lockTrack: variant === "modern"):
    // the modern bar hugs its own content, so the track is pinned to its
    // rest width and magnified items overflow it instead of widening the
    // bar (which would resize the measured box and cancel the spring).
    lockTrack: variant === "modern",
  };
  const classes = `animated-top-dock-component atd-${variant}${
    className ? ` ${className}` : ""
  }`;

  if (variant === "modern") {
    return (
      <ModernDock
        className={classes}
        items={items}
        active={active}
        onSelect={selectItem}
        options={controllerOptions}
      />
    );
  }

  if (variant === "retro") {
    return (
      <RetroDock
        className={classes}
        items={items}
        active={active}
        onSelect={selectItem}
        options={controllerOptions}
      />
    );
  }

  if (variant === "glass") {
    return (
      <GlassDock
        className={classes}
        items={items}
        active={active}
        onSelect={selectItem}
        options={controllerOptions}
      />
    );
  }

  return (
    <SableDock
      className={classes}
      items={items}
      active={active}
      onSelect={selectItem}
      options={controllerOptions}
    />
  );
}

type DockShellProps = {
  className: string;
  items: readonly DockItem[];
  active: string;
  onSelect: (item: DockItem) => void;
  options: TopDockOptions & { variant: AnimatedTopDockVariant };
};

function ModernDock({ className, items, active, onSelect, options }: DockShellProps) {
  const dockRef = useDockController<HTMLElement>(options);
  const homeItem = items[0];
  return (
    <div className={className}>
      <div className="atd-modern__aurora" aria-hidden="true" />
      <header className="atd-modern__bar">
        <a
          className="atd-modern__brand"
          href="/"
          data-active={active === homeItem.id}
          aria-current={active === homeItem.id ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            onSelect(homeItem);
          }}
        >
          <span className="atd-modern__mark" aria-hidden="true">
            {BRAND_MARK}
          </span>
          <span className="atd-modern__word">Antarctic Labs</span>
        </a>
        <nav
          ref={dockRef as React.RefObject<HTMLElement>}
          className="atd-modern__dock"
          aria-label="Primary"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="atd-modern__item"
              data-dock-item={item.id}
              aria-pressed={active === item.id}
              onClick={() => onSelect(item)}
            >
              <span className="atd-modern__icon" aria-hidden="true">
                <DockIcon>{item.icon}</DockIcon>
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="atd-modern__actions">
          <button
            className="atd-modern__ghost"
            type="button"
            onClick={() => {
              window.location.href = "mailto:hello@antarcticlabs.com";
            }}
          >
            Email me
          </button>
        </div>
      </header>
    </div>
  );
}

function RetroDock({ className, items, active, onSelect, options }: DockShellProps) {
  const dockRef = useDockController<HTMLElement>(options);
  return (
    <div className={className}>
      <header className="atd-retro__bar">
        <span className="atd-retro__brand">
          <span className="atd-retro__word">LUMINA</span>
          <span className="atd-retro__sub">v2.6</span>
        </span>
        <div className="atd-retro__readout" aria-hidden="true">
          {RETRO_READOUT.map((entry) => (
            <span key={entry.key}>
              <b>{entry.key}</b>
              {entry.value}
            </span>
          ))}
        </div>
        <nav
          ref={dockRef as React.RefObject<HTMLElement>}
          className="atd-retro__dock"
          aria-label="Primary"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="atd-retro__item"
              data-dock-item={item.id}
              aria-pressed={active === item.id}
              onClick={() => onSelect(item)}
            >
              <span className="atd-retro__glyph" aria-hidden="true">
                <DockIcon>{item.icon}</DockIcon>
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </header>
    </div>
  );
}

function GlassDock({ className, items, active, onSelect, options }: DockShellProps) {
  const dockRef = useDockController<HTMLElement>(options);
  return (
    <div className={className}>
      <div className="atd-glass__stage" aria-hidden="true" />
      <header className="atd-glass__bar">
        <a
          className="atd-glass__brand"
          href="#top-dock"
          onClick={preventDefault}
        >
          <span className="atd-glass__mark" aria-hidden="true">
            {BRAND_MARK}
          </span>
          <span className="atd-glass__word">Lumina</span>
        </a>
        <nav
          ref={dockRef as React.RefObject<HTMLElement>}
          className="atd-glass__dock"
          aria-label="Primary"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="atd-glass__item"
              data-dock-item={item.id}
              aria-pressed={active === item.id}
              onClick={() => onSelect(item)}
            >
              <span className="atd-glass__icon" aria-hidden="true">
                <DockIcon>{item.icon}</DockIcon>
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="atd-glass__cta" type="button">
          <span>Open console</span>
        </button>
      </header>
    </div>
  );
}

function SableDock({ className, items, active, onSelect, options }: DockShellProps) {
  const dockRef = useDockController<HTMLElement>(options);
  return (
    <div className={className}>
      <div className="animated-top-dock__frame">
        <header className="animated-top-dock__bar">
          <a
            className="animated-top-dock__brand"
            href="#top-dock"
            onClick={preventDefault}
          >
            <span className="animated-top-dock__glyph" aria-hidden="true">
              {SABLE_BRAND.glyph}
            </span>
            <span className="animated-top-dock__word">
              {SABLE_BRAND.word}
            </span>
          </a>
          <nav
            ref={dockRef as React.RefObject<HTMLElement>}
            className="animated-top-dock__dock"
            aria-label="Primary"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="animated-top-dock__item"
                data-dock-item={item.id}
                aria-pressed={active === item.id}
                onClick={() => onSelect(item)}
              >
                <span className="animated-top-dock__icon" aria-hidden="true">
                  <DockIcon>{item.icon}</DockIcon>
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button className="animated-top-dock__cta" type="button">
            Get started
          </button>
        </header>
      </div>
    </div>
  );
}

export type { CSSProperties };
