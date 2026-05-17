-- Image generation queue: server-side processing instead of client-triggered
-- Prevents duplicate generation when many users view the same imageless event.

create table if not exists public.image_generation_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  source text not null check (source in ('post', 'community')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts smallint not null default 0,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Fast lookup for pending items (oldest first)
create index idx_imgq_pending
  on public.image_generation_queue (created_at asc)
  where status = 'pending';

-- Prevent duplicate pending/processing entries for same event
create unique index idx_imgq_dedup
  on public.image_generation_queue (event_id, source)
  where status in ('pending', 'processing');

-- RLS: only service role can access queue
alter table public.image_generation_queue enable row level security;

-- Auto-queue function
create or replace function public.fn_auto_queue_image()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.image_generation_queue (event_id, source)
  values (
    NEW.id,
    case when TG_TABLE_NAME = 'posts' then 'post' else 'community' end
  )
  on conflict do nothing;
  return NEW;
end;
$$;

-- Trigger: auto-queue when tapahtuma post created without image
create trigger trg_auto_queue_post_image
  after insert on public.posts
  for each row
  when (NEW.image_url is null and NEW.type = 'tapahtuma')
  execute function public.fn_auto_queue_image();

-- Trigger: auto-queue when community event created without image
create trigger trg_auto_queue_community_image
  after insert on public.community_events
  for each row
  when (NEW.image_url is null)
  execute function public.fn_auto_queue_image();

-- Enable pg_net for HTTP calls from cron
create extension if not exists pg_net with schema extensions;

-- Enable pg_cron for scheduled processing
create extension if not exists pg_cron with schema extensions;

-- Atomic claim function: prevents concurrent workers from picking the same items
create or replace function public.claim_image_queue_items(batch_size int default 3)
returns setof public.image_generation_queue
language plpgsql
security definer
as $$
begin
  return query
  update public.image_generation_queue
  set status = 'processing',
      attempts = attempts + 1
  where id in (
    select id from public.image_generation_queue
    where status = 'pending' and attempts < 3
    order by created_at asc
    limit batch_size
    for update skip locked
  )
  returning *;
end;
$$;
