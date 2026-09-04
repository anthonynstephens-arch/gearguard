create index if not exists members_department_role_idx on public.members(department_role_id);
create index if not exists departments_chief_member_idx on public.departments(chief_member_id);
create index if not exists allowance_item_attributions_account_idx on public.allowance_item_attributions(account_id);
create index if not exists allowance_item_attributions_manager_idx on public.allowance_item_attributions(manager_id);
