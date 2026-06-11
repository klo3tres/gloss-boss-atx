-- Migration 000078: Customer Credits Ledger table & policies
-- Additive only: no drops or cascades.

-- Alter membership_plans
ALTER TABLE IF EXISTS public.membership_plans
  ADD COLUMN IF NOT EXISTS gold_60day_upgrade_credit_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_expiration_months integer NOT NULL DEFAULT 12;

-- Update Gold membership plan defaults
UPDATE public.membership_plans
SET gold_60day_upgrade_credit_cents = 5000,
    credit_expiration_months = 12
WHERE lower(coalesce(slug, tier, name, '')) = 'gold';

-- Create customer_credits
CREATE TABLE IF NOT EXISTS public.customer_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  remaining_cents integer NOT NULL CHECK (remaining_cents >= 0),
  type text NOT NULL, -- 'membership', 'service', 'apology', 'promo', 'refund', 'manual', 'gift_card'
  reason text NOT NULL,
  source text NOT NULL,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status in ('active', 'partially_used', 'used', 'expired', 'voided')),
  linked_work_order_id uuid, -- refers to appointment id or booking fallback id
  linked_payment_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for customer_credits
ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin write customer_credits" ON public.customer_credits;
DROP POLICY IF EXISTS "Admin read customer_credits" ON public.customer_credits;
DROP POLICY IF EXISTS "Customer read customer_credits" ON public.customer_credits;

-- Admin write policy
CREATE POLICY "Admin write customer_credits" ON public.customer_credits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  );

-- Admin read policy
CREATE POLICY "Admin read customer_credits" ON public.customer_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  );

-- Customer read policy
CREATE POLICY "Customer read customer_credits" ON public.customer_credits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_credits.customer_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Create customer_credit_redemptions
CREATE TABLE IF NOT EXISTS public.customer_credit_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid REFERENCES public.customer_credits(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for customer_credit_redemptions
ALTER TABLE public.customer_credit_redemptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admin write customer_credit_redemptions" ON public.customer_credit_redemptions;
DROP POLICY IF EXISTS "Admin read customer_credit_redemptions" ON public.customer_credit_redemptions;
DROP POLICY IF EXISTS "Customer read customer_credit_redemptions" ON public.customer_credit_redemptions;

-- Admin write policy
CREATE POLICY "Admin write customer_credit_redemptions" ON public.customer_credit_redemptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  );

-- Admin read policy
CREATE POLICY "Admin read customer_credit_redemptions" ON public.customer_credit_redemptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
  );

-- Customer read policy
CREATE POLICY "Customer read customer_credit_redemptions" ON public.customer_credit_redemptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customer_credits cc
      JOIN public.customers c ON c.id = cc.customer_id
      WHERE cc.id = customer_credit_redemptions.credit_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer_id ON public.customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_credits_status ON public.customer_credits(status);
CREATE INDEX IF NOT EXISTS idx_customer_credits_linked_work_order_id ON public.customer_credits(linked_work_order_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_redemptions_credit_id ON public.customer_credit_redemptions(credit_id);
