create extension if not exists pgcrypto;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  pin text,
  country_code text default 'IN',
  role text not null default 'customer' check(role in ('customer','admin')),
  created_at timestamptz default now()
);

create table if not exists public.products(
  id text primary key,
  name text not null,
  description text,
  price numeric(10,2) not null default 699,
  discount numeric(10,2) not null default 0,
  image_url text,
  image_urls jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  state text,
  pin text not null,
  country_code text default 'IN',
  items jsonb not null,
  total numeric(10,2) not null,
  payment_method text default 'upi',
  upi_id text,
  utr text,
  payment_status text not null default 'pending_payment',
  status text not null default 'awaiting_payment',
  delivery_date date,
  created_at timestamptz default now()
);

-- Safe upgrades for an existing database.
alter table public.products add column if not exists image_urls jsonb not null default '[]'::jsonb;
update public.products set image_urls=jsonb_build_array(image_url) where image_url is not null and image_urls='[]'::jsonb;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.profiles
    where id=auth.uid()
      and (role='admin' or lower(email)='wafaabbas1636@gmail.com')
  );
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,full_name,email,role)
 values(
   new.id,
   coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),
   new.email,
   case when lower(new.email)='wafaabbas1636@gmail.com' then 'admin' else 'customer' end
 )
 on conflict(id) do update set email=excluded.email, role=case when lower(excluded.email)='wafaabbas1636@gmail.com' then 'admin' else public.profiles.role end;
 return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select using(id=auth.uid() or public.is_admin());
drop policy if exists "profile self insert" on public.profiles;
create policy "profile self insert" on public.profiles for insert with check(id=auth.uid() and (role='customer' or public.is_admin()));
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());

drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using(active=true or public.is_admin());
drop policy if exists "admin products insert" on public.products;
create policy "admin products insert" on public.products for insert with check(public.is_admin());
drop policy if exists "admin products update" on public.products;
create policy "admin products update" on public.products for update using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admin products delete" on public.products;
create policy "admin products delete" on public.products for delete using(public.is_admin());

drop policy if exists "orders own read" on public.orders;
create policy "orders own read" on public.orders for select using(user_id=auth.uid() or public.is_admin());
drop policy if exists "orders own insert" on public.orders;
create policy "orders own insert" on public.orders for insert with check(user_id=auth.uid());
drop policy if exists "admin order update" on public.orders;
create policy "admin order update" on public.orders for update using(public.is_admin()) with check(public.is_admin());

-- Product image storage. The bucket is public so storefront images can load.
insert into storage.buckets(id,name,public) values('product-images','product-images',true)
on conflict(id) do update set public=true;

drop policy if exists "admin product image upload" on storage.objects;
create policy "admin product image upload" on storage.objects for insert to authenticated
with check(bucket_id='product-images' and public.is_admin());

drop policy if exists "admin product image update" on storage.objects;
create policy "admin product image update" on storage.objects for update to authenticated
using(bucket_id='product-images' and public.is_admin())
with check(bucket_id='product-images' and public.is_admin());

drop policy if exists "admin product image delete" on storage.objects;
create policy "admin product image delete" on storage.objects for delete to authenticated
using(bucket_id='product-images' and public.is_admin());

drop policy if exists "public product image read" on storage.objects;
create policy "public product image read" on storage.objects for select to public
using(bucket_id='product-images');

insert into public.products(id,name,description,price,discount,active,image_urls)
values
('moon-dust','Moon Dust','Warm vanilla · amber · soft woods',699,0,true,'[]'::jsonb),
('midnight-tea','Midnight Tea','Black tea · cedar · quiet musk',749,0,true,'[]'::jsonb),
('soft-orbit','Soft Orbit','Cream · sandalwood · cashmere',649,0,true,'[]'::jsonb),
('after-rain','After Rain','Rainwater · jasmine · moss',699,0,true,'[]'::jsonb)
on conflict(id) do nothing;

create or replace function public.create_upi_order(p_items jsonb) returns public.orders
language plpgsql security definer set search_path=public as $$
declare
 p public.profiles%rowtype; i jsonb; prod public.products%rowtype; qty integer;
 total numeric(10,2):=0; snapshot jsonb:='[]'::jsonb; o public.orders%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or nullif(trim(p.full_name),'') is null or nullif(trim(p.phone),'') is null
 or nullif(trim(p.address),'') is null or nullif(trim(p.city),'') is null
 or nullif(trim(p.pin),'') is null then raise exception 'Complete delivery profile first'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Cart is empty'; end if;
 for i in select value from jsonb_array_elements(p_items) loop
  qty:=greatest(1,least(25,coalesce((i->>'qty')::integer,1)));
  select * into prod from public.products where id=i->>'product_id' and active=true;
  if prod.id is null then raise exception 'Invalid product'; end if;
  total:=total+greatest(0,prod.price-coalesce(prod.discount,0))*qty;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('product_id',prod.id,'name',prod.name,'qty',qty,'price',greatest(0,prod.price-coalesce(prod.discount,0))));
 end loop;
 insert into public.orders(user_id,customer_name,phone,address,city,state,pin,country_code,items,total,payment_method,upi_id)
 values(auth.uid(),p.full_name,p.phone,p.address,p.city,p.state,p.pin,p.country_code,snapshot,total,'upi','abbaswafa@fam') returning * into o;
 return o;
end;$$;
grant execute on function public.create_upi_order(jsonb) to authenticated;

create or replace function public.submit_payment_reference(p_order_id uuid,p_utr text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_utr is null or length(trim(p_utr))<6 or length(trim(p_utr))>40 then raise exception 'Invalid transaction reference'; end if;
 update public.orders set utr=trim(p_utr),payment_status='pending_verification',status='payment_submitted'
 where id=p_order_id and user_id=auth.uid() and payment_status='pending_payment';
 if not found then raise exception 'Order not found or payment already submitted'; end if;
end;$$;
grant execute on function public.submit_payment_reference(uuid,text) to authenticated;


-- Admin-only payment verification.
-- Customers may submit a UTR, but only an authenticated admin can approve/reject it.
create or replace function public.admin_verify_payment(p_order_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_approved then
    update public.orders
      set payment_status='verified',
          status=case
            when status in ('awaiting_payment','payment_submitted') then 'payment_verified'
            else status
          end
    where id=p_order_id
      and payment_status='pending_verification'
      and utr is not null;

    if not found then
      raise exception 'Payment is not awaiting verification or UTR is missing';
    end if;
  else
    update public.orders
      set payment_status='rejected',
          status='payment_submitted'
    where id=p_order_id
      and payment_status='pending_verification';

    if not found then
      raise exception 'Payment is not awaiting verification';
    end if;
  end if;
end;
$$;

revoke all on function public.admin_verify_payment(uuid,boolean) from public;
grant execute on function public.admin_verify_payment(uuid,boolean) to authenticated;
