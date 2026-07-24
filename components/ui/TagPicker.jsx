// components/ui/TagPicker.jsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Label, commonInputStyles } from './FormBase';

export default function TagPicker({ label = 'Tags', value = [], options = [], onChange }) {
    const [draft, setDraft] = useState('');
    // Tags added this session, so a newly created tag stays visible as a chip
    // after being deselected (options only carries what the DB already knows).
    const [extra, setExtra] = useState([]);

    // Case-insensitive: a tag typed before the options query resolved would
    // otherwise survive as a second chip once the DB's own casing arrives.
    const allOptions = [
        ...options,
        ...extra.filter((t) => !options.some((o) => o.toLowerCase() === t.toLowerCase())),
    ];

    const toggle = (tag) => {
        onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
    };

    const addDraft = () => {
        const raw = draft.trim();
        if (!raw) return;
        // Case-insensitive merge: portfolio's tag pages match with
        // .contains('stack', [tag]), so 'supabase' alongside 'Supabase' would
        // split one tag into two, one of which lists nothing.
        const existing = allOptions.find((t) => t.toLowerCase() === raw.toLowerCase());
        const tag = existing ?? raw;
        if (!existing) setExtra((prev) => [...prev, tag]);
        if (!value.includes(tag)) onChange([...value, tag]);
        setDraft('');
    };

    return (
        <div>
            <Label>{label}</Label>

            <div className="flex flex-wrap gap-2 mt-2">
                {allOptions.map((tag) => {
                    const selected = value.includes(tag);
                    return (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggle(tag)}
                            className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all active:scale-95 ${
                                selected
                                    ? 'bg-[#3f4a4e] text-[#E5E0DC]'
                                    : 'border-2 border-dashed border-[#3f4a4e]/30 text-[#3f4a4e]/60'
                            }`}
                        >
                            {tag}
                        </button>
                    );
                })}
                {allOptions.length === 0 && (
                    <span className="text-sm font-bold text-[#3f4a4e]/40">尚無標籤，請於下方新增</span>
                )}
            </div>

            <div className="flex items-center gap-3 mt-4">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter inside a <form> would submit it; this input is not a submit path.
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addDraft();
                        }
                    }}
                    placeholder="新增標籤"
                    className={commonInputStyles}
                />
                <button
                    type="button"
                    onClick={addDraft}
                    aria-label="新增標籤"
                    className="shrink-0 p-2 rounded-full bg-[#3f4a4e]/10 text-[#3f4a4e] transition-all active:scale-95"
                >
                    <Plus size={20} />
                </button>
            </div>
        </div>
    );
}
