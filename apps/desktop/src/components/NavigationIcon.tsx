import type { PageName } from "../navigation";

// Cortex marks: offset dialogue, layered knowledge, connected orbit, adjustment axes.
export function NavigationIcon({ page }: { page: PageName }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {page === "chat" && (
        <>
          <path d="M4 5h13v10H9l-5 4V5Z" />
          <path d="M9 2h12v10M8 9h5" />
        </>
      )}
      {page === "knowledge" && (
        <>
          <path d="m4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4" />
          <path d="M12 11v5" />
        </>
      )}
      {page === "graph" && (
        <>
          <circle cx="6" cy="7" r="3" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="15" cy="18" r="3" />
          <path d="m9 7 7-1M8 9l5 7m4-8-2 7" />
        </>
      )}
      {page === "settings" && (
        <>
          <path d="M4 7h7m5 0h4M4 17h3m5 0h8" />
          <path d="M11 4h5v6h-5zM7 14h5v6H7z" />
        </>
      )}
    </svg>
  );
}
