-- Google review sync: stable external id for Places API imports

alter table public.customer_reviews add column if not exists google_review_id text;

create unique index if not exists idx_customer_reviews_google_review_id
  on public.customer_reviews (google_review_id)
  where google_review_id is not null;
