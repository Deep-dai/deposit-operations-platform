-- Private delivery receipts only. No document bodies or Webhook values are stored here.
create table if not exists public.wecom_relay_jobs (
  id text primary key,
  issue_key text not null unique,
  fingerprint text not null,
  version integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wecom_relay_jobs enable row level security;
create table if not exists public.wecom_relay_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);
alter table public.wecom_relay_attempts enable row level security;

-- Called with a server-only API Key. Invoker rights + RLS deny ordinary website users.
-- One transaction serializes creation, compare-and-swap and send-attempt reservation.
create or replace function public.wecom_relay_write(
  p_id text, p_expected integer, p_issue_key text, p_fingerprint text,
  p_data jsonb, p_send boolean default false
) returns jsonb language plpgsql set search_path = public as $$
declare r public.wecom_relay_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(612047139);
  if p_expected = -1 then
    select * into r from public.wecom_relay_jobs where id=p_id;
    if found then return to_jsonb(r); end if;
    select * into r from public.wecom_relay_jobs where issue_key=p_issue_key;
    if found then
      if r.fingerprint=p_fingerprint or exists(select 1 from jsonb_array_elements(r.data->'items') i where i->>'status'<>'failed') then
        return to_jsonb(r);
      end if;
      update public.wecom_relay_jobs set issue_key=issue_key||':archived:'||id where id=r.id;
    end if;
    insert into public.wecom_relay_jobs(id,issue_key,fingerprint,data)
      values(p_id,p_issue_key,p_fingerprint,p_data) returning * into r;
  else
    select * into r from public.wecom_relay_jobs where id=p_id for update;
    if not found or r.version <> p_expected then return null; end if;
    if p_send then
      if (select count(*) from public.wecom_relay_attempts where created_at > now()-interval '1 minute') >= 20 then
        raise exception 'WECOM_MINUTE_SEND_LIMIT';
      end if;
      insert into public.wecom_relay_attempts default values;
    end if;
    update public.wecom_relay_jobs set data=p_data,version=version+1,updated_at=now()
      where id=p_id returning * into r;
  end if;
  return to_jsonb(r);
end $$;
