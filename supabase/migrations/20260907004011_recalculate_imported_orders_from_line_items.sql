create or replace function public.gg_import_shopify_order(
  p_account_id uuid, p_shopify_order_id text, p_shopify_order_name text,
  p_order_created_at timestamptz, p_amount numeric
) returns jsonb language plpgsql set search_path='public','pg_temp' as $$
declare
  a public.allowance_accounts%rowtype;
  o public.shopify_order_imports%rowtype;
  inserted_id uuid;
  available numeric;
  deducted numeric:=0;
  restored numeric:=0;
  next_balance numeric;
  delta numeric;
begin
  if p_amount < 0 then raise exception 'Order amount cannot be negative'; end if;

  select * into a from public.allowance_accounts where id=p_account_id for update;
  if not found then raise exception 'Allowance account not found'; end if;

  select * into o
  from public.shopify_order_imports
  where department_id=a.department_id and shopify_order_id=p_shopify_order_id
  for update;

  if found then
    if o.account_id is not null and o.account_id<>a.id then
      raise exception 'Imported order is assigned to another allowance account';
    end if;

    if o.account_id is null then
      delta:=p_amount;
    elsif not o.allowance_accounted then
      update public.shopify_order_imports set order_amount=p_amount where id=o.id;
      return jsonb_build_object('imported',false,'adjusted',false,'deducted',0,'restored',0,'balance',a.current_balance);
    else
      delta:=p_amount-o.order_amount;
    end if;

    if delta=0 then
      update public.shopify_order_imports
      set order_amount=p_amount,
          member_id=coalesce(member_id,a.member_id),
          account_id=coalesce(account_id,a.id),
          allowance_accounted=true
      where id=o.id;
      return jsonb_build_object('imported',false,'adjusted',false,'deducted',0,'restored',0,'balance',a.current_balance);
    end if;

    if delta>0 then
      available:=greatest(0,a.current_balance-a.reserved_amount);
      deducted:=least(available,delta);
      next_balance:=a.current_balance-deducted;

      update public.shopify_order_imports
      set order_amount=p_amount,
          member_id=coalesce(member_id,a.member_id),
          account_id=coalesce(account_id,a.id),
          allowance_deducted=allowance_deducted+deducted,
          allowance_accounted=true
      where id=o.id;
      update public.allowance_accounts
      set current_balance=next_balance,spent_amount=spent_amount+delta,version=version+1,updated_at=now()
      where id=a.id;
      if deducted>0 then
        insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
        values(a.department_id,a.member_id,a.id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Corrected imported Shopify line-item total for '||p_shopify_order_name||' ('||to_char(delta,'FM$999999990.00')||' additional)',now());
      end if;
    else
      restored:=least(o.allowance_deducted,abs(delta));
      next_balance:=a.current_balance+restored;

      update public.shopify_order_imports
      set order_amount=p_amount,
          allowance_deducted=greatest(0,allowance_deducted-restored)
      where id=o.id;
      update public.allowance_accounts
      set current_balance=next_balance,spent_amount=greatest(0,spent_amount+delta),version=version+1,updated_at=now()
      where id=a.id;
      if restored>0 then
        insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
        values(a.department_id,a.member_id,a.id,'REFUND','POSTED',restored,a.current_balance,next_balance,'Corrected imported Shopify line-item total for '||p_shopify_order_name||' ('||to_char(abs(delta),'FM$999999990.00')||' restored)',now());
      end if;
    end if;

    return jsonb_build_object('imported',false,'adjusted',true,'deducted',deducted,'restored',restored,'balance',next_balance);
  end if;

  insert into public.shopify_order_imports(department_id,member_id,account_id,shopify_order_id,shopify_order_name,order_created_at,order_amount)
  values(a.department_id,a.member_id,a.id,p_shopify_order_id,p_shopify_order_name,p_order_created_at,p_amount)
  returning id into inserted_id;
  available:=greatest(0,a.current_balance-a.reserved_amount);
  deducted:=least(available,p_amount);
  next_balance:=a.current_balance-deducted;
  update public.allowance_accounts
  set current_balance=next_balance,spent_amount=spent_amount+p_amount,version=version+1,updated_at=now()
  where id=a.id;
  update public.shopify_order_imports set allowance_deducted=deducted where id=inserted_id;
  if deducted>0 then
    insert into public.allowance_transactions(department_id,member_id,account_id,type,status,amount,balance_before,balance_after,reason,created_at)
    values(a.department_id,a.member_id,a.id,'PURCHASE','POSTED',-deducted,a.current_balance,next_balance,'Imported Shopify order '||p_shopify_order_name||' from line-item totals ('||to_char(p_amount,'FM$999999990.00')||')',p_order_created_at);
  end if;
  return jsonb_build_object('imported',true,'adjusted',false,'deducted',deducted,'restored',0,'balance',next_balance);
end$$;

revoke all on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.gg_import_shopify_order(uuid,text,text,timestamptz,numeric) to service_role;
