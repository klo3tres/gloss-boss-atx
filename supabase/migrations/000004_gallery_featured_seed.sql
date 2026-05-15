-- Gallery: featured flag + starter rows when table is empty

alter table public.gallery_images add column if not exists featured boolean not null default false;

insert into public.gallery_images (image_url, caption, sort_order, published, featured)
select v.image_url, v.caption, v.sort_order, v.published, v.featured
from (
  values
    (
      'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80'::text,
      'Gloss exterior reset'::text,
      1,
      true,
      true
    ),
    (
      'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=1200&q=80'::text,
      'Deep interior care'::text,
      2,
      true,
      true
    ),
    (
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=80'::text,
      'Showroom finish'::text,
      3,
      true,
      false
    )
) as v(image_url, caption, sort_order, published, featured)
where (select count(*)::int from public.gallery_images) = 0;
