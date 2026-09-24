-- Nur im vorgesehenen Testprojekt ausführen. Transaktion: alles oder nichts.
-- Eigene vc_-Tabellen; keine bestehenden Tabellen werden gelöscht.
begin;
create schema if not exists vc_private;
revoke all on schema vc_private from public, anon, authenticated;
grant usage on schema vc_private to authenticated;
create table if not exists vc_private.members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table vc_private.members enable row level security;
revoke all on vc_private.members from public, anon, authenticated;

create table if not exists public.vc_areas (
  id smallint primary key check (id between 1 and 15), name text not null
);
create table if not exists public.vc_vehicles (
  id text primary key,
  vin text not null unique check (char_length(vin) = 17),
  brand text not null, model text not null, condition text not null,
  qr_id text not null unique,
  area_id smallint references public.vc_areas(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz
);
create table if not exists public.vc_moves (
  id bigint generated always as identity primary key,
  vehicle_id text not null references public.vc_vehicles(id),
  from_area smallint references public.vc_areas(id),
  to_area smallint not null references public.vc_areas(id),
  actor_id uuid not null, created_at timestamptz not null default now()
);
create index if not exists vc_moves_vehicle_idx on public.vc_moves(vehicle_id,id desc);

create or replace function vc_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from vc_private.members where user_id = auth.uid());
$$;
revoke all on function vc_private.is_member() from public, anon, authenticated;
grant execute on function vc_private.is_member() to authenticated;

create or replace function public.vc_require_member() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not vc_private.is_member() then
    raise exception 'Dieser App-Nutzer ist noch nicht freigeschaltet.' using errcode = '42501';
  end if;
  return true;
end;
$$;
revoke all on function public.vc_require_member() from public, anon, authenticated;
grant execute on function public.vc_require_member() to authenticated;

alter table public.vc_areas enable row level security;
alter table public.vc_vehicles enable row level security;
alter table public.vc_moves enable row level security;
revoke all on public.vc_areas, public.vc_vehicles, public.vc_moves from public, anon, authenticated;
grant select on public.vc_areas, public.vc_vehicles, public.vc_moves to authenticated;
grant usage on schema public to authenticated;
-- Re-running updates only our own named policies.
drop policy if exists vc_member_read on public.vc_areas;
create policy vc_member_read on public.vc_areas for select to authenticated using ((select vc_private.is_member()));
drop policy if exists vc_member_read on public.vc_vehicles;
create policy vc_member_read on public.vc_vehicles for select to authenticated using ((select vc_private.is_member()));
drop policy if exists vc_member_read on public.vc_moves;
create policy vc_member_read on public.vc_moves for select to authenticated using ((select vc_private.is_member()));

-- All browser writes use this transaction; direct table writes are denied.
create or replace function public.vc_move_vehicle(p_id text, p_area integer, p_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_vehicle public.vc_vehicles%rowtype;
begin
  perform public.vc_require_member();
  if p_area is null or p_area < 1 or p_area > 15 then
    raise exception 'Bitte ein Parkareal von 1 bis 15 auswählen.' using errcode = '22023';
  end if;
  select * into current_vehicle from public.vc_vehicles where id = p_id for update;
  if not found then raise exception 'Fahrzeug nicht gefunden.'; end if;
  if p_version is distinct from current_vehicle.version then
    raise exception 'Standort inzwischen geändert. Dialog schließen, Aktualisieren klicken und Fahrzeug erneut öffnen.' using errcode = 'P0001';
  end if;
  if current_vehicle.area_id is not distinct from p_area then return current_vehicle.version; end if;
  insert into public.vc_moves(vehicle_id,from_area,to_area,actor_id)
    values(p_id,current_vehicle.area_id,p_area,auth.uid());
  update public.vc_vehicles set area_id = p_area, version = version + 1, updated_at = now() where id = p_id;
  return current_vehicle.version + 1;
end;
$$;
revoke all on function public.vc_move_vehicle(text,integer,integer) from public, anon, authenticated;
grant execute on function public.vc_move_vehicle(text,integer,integer) to authenticated;
insert into public.vc_areas(id,name)
  select n, 'Parkareal ' || lpad(n::text,2,'0') from generate_series(1,15) n
  on conflict(id) do nothing;

insert into public.vc_vehicles(id,vin,brand,model,condition,qr_id,area_id) values
('demo-1','TEST0000000000001','Hyundai','Tucson','Gebrauchtwagen','VC-DEMO-0001','1'),
('demo-2','TEST0000000000002','Ford','Focus','Neuwagen','VC-DEMO-0002','2'),
('demo-3','TEST0000000000003','Kia','Sportage','Neuwagen','VC-DEMO-0003','3'),
('demo-4','TEST0000000000004','Renault','Clio','Gebrauchtwagen','VC-DEMO-0004','4'),
('demo-5','TEST0000000000005','BYD','Atto 3','Neuwagen','VC-DEMO-0005','5'),
('demo-6','TEST0000000000006','Volkswagen','Golf','Neuwagen','VC-DEMO-0006','6'),
('demo-7','TEST0000000000007','Hyundai','i20','Gebrauchtwagen','VC-DEMO-0007',NULL),
('demo-8','TEST0000000000008','Ford','Kuga','Neuwagen','VC-DEMO-0008','8'),
('demo-9','TEST0000000000009','Kia','Ceed','Neuwagen','VC-DEMO-0009','9'),
('demo-10','TEST0000000000010','Renault','Captur','Gebrauchtwagen','VC-DEMO-0010','10'),
('demo-11','TEST0000000000011','BYD','Seal','Neuwagen','VC-DEMO-0011','11'),
('demo-12','TEST0000000000012','Volkswagen','Tiguan','Neuwagen','VC-DEMO-0012','12'),
('demo-13','TEST0000000000013','Hyundai','IONIQ 5','Gebrauchtwagen','VC-DEMO-0013',NULL),
('demo-14','TEST0000000000014','Ford','Puma','Neuwagen','VC-DEMO-0014','14'),
('demo-15','TEST0000000000015','Kia','EV6','Neuwagen','VC-DEMO-0015','15'),
('demo-16','TEST0000000000016','Renault','Megane','Gebrauchtwagen','VC-DEMO-0016','1'),
('demo-17','TEST0000000000017','BYD','Dolphin','Neuwagen','VC-DEMO-0017','2'),
('demo-18','TEST0000000000018','Opel','Corsa','Neuwagen','VC-DEMO-0018','3'),
('demo-19','TEST0000000000019','Škoda','Octavia','Gebrauchtwagen','VC-DEMO-0019','4'),
('demo-20','TEST1000000000001','Toyota','Yaris','Neuwagen','VC-DEMO-0020','5')
on conflict(id) do nothing;
commit;
