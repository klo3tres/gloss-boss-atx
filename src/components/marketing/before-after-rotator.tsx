"use client";

import { useEffect, useState } from "react";

const showcaseCars = [
  {
    id: "showcase-1",
    label: "Featured Transformation",
    image:
      "https://images.unsplash.com/photo-1549317336-206569e8475c?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "showcase-2",
    label: "Featured Transformation",
    image:
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "showcase-3",
    label: "Featured Transformation",
    image:
      "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80",
  },
];

export function BeforeAfterRotator() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((value) => (value + 1) % showcaseCars.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, []);

  const active = showcaseCars[activeIndex];

  return (
    <article className="rounded-2xl border border-gold/20 bg-black/60 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-soft">
        Before / After Preview
      </p>
      <div
        className="mt-4 h-44 rounded-xl bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${active.image})` }}
      />
      <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-zinc-200">
        {active.label}
      </p>
      <div className="mt-2 flex gap-2">
        {showcaseCars.map((car, idx) => (
          <span
            key={car.id}
            className={`h-1.5 flex-1 rounded-full ${
              idx === activeIndex ? "bg-gold" : "bg-white/20"
            }`}
          />
        ))}
      </div>
    </article>
  );
}
