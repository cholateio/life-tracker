// components/ui/FormInput.jsx
'use client';

import { Label, commonInputStyles } from './FormBase';

export function FormInput({ label, name, value, onChange, placeholder, type = 'text', required = false, min, max }) {
    return (
        <div className="group">
            <Label>{label}</Label>
            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                min={min}
                max={max}
                className={commonInputStyles}
            />
        </div>
    );
}
