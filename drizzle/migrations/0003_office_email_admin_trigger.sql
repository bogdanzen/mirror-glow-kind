create or replace function public.grant_admin_foundation_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(new.email, '')) in ('fundatiaverticalfreedom@gmail.com', 'office@verticalfreedom.org') then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$function$;