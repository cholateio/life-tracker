import Link from 'next/link';
import { MENU_CONFIG } from '@/configs/menu';

export default function Home() {
    return (
        <main className="min-h-screen p-6 transition-colors duration-500 flex flex-col" style={{ backgroundColor: '#ede6e1' }}>
            <div className="mb-6 mt-2 ml-1">
                <h1 className="text-2xl font-extrabold tracking-wide text-[#3f4a4e]">My Apps</h1>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {MENU_CONFIG.map((app) => {
                    const Icon = app.icon;

                    const itemStyle = {
                        '--app-color': app.color,
                        '--app-border': `${app.color}4d`, // 30% 透明度的 Hex (4d = 77/255)
                        '--app-bg-hover': `${app.color}0d`, // 5% 透明度的 Hex (0d = 13/255)
                        borderColor: 'var(--app-border)',
                        color: 'var(--app-color)',
                    };

                    return (
                        <Link
                            key={app.name}
                            href={app.href}
                            style={itemStyle}
                            className={`
                            group flex flex-col justify-between p-4 h-32
                            rounded-2xl border-2 transition-all duration-300
                            ${app.disabled ? 'cursor-not-allowed opacity-80' : 'hover:border-(--app-color) hover:bg-(--app-bg-hover)'}
                        `}
                        >
                            <div className="self-start">
                                <Icon size={24} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold leading-tight">{app.name}</h2>
                                <p className="text-xs font-bold opacity-60 mt-1 uppercase tracking-wider">{app.desc}</p>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </main>
    );
}
