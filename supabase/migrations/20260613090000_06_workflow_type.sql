create type public.workflow_type as enum (
  'encargo',
  'impresion'
);

alter table public.solicitudes
add column workflow_type public.workflow_type not null default 'encargo';

alter table public.pedidos
add column workflow_type public.workflow_type not null default 'encargo';

create index if not exists solicitudes_workflow_type_idx
on public.solicitudes (workflow_type);

create index if not exists pedidos_workflow_type_idx
on public.pedidos (workflow_type);
