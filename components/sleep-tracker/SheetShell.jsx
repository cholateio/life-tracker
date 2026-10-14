'use client';

import { X } from 'lucide-react';

export default function SheetShell({ title, busy = false, onClose, children }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40"
            onClick={() => !busy && onClose()}
        >
            <div
                className="w-full max-w-sm bg-[#fdfbf7] rounded-[2rem] p-6 shadow-2xl flex flex-col gap-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-[#3f4a4e]">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="text-[#3f4a4e] opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
                    >
                        <X size={22} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
