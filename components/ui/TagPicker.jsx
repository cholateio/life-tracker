// components/ui/TagPicker.jsx
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Label, commonInputStyles } from './FormBase';

// Tag identity is case-insensitive in EVERY comparison below. portfolio's tag pages
// match with .contains('stack', [tag]), so 'supabase' next to 'Supabase' splits one
// tag into two pages, one of them empty. `options` arrives asynchronously, so a tag
// the user typed first can be a case variant of one the DB already knows — comparing
// exactly anywhere would leave that variant selected, unselectable, or duplicated.
const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
const has = (list, tag) => list.some((t) => eq(t, tag));

export default function TagPicker({ label = 'Tags', value = [], options = [], onChange }) {
    const [draft, setDraft] = useState('');
    // Tags added this session, so a newly created tag stays visible as a chip
    // after being deselected (options only carries what the DB already knows).
    const [extra, setExtra] = useState([]);

    const allOptions = [...options, ...extra.filter((t) => !has(options, t))];

    const toggle = (tag) => {
        onChange(has(value, tag) ? value.filter((t) => !eq(t, tag)) : [...value, tag]);
    };

    const addDraft = () => {
        const raw = draft.trim();
        if (!raw) return;
        const existing = allOptions.find((t) => eq(t, raw));
        const tag = existing ?? raw;
        if (!existing) setExtra((prev) => [...prev, tag]);
        if (!has(value, tag)) onChange([...value, tag]);
        setDraft('');
    };

    return (
        <div>
            <Label>{label}</Label>

            <div className="flex flex-wrap gap-2 mt-2">
                {allOptions.map((tag) => {
                    const selected = has(value, tag);
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
