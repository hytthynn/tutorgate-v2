"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Synchronous draft ref prevents a queued search from overwriting a newer select.
 * Our RSC acknowledgements never replace a newer draft (including incomplete dates).
 * External URLs and Back/Forward cancel the timer and restore the controls.
 */
export function useAutoFilters<T extends object>(initial: T,
  parse: (params: URLSearchParams) => T,
  serialize: (state: T, base: string) => string | null,
) {
  const router = useRouter(), path = usePathname(), params = useSearchParams();
  const query = params.toString();
  const [filters, setFilters] = useState(initial);
  const current = useRef(initial), lastQuery = useRef(query);
  const ownQueries = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function restore() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null; ownQueries.current.clear();
      const search = window.location.search.slice(1);
      lastQuery.current = search;
      current.current = parse(new URLSearchParams(search)); setFilters(current.current);
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [parse]);
  useEffect(() => {
    if (query === lastQuery.current) return;
    lastQuery.current = query;
    if (ownQueries.current.delete(query)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    current.current = parse(new URLSearchParams(query));
    // The browser URL is an external store; this synchronizes external navigation.
    setFilters(current.current);
  }, [query, parse]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function change(patch: Partial<T>, delay = 0) {
    const next = { ...current.current, ...patch };
    current.current = next; setFilters(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const apply = () => {
      timer.current = null;
      const nextQuery = serialize(current.current, lastQuery.current);
      if (nextQuery === null || (nextQuery === lastQuery.current && ownQueries.current.size === 0)) return;
      ownQueries.current.add(nextQuery);
      startTransition(() => router.replace(nextQuery ? `${path}?${nextQuery}` : path, { scroll: false }));
    };
    if (delay) timer.current = setTimeout(apply, delay); else apply();
  }
  return { filters, change, pending };
}
