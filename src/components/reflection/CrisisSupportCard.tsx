import React from 'react';
import { HeartHandshake, PhoneCall, ExternalLink, ShieldAlert } from 'lucide-react';

interface CrisisSupportCardProps {
  onDismiss?: () => void;
}

export const CrisisSupportCard: React.FC<CrisisSupportCardProps> = ({ onDismiss }) => {
  return (
    <div
      id="crisis-support-card"
      role="alert"
      className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-slate-800 shadow-xs space-y-3 animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
          <HeartHandshake className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <span>Support and care are available for you right now</span>
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your reflections are deeply valued, and your original writing has been securely preserved.
            Reflectra is an introspective journaling tool and cannot provide medical, clinical, or emergency assistance.
            If you are experiencing overwhelming feelings or thoughts of self-harm, please connect with people who can support you.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <div className="p-3 rounded-xl bg-white border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-amber-700" />
            <div>
              <p className="text-xs font-semibold text-slate-900">988 Suicide & Crisis Lifeline</p>
              <p className="text-[11px] text-slate-500">Free, confidential 24/7 (US & Canada)</p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-amber-900 px-2 py-0.5 bg-amber-50 rounded-md">
            Call or Text 988
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700" />
            <div>
              <p className="text-xs font-semibold text-slate-900">International Crisis Support</p>
              <p className="text-[11px] text-slate-500">Worldwide emergency resources</p>
            </div>
          </div>
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-800 hover:text-amber-950 font-medium inline-flex items-center gap-1"
          >
            <span>Find Support</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
        <span>If you are in immediate physical danger, please contact your local emergency services (like 911 or local equivalent).</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-slate-500 hover:text-slate-700 font-medium underline ml-2 shrink-0 cursor-pointer"
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
};
