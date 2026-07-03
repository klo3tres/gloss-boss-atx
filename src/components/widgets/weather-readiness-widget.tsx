'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CloudRain, Sun, RefreshCw, ChevronDown, ChevronUp, AlertCircle, SunDim, Cloud, CloudLightning } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

type Variant = 'customer' | 'tech' | 'admin';

type Props = {
  snapshot?: WeatherSnapshot | null;
  locationLabel?: string;
  variant?: Variant;
  compact?: boolean;
  autoFetch?: boolean;
  settingsHref?: string;
  className?: string;
};

const borderAccent: Record<Variant, string> = {
  customer: 'border-gold/30',
  tech: 'border-cyan-400/30',
  admin: 'border-zinc-700/50',
};

export function WeatherReadinessWidget({
  snapshot: initialSnapshot = null,
  locationLabel = 'Austin service area',
  variant = 'customer',
  compact = false,
  autoFetch = false,
  settingsHref = '/admin/integrations#weather',
  className = '',
}: Props) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(autoFetch && !initialSnapshot);
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = sessionStorage.getItem('gb_weather_forecast_expanded');
    return saved === null ? true : saved === '1';
  });

  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v;
      try {
        sessionStorage.setItem('gb_weather_forecast_expanded', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const refresh = (signal?: AbortSignal) => {
    if (!autoFetch) return;
    setLoading(true);
    fetch('/api/weather', { signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((data: WeatherSnapshot) => setSnapshot(data))
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          setSnapshot({ ok: false, blocker: e instanceof Error ? e.message : 'Weather lookup failed.' });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!autoFetch) return;
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [autoFetch]);

  const rain = snapshot?.rainChancePct ?? 0;
  const highRain = rain >= 45;
  const severe = snapshot?.severe || highRain;

  const desc = (snapshot?.description || snapshot?.condition || '').toLowerCase();
  const isRainy = desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower') || desc.includes('storm');
  const isCloudy = desc.includes('cloud') || desc.includes('overcast') || desc.includes('fog') || desc.includes('mist');
  const isSunny = !isRainy && !isCloudy && (desc.includes('clear') || desc.includes('sun') || desc.includes('sky') || desc === '');

  // Dynamic backdrops and color schemes based on weather status
  let weatherTheme = {
    gradient: 'from-zinc-950 via-zinc-900 to-zinc-950',
    titleColor: 'text-zinc-400',
    badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    iconColor: 'text-zinc-400',
  };

  if (snapshot?.ok) {
    if (isRainy) {
      weatherTheme = {
        gradient: 'from-slate-950/80 via-blue-950/30 to-slate-950/80',
        titleColor: 'text-blue-300',
        badgeColor: 'bg-blue-950/40 text-blue-200 border-blue-800/40',
        iconColor: 'text-blue-400',
      };
    } else if (isCloudy) {
      weatherTheme = {
        gradient: 'from-zinc-950/90 via-zinc-850/40 to-zinc-950/90',
        titleColor: 'text-zinc-300',
        badgeColor: 'bg-zinc-900/50 text-zinc-200 border-zinc-700/35',
        iconColor: 'text-zinc-400',
      };
    } else if (isSunny) {
      weatherTheme = {
        gradient: 'from-amber-950/40 via-amber-900/10 to-orange-950/35',
        titleColor: 'text-gold-soft',
        badgeColor: 'bg-gold/10 text-gold-soft border-gold/20',
        iconColor: 'text-gold',
      };
    }
  }

  // Detailing safety recommendation text
  let safetyStatus = {
    title: 'Ready for Service',
    description: 'Optimal detailing conditions. Sealants and wax will bond beautifully.',
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
  };
  if (severe) {
    safetyStatus = {
      title: 'Rain / Severe Risk',
      description: 'Outdoor operations might be limited. Garage cover recommended.',
      color: 'text-rose-400 border-rose-500/20 bg-rose-500/5',
    };
  } else if (rain > 20) {
    safetyStatus = {
      title: 'Showers Possible',
      description: 'Minor rain risk. Have towels ready or schedule in a covered bay.',
      color: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    };
  }

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border p-5 bg-gradient-to-b ${weatherTheme.gradient} ${borderAccent[variant]} ${className} transition-all duration-300 shadow-[0_0_35px_rgba(0,0,0,0.4)]`}
      aria-label="Weather readiness widget"
    >
      {/* Self-contained CSS Animations for weather backdrops */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rain-fall {
          0% { transform: translateY(-20px) rotate(15deg); opacity: 0; }
          40% { opacity: 0.7; }
          100% { transform: translateY(180px) rotate(15deg); opacity: 0; }
        }
        @keyframes cloud-drift {
          0%, 100% { transform: translateX(-15px) translateY(0); }
          50% { transform: translateX(15px) translateY(5px); }
        }
        @keyframes sun-pulsate {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.15); }
        }
        .weather-rain-drop {
          position: absolute;
          width: 1px;
          height: 14px;
          background: linear-gradient(transparent, rgba(147, 197, 253, 0.6));
          animation: rain-fall 1.8s linear infinite;
        }
        .weather-cloud-drift {
          animation: cloud-drift 8s ease-in-out infinite;
        }
        .weather-sun-flare {
          animation: sun-pulsate 5s ease-in-out infinite;
        }
      `}} />

      {/* Interactive Weather Backdrops */}
      {snapshot?.ok && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          {isSunny && (
            <div className="weather-sun-flare absolute -top-8 -right-8 w-44 h-44 rounded-full bg-gold/10 blur-3xl" />
          )}
          {isCloudy && (
            <div className="weather-cloud-drift absolute -top-4 right-4 opacity-[0.08] text-white">
              <Cloud className="w-28 h-28" />
            </div>
          )}
          {isRainy && (
            <>
              <div className="weather-rain-drop" style={{ left: '15%', top: '-20px', animationDelay: '0.1s', animationDuration: '1.4s' }} />
              <div className="weather-rain-drop" style={{ left: '35%', top: '-20px', animationDelay: '0.7s', animationDuration: '1.6s' }} />
              <div className="weather-rain-drop" style={{ left: '55%', top: '-20px', animationDelay: '0.3s', animationDuration: '1.2s' }} />
              <div className="weather-rain-drop" style={{ left: '75%', top: '-20px', animationDelay: '0.9s', animationDuration: '1.5s' }} />
              <div className="weather-rain-drop" style={{ left: '90%', top: '-20px', animationDelay: '0.5s', animationDuration: '1.3s' }} />
            </>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-400">Weather Readiness</span>
            <h4 className="text-sm font-black text-white mt-0.5 tracking-tight">{locationLabel}</h4>
          </div>
          {autoFetch ? (
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-white hover:border-white/20 transition duration-200"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          ) : null}
        </div>

        {loading && !snapshot ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Analyzing local skies…</span>
          </div>
        ) : null}

        {!snapshot?.ok ? (
          <div className="mt-4 rounded-2xl border border-white/5 bg-zinc-950/50 p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white uppercase tracking-wider">Forecast Pending</p>
                <p className="mt-1 text-zinc-400 leading-relaxed">{snapshot?.blocker || 'Connecting to Weather API service...'}</p>
                {variant === 'admin' && settingsHref ? (
                  <Link href={settingsHref} className="mt-2.5 inline-block text-[10px] font-black uppercase tracking-wider text-gold hover:underline">
                    Configure weather keys →
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Condition Header Bar */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/40 p-3.5">
              <div className="flex items-center gap-3">
                {isRainy ? (
                  <CloudRain className="h-8 w-8 text-blue-400 animate-pulse" />
                ) : isCloudy ? (
                  <Cloud className="h-8 w-8 text-zinc-400" />
                ) : (
                  <Sun className="h-8 w-8 text-gold animate-spin-slow" style={{ animationDuration: '20s' }} />
                )}
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight text-white">{snapshot.temperatureF ?? '—'}</span>
                    <span className="text-sm font-bold text-zinc-400">°F</span>
                  </div>
                  <p className="text-xs capitalize text-zinc-400 mt-0.5">
                    {snapshot.description || snapshot.condition}
                  </p>
                </div>
              </div>
              <div className={`rounded-xl border px-3 py-1 text-center shrink-0`}>
                <span className="block text-[8px] font-black uppercase text-zinc-500 tracking-wider">Rain Risk</span>
                <span className="text-sm font-mono font-black text-white">{rain}%</span>
              </div>
            </div>

            {/* Safety Detailing Bar */}
            <div className={`rounded-xl border p-2.5 text-xs ${safetyStatus.color} border-dashed`}>
              <span className="font-black uppercase tracking-wider block text-[9px] mb-0.5">{safetyStatus.title}</span>
              <p className="text-zinc-300 leading-normal">{safetyStatus.description}</p>
            </div>

            {/* Toggle Forecast Button */}
            {snapshot.dailyForecasts && snapshot.dailyForecasts.length > 0 && (
              <button
                type="button"
                onClick={toggleExpanded}
                className="w-full flex items-center justify-center gap-1.5 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition duration-200"
              >
                <span>{expanded ? 'Hide Forecast' : 'View 5-Day Forecast'}</span>
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}

            {/* Expandable Forecast Drawer */}
            {expanded && snapshot.dailyForecasts && snapshot.dailyForecasts.length > 0 && (
              <div className="space-y-2 mt-2 pt-2 border-t border-white/5">
                <div className="grid grid-cols-5 gap-1.5">
                  {snapshot.dailyForecasts.slice(0, 5).map((d) => (
                    <div
                      key={d.date}
                      className={`rounded-xl border p-2.5 text-center flex flex-col justify-between min-h-[85px] transition duration-200 ${
                        d.isBest
                          ? 'border-gold/30 bg-gold/10'
                          : d.isRainy
                            ? 'border-rose-500/20 bg-rose-500/10'
                            : 'border-white/5 bg-zinc-950/40 hover:border-white/10'
                      }`}
                    >
                      <div>
                        <p className="text-[8px] font-black uppercase text-zinc-500">{d.dayName.slice(0, 3)}</p>
                        <p className="mt-1.5 font-mono text-xs font-black text-white">{d.tempMaxF}°</p>
                      </div>
                      <div className="mt-2">
                        {d.rainChancePct > 20 ? (
                          <span className={`inline-block text-[8px] font-black font-mono ${d.rainChancePct >= 50 ? 'text-rose-400' : 'text-blue-300'}`}>
                            ☔ {d.rainChancePct}%
                          </span>
                        ) : (
                          <span className="inline-block text-[8px] font-black text-emerald-400">☀️ Dry</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!compact && snapshot.bestDetailingDays && snapshot.bestDetailingDays.length > 0 && (
                  <div className="mt-2.5 text-[10px] text-zinc-300 bg-black/20 p-2 rounded-lg border border-white/5">
                    <span className="font-black uppercase tracking-wider text-gold-soft">Best Detailing Days: </span>
                    <span className="font-semibold text-white">{snapshot.bestDetailingDays.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
