create table if not exists nairobi_areas (
  id          serial primary key,
  name        text not null unique,
  sort_order  int  not null default 0
);

insert into nairobi_areas (name, sort_order) values
  ('CBD / City Centre',            1),
  ('Upper Hill',                   2),
  ('Hurlingham',                   3),
  ('Kilimani',                     4),
  ('Kileleshwa',                   5),
  ('Lavington',                    6),
  ('Westlands',                    7),
  ('Parklands',                    8),
  ('Riverside',                    9),
  ('Karen',                       10),
  ('Lang''ata',                   11),
  ('Nairobi West',                12),
  ('South B',                     13),
  ('South C',                     14),
  ('Mbagathi',                    15),
  ('Madaraka',                    16),
  ('Muthaiga',                    17),
  ('Ridgeways',                   18),
  ('Ruaka',                       19),
  ('Kasarani',                    20),
  ('Roysambu',                    21),
  ('Githurai',                    22),
  ('Zimmerman',                   23),
  ('Buruburu',                    24),
  ('Umoja',                       25),
  ('Donholm',                     26),
  ('Eastleigh',                   27),
  ('Pangani',                     28),
  ('Ngara',                       29),
  ('South C',                     30),
  ('Mwiki',                       31),
  ('Ruai',                        32),
  ('Rongai',                      33),
  ('Ngong Road',                  34),
  ('Lang''ata Road',              35)
on conflict (name) do nothing;

-- Allow public read
alter table nairobi_areas enable row level security;
create policy "Public read nairobi_areas" on nairobi_areas for select using (true);
