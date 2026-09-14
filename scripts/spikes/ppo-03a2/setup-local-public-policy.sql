-- PPO-03A.2 only: local, temporary, and deliberately narrower than production.
drop policy if exists godel_files_insert_ppo03a2_public_sign on storage.objects;
drop function if exists private.can_insert_ppo03a2_public_sign(text, text);

create function private.can_insert_ppo03a2_public_sign(
  object_bucket_id text,
  object_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if object_bucket_id <> 'godel-files'
    or object_name is null
    or object_name !~ '^solicitudes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/originales/ppo-03a2-[^/]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.solicitudes as s
    where s.id::text = split_part(object_name, '/', 2)
  );
end;
$$;

revoke all on function private.can_insert_ppo03a2_public_sign(text, text) from public;
grant execute on function private.can_insert_ppo03a2_public_sign(text, text) to anon;

create policy godel_files_insert_ppo03a2_public_sign
on storage.objects
for insert
to anon
with check (
  bucket_id = 'godel-files'
  and private.can_insert_ppo03a2_public_sign(bucket_id, name)
);
