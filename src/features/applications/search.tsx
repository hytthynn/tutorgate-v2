"use client";
import { Search } from "lucide-react";
import { useAutoFilters } from "@/components/shared/use-auto-filters";
const parse = (params: URLSearchParams) => ({q:params.get("q") ?? ""});
export function ApplicationSearch({q}:{q:string}) {
  const {filters,change,pending}=useAutoFilters({q},parse,(state,base)=>{
    const params=new URLSearchParams(base);params.delete("page");
    if(state.q.trim())params.set("q",state.q);else params.delete("q");
    return params.toString();
  });
  return <div className="search-input application-search" aria-busy={pending}>
    <Search size={16} aria-hidden />
    <input aria-label="Поиск заявок по имени или Telegram" placeholder="Имя или @username…" maxLength={150} value={filters.q} onChange={event=>change({q:event.target.value},300)} />
  </div>;
}
