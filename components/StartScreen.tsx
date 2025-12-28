import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Coordinates } from '../types';
import { mapDataService } from '../services/mapDataService';
import { audioService } from '../services/audioService';
import { SoundType } from '../types';
import pkg from '../package.json';

interface StartScreenProps {
  onStartGame: (coords: Coordinates) => void;
  onStartZTide: () => void;
}

type InputMode = 'CITY' | 'COORD';

const StartScreen: React.FC<StartScreenProps> = ({ onStartGame, onStartZTide }) => {
  const { t, i18n } = useTranslation();
  const [showWarZonePanel, setShowWarZonePanel] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('CITY');
  const [citySearch, setCitySearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCity, setSelectedCity] = useState<any | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const languages = [
    { code: 'zh', name: '简体中文' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ];

  useEffect(() => {
    if (citySearch.length > 1 && !selectedCity) {
      const timer = setTimeout(async () => {
        const results = await mapDataService.searchCities(citySearch);
        setSearchResults(results);
        setIsDropdownOpen(results.length > 0);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  }, [citySearch, selectedCity]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNearbyBattlefield = () => {
    audioService.playSound(SoundType.UI_CLICK);
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onStartGame({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.error("定位失败", err);
        // Default to Beijing
        onStartGame({ lat: 39.9042, lng: 116.4074 }); 
      }
    );
  };

  const handleEnterZTide = () => {
    audioService.playSound(SoundType.UI_CLICK);
    onStartZTide();
  };

  const handleEnterWarZone = async () => {
    audioService.playSound(SoundType.UI_CLICK);
    setVerificationError(null);

    if (inputMode === 'CITY' && selectedCity) {
      onStartGame({ lat: selectedCity.lat, lng: selectedCity.lng });
    } else if (inputMode === 'COORD' && isCoordsValid) {
      setIsVerifying(true);
      try {
        const coords = { lat: parseFloat(lat), lng: parseFloat(lng) };
        const locationInfo = await mapDataService.getLocationInfo(coords);
        
        // Allow a small delay for dramatic effect/progress feel as requested
        await new Promise(resolve => setTimeout(resolve, 1500));

        if (locationInfo && locationInfo.isUrban) {
          onStartGame(coords);
        } else {
          setVerificationError(t('urban_error'));
          audioService.playSound(SoundType.UI_ERROR);
        }
      } catch (error) {
        console.error("验证战区失败", error);
        setVerificationError(t('link_error'));
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const selectCityFromList = (city: any) => {
    setSelectedCity(city);
    setCitySearch(city.name);
    setIsDropdownOpen(false);
    audioService.playSound(SoundType.UI_SELECT);
    setVerificationError(null);
  };

  const handleCityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCitySearch(e.target.value);
    if (selectedCity) setSelectedCity(null);
    setVerificationError(null);
  };

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsLangDropdownOpen(false);
    audioService.playSound(SoundType.UI_SELECT);
  };

  const isLatValid = (val: string) => {
    const n = parseFloat(val);
    return !isNaN(n) && n >= -90 && n <= 90;
  };

  const isLngValid = (val: string) => {
    const n = parseFloat(val);
    return !isNaN(n) && n >= -180 && n <= 180;
  };

  const isCoordsValid = isLatValid(lat) && isLngValid(lng);
  const canStart = (inputMode === 'CITY' && selectedCity) || (inputMode === 'COORD' && isCoordsValid);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-gray-900 text-white overflow-hidden">
      {/* 验证遮罩层 */}
      {isVerifying && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-blue-500 animate-[loading-bar_2s_infinite]"></div>
          </div>
          <div className="text-xl font-bold tracking-widest text-blue-400 animate-pulse uppercase text-center px-4">
            {t('scanning_sat')}
          </div>
          <div className="mt-4 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
            {t('sync_grid')}
          </div>
          <style>{`
            @keyframes loading-bar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}

      {/* 战术背景效果 */}
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

      {/* 右上角版本、语言切换和 GitHub 链接 */}
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

            <a 
            href="https://github.com/CyberPoincare/Zombie-Crisis" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-white transition-colors duration-300 transform hover:scale-110"
            title={t('github_title')}
            >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
            </a>
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
        {!showWarZonePanel ? (
          <>
            <button
              onClick={handleNearbyBattlefield}
              disabled={isLoading}
              className="group relative w-full py-8 bg-blue-600/20 border border-blue-500/50 hover:bg-blue-600/40 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <span className="text-2xl font-bold tracking-[0.2em]">{t('start_nearby')}</span>
            </button>

            <button
              onClick={() => { setShowWarZonePanel(true); audioService.playSound(SoundType.UI_CLICK); }}
              className="group relative w-full py-8 bg-gray-800/40 border border-gray-700 hover:border-blue-500/50 transition-all"
            >
              <span className="text-2xl font-bold tracking-[0.2em] text-gray-300 group-hover:text-white">
                {t('select_warzone')}
              </span>
            </button>

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
          </>
        ) : (
          <div className="bg-gray-800/90 backdrop-blur-xl border border-gray-700 p-10 space-y-8 animate-in fade-in zoom-in duration-300 shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-700 pb-6">
                <h2 className="text-2xl font-bold tracking-widest text-blue-400 uppercase">{t('warzone_deployment')}</h2>
                <button 
                  onClick={() => setShowWarZonePanel(false)}
                  className="text-gray-500 hover:text-white transition-colors text-lg"
                >
                    {t('back')}
                </button>
            </div>

            <div className="space-y-8">
                {/* 模式切换 */}
                <div className="flex items-center space-x-10 p-2 bg-black/30 border border-gray-700/50 rounded-lg">
                    <label className="flex items-center cursor-pointer group">
                        <input 
                          type="radio" 
                          className="hidden" 
                          checked={inputMode === 'CITY'} 
                          onChange={() => { setInputMode('CITY'); audioService.playSound(SoundType.UI_CLICK); }}
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${inputMode === 'CITY' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-600'}`}>
                            {inputMode === 'CITY' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>}
                        </div>
                        <span className={`ml-3 text-sm font-bold tracking-widest transition-colors ${inputMode === 'CITY' ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'}`}>{t('city_search')}</span>
                    </label>

                    <label className="flex items-center cursor-pointer group">
                        <input 
                          type="radio" 
                          className="hidden" 
                          checked={inputMode === 'COORD'} 
                          onChange={() => { setInputMode('COORD'); audioService.playSound(SoundType.UI_CLICK); }}
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${inputMode === 'COORD' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-600'}`}>
                            {inputMode === 'COORD' && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>}
                        </div>
                        <span className={`ml-3 text-sm font-bold tracking-widest transition-colors ${inputMode === 'COORD' ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'}`}>{t('coord_input')}</span>
                    </label>
                </div>

                {inputMode === 'CITY' ? (
                  <div className="relative" ref={dropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 mb-2 tracking-widest uppercase">{t('target_city_label')}</label>
                      <input 
                        type="text"
                        value={citySearch}
                        onChange={handleCityInputChange}
                        onFocus={() => searchResults.length > 0 && setIsDropdownOpen(true)}
                        placeholder={t('city_placeholder')}
                        className="w-full bg-black/60 border border-gray-700 p-4 text-base focus:border-blue-500 outline-none transition-all placeholder:text-gray-600"
                      />
                      {isDropdownOpen && (
                          <div className="absolute top-full left-0 w-full bg-gray-900/95 backdrop-blur-md border border-gray-700 mt-2 z-[1050] max-h-60 overflow-y-auto shadow-2xl divide-y divide-gray-800">
                              {searchResults.map((res, i) => (
                                  <div 
                                    key={i}
                                    onClick={() => selectCityFromList(res)}
                                    className="p-4 text-sm hover:bg-blue-600/30 cursor-pointer transition-colors group flex items-center justify-between"
                                  >
                                      <span className="text-gray-300 group-hover:text-white">{res.name}</span>
                                      <span className="text-[10px] font-mono text-gray-600 group-hover:text-blue-400">{t('select')}</span>
                                  </div>
                              ))}
                          </div>
                      )}
                      {selectedCity && (
                          <div className="mt-3 flex items-center text-xs text-blue-400 animate-pulse">
                              <span className="mr-1">⦿</span> {t('city_selected', { name: selectedCity.name })}
                          </div>
                      )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 tracking-widest uppercase">{t('lat_label')}</label>
                          <input 
                            type="text"
                            value={lat}
                            onChange={(e) => setLat(e.target.value)}
                            placeholder="31.2304"
                            className={`w-full bg-black/60 border p-4 text-base outline-none transition-all ${lat && !isLatValid(lat) ? 'border-red-500/50 text-red-400' : 'border-gray-700 focus:border-blue-500'}`}
                          />
                          <p className="text-[10px] text-gray-600">-90 {t('to')} 90</p>
                      </div>
                      <div className="space-y-2">
                          <label className="block text-xs font-bold text-gray-500 tracking-widest uppercase">{t('lng_label')}</label>
                          <input 
                            type="text"
                            value={lng}
                            onChange={(e) => setLng(e.target.value)}
                            placeholder="121.4737"
                            className={`w-full bg-black/60 border p-4 text-base outline-none transition-all ${lng && !isLngValid(lng) ? 'border-red-500/50 text-red-400' : 'border-gray-700 focus:border-blue-500'}`}
                          />
                          <p className="text-[10px] text-gray-600">-180 {t('to')} 180</p>
                      </div>
                  </div>
                )}

                {verificationError && (
                  <div className="p-4 bg-red-900/30 border border-red-500/50 text-red-200 text-xs leading-relaxed animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center mb-1 font-bold text-red-400">
                        <span className="mr-2">⚠</span> {t('deploy_failed')}
                    </div>
                    {verificationError}
                  </div>
                )}

                <button
                  onClick={handleEnterWarZone}
                  disabled={!canStart}
                  className={`relative w-full py-5 font-bold uppercase tracking-[0.3em] text-lg transition-all overflow-hidden ${
                    canStart 
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' 
                    : 'bg-gray-800 text-gray-600 border border-gray-700'
                  }`}
                >
                    {canStart && <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 animate-pulse"></div>}
                    {t('enter_warzone')}
                </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="absolute bottom-10 text-center text-xs font-mono text-gray-600 uppercase tracking-[0.2em] space-y-2">
        <div className="flex items-center justify-center space-x-4">
            <span className="flex items-center"><span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-ping"></span>{t('sys_status')}</span>
            <span className="flex items-center"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>{t('sat_link')}</span>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
