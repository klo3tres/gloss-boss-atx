import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  answerSiteGuideQuestion,
  createWidgetLead,
  siteGuideWelcome,
  trackWidgetEvent,
} from '@/lib/titan/site-guide';
import { loadTitanWorkspace } from '@/lib/titan/workspace';

export const runtime = 'nodejs';

type Body = {
  action?: 'welcome' | 'ask' | 'track' | 'lead';
  question?: string;
  sessionId?: string;
  eventType?: string;
  questionKey?: string;
  metadata?: Record<string, unknown>;
  lead?: {
    name?: string;
    email?: string;
    phone?: string;
    vehicle?: string;
    serviceNeeded?: string;
    city?: string;
    preferredDate?: string;
    notes?: string;
    highPriority?: boolean;
  };
};

export async function POST(req: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action ?? 'ask';
  const sessionId = String(body.sessionId ?? '').trim() || crypto.randomUUID();

  if (action === 'welcome') {
    return NextResponse.json({ sessionId, reply: siteGuideWelcome() });
  }

  if (action === 'track') {
    const eventType = String(body.eventType ?? '') as Parameters<typeof trackWidgetEvent>[1]['eventType'];
    if (!eventType) return NextResponse.json({ error: 'eventType required' }, { status: 400 });
    await trackWidgetEvent(admin, {
      eventType,
      sessionId,
      questionKey: body.questionKey,
      metadata: body.metadata,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'lead') {
    const lead = body.lead ?? {};
    const name = String(lead.name ?? '').trim();
    const email = String(lead.email ?? '').trim();
    const phone = String(lead.phone ?? '').trim();
    if (!name || (!email && !phone)) {
      return NextResponse.json({ error: 'Name and email or phone required.' }, { status: 400 });
    }

    const result = await createWidgetLead(admin, {
      name,
      email: email || undefined,
      phone: phone || undefined,
      vehicle: lead.vehicle,
      serviceNeeded: lead.serviceNeeded,
      city: lead.city,
      preferredDate: lead.preferredDate,
      notes: lead.notes,
      highPriority: Boolean(lead.highPriority),
    });

    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Lead failed' }, { status: 500 });

    await trackWidgetEvent(admin, {
      eventType: lead.highPriority ? 'handoff' : 'lead_created',
      sessionId,
      questionKey: lead.highPriority ? 'kyle_handoff' : 'quote_capture',
    });
    if (!lead.highPriority) {
      await trackWidgetEvent(admin, { eventType: 'quote_request', sessionId });
    }

    return NextResponse.json({
      ok: true,
      message: lead.highPriority
        ? "Got it — Kyle will reach out soon. Thanks for choosing Gloss Boss."
        : "Thanks! The Gloss Boss team has your info and will follow up with an accurate quote.",
    });
  }

  const question = String(body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  const reply = await answerSiteGuideQuestion(admin, question);
  await trackWidgetEvent(admin, {
    eventType: 'question',
    sessionId,
    questionKey: reply.questionKey,
    metadata: { question: question.slice(0, 200) },
  });

  return NextResponse.json({ sessionId, reply });
}

export async function GET() {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  const workspace = await loadTitanWorkspace(admin);
  return NextResponse.json({
    sessionId: crypto.randomUUID(),
    reply: siteGuideWelcome(),
    settings: {
      publicWidgetEnabled: workspace.publicWidgetEnabled,
      operatorAssistantEnabled: workspace.operatorAssistantEnabled,
      poweredByBrandingEnabled: workspace.poweredByBrandingEnabled,
    },
  });
}
