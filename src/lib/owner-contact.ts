import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTitanWorkspace } from '@/lib/titan/workspace';

export type OwnerNotifyContact = {
  displayName: string;
  email: string | null;
  phone: string | null;
  emailSource: 'workspace' | 'env' | 'default' | 'none';
  phoneSource: 'workspace' | 'env' | 'none';
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

/** Resolve owner alert routing — workspace settings override env vars. */
export async function resolveOwnerNotifyContact(admin: SupabaseClient | null): Promise<OwnerNotifyContact> {
  let wsEmail = '';
  let wsPhone = '';
  let displayName = '';

  if (admin) {
    try {
      const ws = await loadTitanWorkspace(admin);
      wsEmail = str(ws.ownerEmail);
      wsPhone = str(ws.ownerPhone);
      displayName = str(ws.ownerDisplayName);
    } catch {
      /* table may be missing pre-migration */
    }
  }

  const envEmail = str(process.env.CONTACT_NOTIFY_EMAIL) || str(process.env.BUSINESS_NOTIFY_EMAIL);
  const envPhone = str(process.env.BUSINESS_NOTIFY_PHONE) || str(process.env.OWNER_PHONE) || str(process.env.BUSINESS_OWNER_PHONE);
  const defaultEmail = 'glossbossatx1@gmail.com';

  let email: string | null = null;
  let emailSource: OwnerNotifyContact['emailSource'] = 'none';
  if (wsEmail.includes('@')) {
    email = wsEmail;
    emailSource = 'workspace';
  } else if (envEmail.includes('@')) {
    email = envEmail;
    emailSource = 'env';
  } else {
    email = defaultEmail;
    emailSource = 'default';
  }

  let phone: string | null = null;
  let phoneSource: OwnerNotifyContact['phoneSource'] = 'none';
  if (wsPhone.length >= 10) {
    phone = wsPhone;
    phoneSource = 'workspace';
  } else if (envPhone.length >= 10) {
    phone = envPhone;
    phoneSource = 'env';
  }

  return { displayName, email, phone, emailSource, phoneSource };
}
