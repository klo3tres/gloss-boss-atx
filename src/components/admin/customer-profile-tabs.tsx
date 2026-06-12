'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
};

export function CustomerProfileTabs({ tabs }: { tabs: Tab[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');

  const activeIndex = tabs.findIndex(t => t.id === activeTab);
  const activeContent = tabs[activeIndex]?.content;

  return (
    <div className="space-y-6">
      {/* Premium Sliding Navigation Tabs Bar */}
      <div className="border-b border-white/5 pb-0.5">
        <nav className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-3.5 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 ${
                  isActive 
                    ? 'text-gold-soft' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeTabGlow"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-gold/50 via-gold to-gold/50 shadow-[0_0_12px_rgba(212,175,55,0.4)]"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panel Content with Animated Transitions */}
      <div className="relative min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
          >
            {activeContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
