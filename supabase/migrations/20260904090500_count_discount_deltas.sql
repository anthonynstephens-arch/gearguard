create or replace function public.gg_import_shopify_order(
  p_account_id uuid, p_shopify_order_id text, p_shopify_order_name text,
  p_order_created_at timestamptz, p_amount numeric
) returns jsonb language plpgsql set search_path='public','pg_temp' as $$
declare a public.allowance_accounts%rowtype; o public.shopify_order_imports%rowtype; inserted_id uuid; available numeric; deducted numeric; next_balance numeric; delta numeric;
begin
  if p_amount < 0 then raise exception 'Order amount cannot be negative'; end if;
  select * into a from public.allowance_accounts where id=p_account_id for update;
  if not found then raise exception 'Allowance account not found'; end if;
  select * into o from public.shopify_order_imports where department_id=a.department_id and shopify_order_id=p_shopify_order_id for update;
  if found then
    delta:=greatest(0,p_amount-o.order_amount);
    if delta=0 then return jsonb_build_object('imported',false,'adjusted',false,'deducted',0,'balance',a.current_balance); end if;
    available:=greatest(0,a.current_balance-a.reserved_amount);deducted:=least(available,delta);next_balance:=a.current_balance-deducted;
    update public.shopify_order_imports set order_amount=p_amount,allowance_deducted=allowance_deducted+deducted where id=o.id;
    update public.allowance_accounts set current_balance=next_balance,spent_amount=spent_amount+delta,version=version+1,updated_at=now() where id=a.id;
    insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
    values(a.department_id,a.member_id,a.id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Imported Shopify discount adjustment for '||p_shopify_order_name||' ('||to_char(delta,'FM$999999990.00')||')',p_order_created_at);
    return jsonb_build_object('imported',false,'adjusted',true,'deducted',deducted,'balance',next_balance);
  end if;
  insert into public.shopify_order_imports(department_id,member_id,account_id,shopify_order_id,shopify_order_name,order_created_at,order_amount)
  values(a.department_id,a.member_id,a.id,p_shopify_order_id,p_shopify_order_name,p_order_created_at,p_amount)
  returning id into inserted_id;
  available:=greatest(0,a.current_balance-a.reserved_amount);deducted:=least(available,p_amount);next_balance:=a.current_balance-deducted;
  update public.allowance_accounts set current_balance=next_balance,spent_amount=spent_amount+p_amount,version=version+1,updated_at=now() where id=a.id;
  update public.shopify_order_imports set allowance_deducted=deducted where id=inserted_id;
  insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
  values(a.department_id,a.member_id,a.id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Imported Shopify order '||p_shopify_order_name||' ('||to_char(p_amount,'FM$999999990.00')||')',p_order_created_at);
  return jsonb_build_object('imported',true,'adjusted',false,'deducted',deducted,'balance',next_balance);
end$$;

revoke all on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) to service_role;
