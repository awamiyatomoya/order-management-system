alter table public.store_introduction_imports
  drop constraint if exists store_introduction_imports_format_key_check;

alter table public.store_introduction_imports
  add constraint store_introduction_imports_format_key_check
  check (format_key in ('row-list', 'flag-list', 'hands-allocation-list', 'store-allocation-list'));
