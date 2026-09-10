begin;
select pg_advisory_xact_lock(842106001);
create table private.latex_settings (
 id boolean primary key default true check(id),
 config jsonb not null,
 updated_at timestamptz not null default now()
);
insert into private.latex_settings(config) values(jsonb_build_object(
 'packages',array['amsmath','amssymb','mathtools','tikz','pgfplots','array','booktabs','tabularx','longtable','multirow','makecell','xparse','etoolbox','asymptote'],
 'preamble',E'\\usetikzlibrary{arrows.meta,calc,positioning,decorations.pathmorphing,patterns,angles,quotes}\n\\pgfplotsset{compat=1.18}', 'libraries','[]'::jsonb));
revoke all on private.latex_settings from public,anon,authenticated;
create function public.latex_settings_read() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then raise exception 'Forbidden' using errcode='42501'; end if;
 return (select config from private.latex_settings where id);
end $$;
create function public.latex_settings_save(p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
 if octet_length(p_config::text)>140000 then raise exception 'Configuration too large'; end if;
 if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_config->'packages') is distinct from 'array' or jsonb_typeof(p_config->'libraries') is distinct from 'array' or jsonb_typeof(p_config->'preamble') is distinct from 'string' then raise exception 'Invalid configuration'; end if;
 if jsonb_array_length(p_config->'packages')>60 or jsonb_array_length(p_config->'libraries')>8 or length(p_config->>'preamble')>16000 then raise exception 'Configuration too large'; end if;
 for item in select value from jsonb_array_elements(p_config->'packages') loop
 if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[a-zA-Z][a-zA-Z0-9-]{0,63}$' then raise exception 'Invalid package'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_config->'libraries') loop
 if jsonb_typeof(item->'name') is distinct from 'string' or (item->>'name') !~ '^[a-zA-Z][a-zA-Z0-9_-]{0,63}\.(sty|asy)$' or jsonb_typeof(item->'source') is distinct from 'string' or length(item->>'source')>16000 then raise exception 'Invalid library'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_config->'libraries')) <> (select count(distinct value->>'name') from jsonb_array_elements(p_config->'libraries')) then raise exception 'Duplicate library'; end if;
 update private.latex_settings set config=jsonb_build_object('packages',p_config->'packages','preamble',p_config->'preamble','libraries',p_config->'libraries'),updated_at=now() where id;
 return (select config from private.latex_settings where id);
end $$;
revoke all on function public.latex_settings_read(), public.latex_settings_save(jsonb) from public,anon;
grant execute on function public.latex_settings_read(), public.latex_settings_save(jsonb) to authenticated;
commit;
