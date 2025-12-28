import { GoogleGenAI } from "@google/genai";
import i18n from '../i18n';
import { GameState, Coordinates, Building } from '../types';
import { LocationInfo } from './mapDataService';

let ai: GoogleGenAI | null = null;

const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (key && key !== 'undefined' && key !== 'your_api_key_here') {
  ai = new GoogleGenAI({ 
    apiKey: key,
  });
}

const getLanguageName = (lang: string) => {
  const code = lang.split('-')[0];
  const names: Record<string, string> = {
    'zh': 'Chinese (Simplified)',
    'en': 'English',
    'ja': 'Japanese',
    'ko': 'Korean'
  };
  return names[code] || 'English';
};

export const generateRadioChatter = async (
  gameState: GameState, 
  location: Coordinates,
  event: 'START' | 'RESCUE' | 'WAVE_CLEARED' | 'LOW_HEALTH' | 'RANDOM' | 'DISCOVERY',
  locationInfo?: any // LocationInfo type from mapDataService
): Promise<string> => {
  if (!ai) return i18n.t('ai_offline');

  const { healthyCount, infectedCount, soldierCount } = gameState;
  const loc = locationInfo || { name: i18n.t('unknown_area') };
  const targetLang = getLanguageName(i18n.language);
  
  const envDetail = [
    loc.road ? `${i18n.t('prompt_road')}: ${loc.road}` : null,
    loc.feature ? `${i18n.t('prompt_landmark')}: ${loc.feature}` : null,
    loc.suburb ? `${i18n.t('prompt_area')}: ${loc.suburb}` : null,
    loc.type ? `${i18n.t('prompt_type')}: ${loc.type}` : null
  ].filter(Boolean).join(', ');

  const systemPrompt = `You are a copywriter for a realistic zombie outbreak simulation game.
  Current environment: ${loc.name}. ${envDetail ? `Detailed context: ${envDetail}` : ''}.
  Survivors: ${healthyCount}, Infected: ${infectedCount}, Combat Troops: ${soldierCount}.
  Rules: 
  1. Construct dialogue based on provided geography, street, or building names.
  2. Tone must be realistic and immersive (tense, desperate, or cold military style).
  3. No generic templates. Mention specific environment details (e.g., "at the corner of ${loc.road || 'this street'}", "near ${loc.feature || 'building'}").
  4. Exactly 1 sentence, concise and powerful.
  5. OUTPUT LANGUAGE: You MUST write the response in ${targetLang}.`;

  const eventPrompts = {
    START: i18n.t('prompt_event_start'),
    RESCUE: i18n.t('prompt_event_rescue'),
    WAVE_CLEARED: i18n.t('prompt_event_wave_cleared'),
    LOW_HEALTH: i18n.t('prompt_event_low_health'),
    RANDOM: i18n.t('prompt_event_random'),
    DISCOVERY: i18n.t('prompt_event_discovery')
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nTask: ${eventPrompts[event]}` }] }]
    });
    return response.text?.trim() || i18n.t('signal_interference');
  } catch (error) {
    console.error("Gemini Error:", error);
    return i18n.t('comm_unstable');
  }
};

export const generateTacticalAnalysis = async (
  building: Building,
  nearbyFeatures: string[],
  locationInfo: LocationInfo | null,
  nearbyStats: { zombies: number; soldiers: number; civilians: number }
): Promise<{ survivalGuide: string; tacticalReport: string }> => {
  if (!ai) {
    return {
      survivalGuide: i18n.t('ai_offline'),
      tacticalReport: i18n.t('ai_nearby_stats', { zombies: nearbyStats.zombies, soldiers: nearbyStats.soldiers, civilians: nearbyStats.civilians })
    };
  }

  const targetLang = getLanguageName(i18n.language);
  const landmarks = nearbyFeatures.length > 0 ? nearbyFeatures.slice(0, 5).join(', ') : i18n.t('no_landmarks');
  const road = locationInfo?.road || i18n.t('unknown_street');
  const context = `${i18n.t('prompt_build_name')}: ${building.name}, ${i18n.t('prompt_type')}: ${building.type}, ${i18n.t('prompt_road')}: ${road}. ${i18n.t('prompt_landmarks')}: ${landmarks}.
  ${i18n.t('prompt_stats')}: ${nearbyStats.zombies}${i18n.t('prompt_zombies')}, ${nearbyStats.soldiers}${i18n.t('prompt_soldiers')}, ${nearbyStats.civilians}${i18n.t('prompt_civilians')}.`;

  const systemPrompt = `You are an AI tactical reconnaissance system for a realistic zombie simulation game.
  Generate two short reports based on geographic coordinates, street names, nearby real landmarks, and real-time hostile/friendly status.
  NOTE: Content MUST be specific! Mention specific streets or landmarks!
  
  Requirements:
  1. Survival Guide: 1-2 sentences. Analyze building's defensive value, combine with real street names or landmarks for evac/hold suggestions.
  2. Tactical Report: 1-2 sentences. Based on zombie/soldier counts, give direct military advice, using landmarks as defense lines or ambush points.
  
  Tone: Cold, professional, tech-heavy.
  IMPORTANT: Both reports MUST be written in ${targetLang}.
  Output format must be JSON with English keys: {"survivalGuide": "...", "tacticalReport": "..."}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nContext: ${context}` }] }],
      // @ts-ignore - The SDK types use responseMimeType but some environments/versions of Gemini 2.0 require response_mime_type at runtime for JSON mode
      config: { response_mime_type: "application/json" }
    });
    
    let text = response.text || "";
    if (!text && response.candidates && response.candidates[0]) {
        text = response.candidates[0].content.parts[0].text || "";
    }
    
    const fallbackResult = { 
        "survivalGuide": i18n.t('ai_scan_fail_guide'), 
        "tacticalReport": i18n.t('ai_scan_fail_report', { zombies: nearbyStats.zombies }) 
    };

    if (!text) return fallbackResult;

    // Handle cases where Gemini might wrap the JSON in markdown code blocks
    // Support case-insensitive detection
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
        text = jsonMatch[1].trim();
    }
    
    // Sometimes it might still have "json" at the start even without ```
    text = text.replace(/^(json|JSON)\s*/, "").trim();
    
    try {
        const result = JSON.parse(text);
        // Normalize keys (handle potential snake_case or localized keys if they slip through)
        return {
            survivalGuide: result.survivalGuide || result.survival_guide || result.生存指南 || fallbackResult.survivalGuide,
            tacticalReport: result.tacticalReport || result.tactical_report || result.实战报告 || fallbackResult.tacticalReport
        };
    } catch (e) {
        console.error("JSON Parse Error in Tactical Analysis:", e, "Raw text:", text);
        return fallbackResult;
    }
  } catch (error) {
    console.error("Gemini Tactical Analysis Error:", error);
    return {
      survivalGuide: i18n.t('ai_scan_fail_guide'),
      tacticalReport: i18n.t('ai_scan_fail_report', { zombies: nearbyStats.zombies })
    };
  }
};
