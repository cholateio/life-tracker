// components/ui/FormTextarea.jsx
'use client';

import { Label, commonInputStyles } from './FormBase';

export function FormTextarea({ label, name, value, onChange, placeholder, rows = 3, required = false }) {
    return (
        <div className="group">
            <Label>{label}</Label>
            <textarea
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                rows={rows}
                className={`${commonInputStyles} resize-none`}
            />
        </div>
    );
}
