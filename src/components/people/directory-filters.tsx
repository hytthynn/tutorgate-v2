"use client";
import { useCallback } from "react";
import { Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useAutoFilters } from "@/components/shared/use-auto-filters";
import { directoryQuery } from "@/lib/filters";

export function DirectoryFilters({ kind, q, filter, options }: {
  kind: "tutors" | "students"; q: string; filter: string;
  options: { value: string; label: string }[];
}) {
  const key = kind === "tutors" ? "subject" : "tutor";
  const parse = useCallback((params: URLSearchParams) => ({ q: params.get("q") ?? "", filter: params.get(key) ?? "" }), [key]);
  const { filters, change, pending } = useAutoFilters({ q, filter }, parse,
    (state, base) => directoryQuery(state, key, base));
  return <div className="directory-filters" aria-busy={pending}>
    <div className="search-input">
      <Search size={16} aria-hidden="true" />
      <input aria-label="Поиск по ФИО" name="q" placeholder="Поиск по имени…" maxLength={150}
        value={filters.q} onChange={event => change({ q: event.target.value }, 300)} />
    </div>
    <Select searchable={kind === "students"} aria-label={kind === "tutors" ? "Фильтр по предмету" : "Фильтр по репетитору"}
      name={key} value={filters.filter} onValueChange={value => change({ filter: value })}>
      <option value="">{kind === "tutors" ? "Все предметы" : "Все репетиторы"}</option>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </Select>
  </div>;
}
