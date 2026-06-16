import { NextResponse } from 'next/server';
import { fetchWeatherForAddress } from '@/lib/weather-forecast';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address')?.trim() ?? '';
  const when = url.searchParams.get('when')?.trim() || undefined;
  const snap = await fetchWeatherForAddress(address, when);
  return NextResponse.json(snap);
}
