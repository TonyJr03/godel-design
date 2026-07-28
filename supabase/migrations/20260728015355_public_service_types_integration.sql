drop policy if exists tipos_servicio_select_public
on public.tipos_servicio;

create policy tipos_servicio_select_public
on public.tipos_servicio
for select
to anon, authenticated
using (is_publicly_available = true);

drop policy if exists solicitudes_insert_public
on public.solicitudes;

create policy solicitudes_insert_public
on public.solicitudes
for insert
to anon, authenticated
with check (
  status = 'nueva'::public.solicitud_estado
  and reviewed_by is null
  and converted_order_id is null
  and cliente_id is null
  and service_id is not null
  and btrim(client_name) <> ''
  and btrim(client_phone) <> ''
  and btrim(service_type) <> ''
  and btrim(description) <> ''
  and exists (
    select 1
    from public.tipos_servicio as ts
    where ts.id = service_id
      and ts.is_publicly_available = true
      and ts.workflow_type = workflow_type
      and ts.name = service_type
  )
);
