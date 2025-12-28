import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Coordinates, ZTidePilot } from '../types';
import { audioService } from '../services/audioService';
import { SoundType } from '../types';
import pkg from '../package.json';

interface StartScreenProps {
  onStartGame: (coords: Coordinates) => void;
  onStartZTide: () => void;
  onStartZTidePilot: (pilot: ZTidePilot) => void;
}

const ZTIDE_PILOTS: ZTidePilot[] = [
  { id: 'gz_huacheng', name: '广州·花城广场', coords: { lat: 23.126222, lng: 113.31925 } },
  { id: 'sz_civic', name: '深圳·市民中心', coords: { lat: 22.543078, lng: 114.097822 } },
  { id: 'tokyo_shibuya', name: '东京·涉谷', coords: { lat: 35.6595, lng: 139.70056 } },
  { id: 'nyc_times_sq', name: '纽约·时代广场', coords: { lat: 40.7575, lng: -73.98583 } },
  { id: 'moscow_red_sq', name: '莫斯科·红场', coords: { lat: 55.75417, lng: 37.62 } },
];

const StartScreen: React.FC<StartScreenProps> = ({ onStartZTide, onStartZTidePilot }) => {
  const { t, i18n } = useTranslation();
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'zh', name: '简体中文' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEnterZTide = () => {
    audioService.playSound(SoundType.UI_CLICK);
    onStartZTide();
  };

  const handleEnterZTidePilot = (pilot: ZTidePilot) => {
    audioService.playSound(SoundType.UI_CLICK);
    onStartZTidePilot(pilot);
  };

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangDropdownOpen(false);
    audioService.playSound(SoundType.UI_SELECT);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-gray-900 text-white overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900 via-gray-900 to-black"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
        <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.8)] animate-pulse"></div>
      </div>

      {/* 准星装饰 */}
      <div className="absolute top-10 left-10 w-20 h-20 border-t-2 border-l-2 border-blue-500/30"></div>
      <div className="absolute top-10 right-10 w-20 h-20 border-t-2 border-r-2 border-blue-500/30"></div>
      <div className="absolute bottom-10 left-10 w-20 h-20 border-b-2 border-l-2 border-blue-500/30"></div>
      <div className="absolute bottom-10 right-10 w-20 h-20 border-b-2 border-r-2 border-blue-500/30"></div>

      <div className="absolute top-6 right-8 flex flex-col items-end space-y-4 z-[1100]">
        <div className="flex items-center space-x-4">
            {/* Language Selection */}
            <div className="relative" ref={langDropdownRef}>
                <button 
                  onClick={() => { setIsLangDropdownOpen(!isLangDropdownOpen); audioService.playSound(SoundType.UI_CLICK); }}
                  className="px-3 py-1 bg-slate-800/80 border border-slate-600 rounded text-slate-300 font-bold text-xs tracking-wider flex items-center gap-2 hover:bg-slate-700 hover:border-blue-500/50 transition-all"
                >
                    <span className="text-[14px]">🌐</span> {languages.find(l => l.code === i18n.language.split('-')[0])?.name || t('language')}
                    <span className={`transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {isLangDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-32 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-lg shadow-2xl overflow-hidden divide-y divide-slate-800">
                        {languages.map(lang => (
                            <button 
                              key={lang.code}
                              onClick={() => changeLanguage(lang.code)}
                              className={`w-full px-4 py-2 text-left text-xs font-bold hover:bg-blue-600/30 transition-colors ${i18n.language.startsWith(lang.code) ? 'text-blue-400 bg-blue-600/10' : 'text-slate-400'}`}
                            >
                                {lang.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="px-3 py-1 bg-blue-900/30 border border-blue-500/50 rounded text-blue-400 font-mono text-xs tracking-wider">
            {t('version')} {pkg.version}
            </div>
        </div>
      </div>

      {/* 标题 */}
      <div className="relative mb-12 text-center">
        <h1 className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] uppercase px-4 text-center">
          {t('title')}
        </h1>
        <div className="mt-4 text-blue-400 font-mono tracking-[0.3em] text-lg uppercase opacity-90">
          {t('subtitle')}
        </div>
      </div>

      {/* 主菜单 */}
      <div className="relative w-full max-w-lg space-y-6 px-6">
        <button
          onClick={handleEnterZTide}
          className="group relative w-full py-6 bg-emerald-600/10 border border-emerald-500/40 hover:bg-emerald-600/20 hover:border-emerald-400/60 transition-all"
        >
          <div className="text-[10px] font-mono tracking-[0.35em] text-emerald-400 uppercase opacity-90">
            Project Z-Tide
          </div>
          <div className="mt-2 text-xl font-black tracking-[0.18em] text-white">
            Enter Prototype
          </div>
          <div className="mt-2 text-xs text-slate-400">
            WebGL swarm sandbox (no OSM / no AI)
          </div>
        </button>

        <div className="bg-black/20 border border-white/10 rounded-lg p-4">
          <div className="text-[10px] font-mono tracking-[0.35em] text-slate-400 uppercase">
            Z-Tide · 5 Pilot Seeds
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ZTIDE_PILOTS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleEnterZTidePilot(p)}
                className="px-3 py-2 rounded bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700 hover:border-emerald-500/40 text-left transition-colors"
              >
                <div className="text-xs font-bold text-slate-200">{p.name}</div>
                <div className="mt-1 text-[10px] font-mono text-slate-500">
                  {p.coords.lat.toFixed(5)}, {p.coords.lng.toFixed(5)}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
