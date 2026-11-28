-- Supplier address by field, so the Owner can search and filter suppliers by place (decided
-- 2026-11-28). Street, barangay, city / municipality, province, ZIP code and region are all required
-- by the API; they stay nullable here because existing suppliers only have the old one-line
-- address, which is kept until the Owner fills in the fields (the API then clears it).
-- Table privileges on suppliers are table-level (20261117000000), so the new columns need no grant.

alter table public.suppliers
  add column street   varchar(150),
  add column barangay varchar(100),
  add column city     varchar(100),
  add column province varchar(100),
  add column zip_code varchar(4) check (zip_code ~ '^[0-9]{4}$'),
  add column region   varchar(60),
  -- All six or none: an address is never saved half filled.
  add constraint suppliers_address_complete
    check (num_nulls(street, barangay, city, province, zip_code, region) in (0, 6));
