import Link from 'next/link';
import { Moon, Dumbbell } from 'lucide-react';

export default function Home() {
    const apps = [
        {
            name: '睡眠紀錄',
            desc: 'Sleep Tracker',
            href: '/sleep-tracker',
            icon: <Moon size={24} strokeWidth={2.5} />,
            borderColor: 'border-[#3f4a4e]/30 hover:border-[#3f4a4e]',
            textColor: 'text-[#3f4a4e]',
            hoverBg: 'hover:bg-[#3f4a4e]/5',
        },
        {
            name: '健身日記',
            desc: 'Coming Soon',
            href: '#',
            icon: <Dumbbell size={24} strokeWidth={2.5} />,
            borderColor: 'border-[#a8a29e]/30 cursor-not-allowed',
            textColor: 'text-[#a8a29e]',
            hoverBg: '',
        },
    ];

    return (
        <main className="min-h-screen p-6 transition-colors duration-500 flex flex-col" style={{ backgroundColor: '#ede6e1' }}>
            <div className="mb-6 mt-2 ml-1">
                <h1 className="text-2xl font-extrabold tracking-wide text-[#3f4a4e]">My Apps</h1>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {apps.map((app) => (
                    <Link
                        key={app.name}
                        href={app.href}
                        className={`
              group flex flex-col justify-between p-4 h-32
              rounded-2xl border-2 transition-all duration-300
              ${app.borderColor} ${app.textColor} ${app.hoverBg}
            `}
                    >
                        <div className="self-start">{app.icon}</div>

                        <div>
                            <h2 className="text-lg font-bold leading-tight">{app.name}</h2>
                            <p className="text-xs font-bold opacity-60 mt-1 uppercase tracking-wider">{app.desc}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </main>
    );
}
