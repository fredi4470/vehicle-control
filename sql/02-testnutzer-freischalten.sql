-- Zuerst Authentication > Users > Add user > Create new user.
-- Die dort verwendete E-Mail hier einsetzen. Kein Passwort hier eintragen.
do $$
declare selected_id uuid;
begin
  select id into selected_id from auth.users
    where lower(email) = lower('federico-99@web.de');
  if selected_id is null then
    raise exception 'Testnutzer nicht gefunden. Erst in Authentication anlegen und E-Mail im SQL ersetzen.';
  end if;
  insert into vc_private.members(user_id) values(selected_id) on conflict do nothing;
end;
$$;
