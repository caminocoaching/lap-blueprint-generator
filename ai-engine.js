/* ============================================================
   AI ENGINE — Three-API Stack for Quiet Eye Blueprint Generation
   ============================================================

   API ARCHITECTURE:
   ─────────────────
   1. GEMINI (Vision)  — Video frame analysis, corner detection
   2. GPT-4o (Vision)  — Track map understanding, spatial reasoning
   3. CLAUDE (Brain)    — Blueprint generation, QE science, protocols

   Each API has its own key stored separately in localStorage.
   The Blueprint Brain defaults to Claude but can fall back to Gemini.
   ============================================================ */

const AIEngine = {
    // ── API Keys ────────────────────────────────────────────
    geminiApiKey: null,
    claudeApiKey: null,
    openaiApiKey: null,

    // ── Model Selection ─────────────────────────────────────
    geminiModel: 'gemini-2.5-flash',
    claudeModel: 'claude-sonnet-4-5-20250929',
    blueprintProvider: 'claude',  // 'claude' | 'gemini' | 'demo'

    GEMINI_MODELS: {
        'gemini-2.5-flash': 'Gemini 2.5 Flash (Recommended)',
        'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite (Fastest)',
        'gemini-2.5-pro': 'Gemini 2.5 Pro (Best)'
    },

    CLAUDE_MODELS: {
        'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5 (Recommended)',
        'claude-opus-4-5-20251101': 'Claude Opus 4.5 (Most Powerful)'
    },

    // ── Backward Compatibility ──────────────────────────────
    // These getters allow existing code (VisionAnalyzer, etc.)
    // to use AIEngine.apiKey and AIEngine.model transparently
    get apiKey() { return this.geminiApiKey; },
    set apiKey(val) { this.geminiApiKey = val; },
    get model() { return this.geminiModel; },
    set model(val) { this.geminiModel = val; },

    // ── Initialization ──────────────────────────────────────
    init() {
        this.geminiApiKey = localStorage.getItem('lb_gemini_key') || localStorage.getItem('lb_api_key') || null;
        this.claudeApiKey = localStorage.getItem('lb_claude_key') || null;
        this.openaiApiKey = localStorage.getItem('lb_openai_key') || null;
        this.geminiModel = localStorage.getItem('lb_gemini_model') || 'gemini-2.5-flash';
        this.claudeModel = localStorage.getItem('lb_claude_model') || 'claude-sonnet-4-5-20250929';
        this.blueprintProvider = localStorage.getItem('lb_blueprint_provider') || 'claude';
    },

    // ── Key Management ──────────────────────────────────────
    setGeminiKey(key) {
        this.geminiApiKey = key;
        localStorage.setItem('lb_gemini_key', key);
        localStorage.setItem('lb_api_key', key); // backward compat
    },

    setClaudeKey(key) {
        this.claudeApiKey = key;
        localStorage.setItem('lb_claude_key', key);
    },

    setOpenAIKey(key) {
        this.openaiApiKey = key;
        localStorage.setItem('lb_openai_key', key);
    },

    setApiKey(key) {
        // Backward compatibility — sets Gemini key
        this.setGeminiKey(key);
    },

    setModel(model) {
        // Detect which API the model belongs to
        if (model in this.GEMINI_MODELS) {
            this.geminiModel = model;
            localStorage.setItem('lb_gemini_model', model);
            localStorage.setItem('lb_model', model); // backward compat
        } else if (model in this.CLAUDE_MODELS) {
            this.claudeModel = model;
            localStorage.setItem('lb_claude_model', model);
        }
    },

    setBlueprintProvider(provider) {
        this.blueprintProvider = provider;
        localStorage.setItem('lb_blueprint_provider', provider);
    },

    isConfigured() {
        return !!this.geminiApiKey;
    },

    isBlueprintConfigured() {
        if (this.blueprintProvider === 'claude') return !!this.claudeApiKey;
        if (this.blueprintProvider === 'gemini') return !!this.geminiApiKey;
        return true; // demo mode always available
    },

    isTrackMapConfigured() {
        return !!this.openaiApiKey;
    },

    isResearchConfigured() {
        return !!this.geminiApiKey;
    },


    // ============================================================
    //  TRACK AUTO-RESEARCH — Gemini + Google Search Grounding
    //  Researches visual landmarks, gaze targets & spatial features
    //  for Quiet Eye protocol — NOT riding/driving technique
    // ============================================================

    /**
     * Auto-research a track's visual-spatial features for QE blueprint building.
     * Uses Gemini with Google Search grounding to find real corner data.
     * @param {string} trackName — e.g. "Misano World Circuit"
     * @param {string} seriesClass — e.g. "MotoGP", "GT3", "Club Track Day"
     * @param {string} vehicleType — "motorcycle" | "car" | "kart" | "formula"
     * @param {Function} onProgress — (pct, message) callback
     * @returns {Object} structured track description with QE-relevant data
     */
    async researchTrack(trackName, seriesClass, vehicleType, onProgress) {
        // Check cache FIRST — pre-seeded data doesn't need an API key
        const cacheKey = `lb_track_${trackName.toLowerCase().replace(/\s+/g, '_')}_${(seriesClass || 'general').toLowerCase().replace(/\s+/g, '_')}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // Cache valid for 30 days
                if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < 30 * 24 * 60 * 60 * 1000) {
                    if (onProgress) onProgress(100, `Loaded cached research for ${trackName}`);
                    return parsed;
                }
            } catch (e) { /* cache invalid, re-research */ }
        }

        // Only need API key if cache miss (live web research required)
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key not configured. Set your key in Settings for track research.');
        }

        if (onProgress) onProgress(5, `Researching ${trackName} visual landmarks...`);

        const researchPrompt = this._buildTrackResearchPrompt(trackName, seriesClass, vehicleType);

        try {
            // Use Gemini 2.5 Pro for research (best quality + Google Search grounding)
            const researchModel = 'gemini-2.5-pro';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${researchModel}:generateContent?key=${this.geminiApiKey}`;

            if (onProgress) onProgress(15, 'Searching web for track data...');

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: researchPrompt }]
                    }],
                    tools: [{
                        google_search: {}
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 16384
                    }
                })
            });

            if (onProgress) onProgress(50, 'Processing track intelligence...');

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Empty research response from Gemini.');

            if (onProgress) onProgress(75, 'Structuring corner data for QE...');

            // Extract JSON from response (may be wrapped in markdown)
            let jsonStr = rawText.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            let trackData;
            try {
                trackData = JSON.parse(jsonStr);
            } catch (e) {
                // If JSON parse fails, try to extract JSON from mixed content
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    trackData = JSON.parse(jsonMatch[0]);
                } else {
                    console.error('[AIEngine] Failed to parse research response:', rawText.substring(0, 500));
                    throw new Error('Could not parse track research data. Try again.');
                }
            }

            // Add cache metadata
            trackData._cachedAt = Date.now();
            trackData._source = 'gemini_search';

            // Cache it
            try {
                localStorage.setItem(cacheKey, JSON.stringify(trackData));
            } catch (e) {
                console.warn('[AIEngine] Cache storage failed (quota?):', e.message);
            }

            if (onProgress) onProgress(100, `Research complete — ${trackData.corners?.length || 0} corners mapped`);

            return trackData;

        } catch (error) {
            if (error.message.includes('API key') || error.message.includes('API_KEY')) {
                throw new Error('Invalid Gemini API key. Check your key in Settings.');
            }
            throw error;
        }
    },

    /**
     * Build the QE-focused track research prompt.
     * CRITICAL: This is NOT about technique. It's about visual targets for gaze protocols.
     */
    _buildTrackResearchPrompt(trackName, seriesClass, vehicleType) {
        const vehicleContext = {
            motorcycle: 'motorcycle racing (rider perspective, lean angle affects visual field, visor frame limits peripheral)',
            car: 'car racing (driver perspective, windscreen frame, A-pillar blind spots, steering wheel in lower visual field)',
            kart: 'kart racing (low seating position, wide visual field, no windscreen)',
            formula: 'single-seater/formula racing (low cockpit, halo device in visual field, limited upward visibility)'
        };

        return `You are a Quiet Eye conditioning research assistant. Your job is to gather VISUAL and SPATIAL information about a race track that will be used to build gaze-lock protocols for performance flow state.

CRITICAL CONTEXT:
This is NOT about riding or driving technique. This is NOT about racing lines, braking points, or lap times.
This IS about: What does the EYE need to see? What are the VISUAL LANDMARKS the brain locks onto?
The purpose is to build a Quiet Eye protocol — the science of training the final fixation point before each critical action.

For each corner, I need to know what the EYES will use as gaze anchors:
- What VISUAL REFERENCE marks the braking zone? (a kerb paint change, a marshal post, a barrier end, a shadow line, a rumble strip start, a distance board)
- What does the APEX look like? (inside kerb colour/texture, a specific kerb tooth, a painted sausage kerb, a grass edge, a drain cover)
- What does the EXIT TARGET look like? (end of exit kerb, barrier opening, a tree line, a bridge, the next straight's vanishing point)
- What PERIPHERAL features exist? (grandstands, gravel traps, barriers that create spatial awareness cues)

Vehicle context: ${vehicleContext[vehicleType] || vehicleContext.car}

RESEARCH THIS TRACK: "${trackName}"
SERIES/CLASS CONTEXT: ${seriesClass || 'General track day'}

Search the web for:
1. Official circuit guides, track maps, and corner-by-corner descriptions
2. Onboard video analyses or ride/drive reports that describe visual references
3. Track walk reports, coaching notes, or corner guides from instructors
4. Circuit technical data: corner radii, elevation changes, camber, surface types
5. Kerb descriptions (colours, types, aggressive/flat), run-off areas, visual landmarks

FOR EACH CORNER, provide:

RESPOND ONLY IN VALID JSON:
{
  "trackName": "Official circuit name",
  "country": "string",
  "length": "string — e.g. 4.226km",
  "direction": "clockwise|anticlockwise",
  "totalCorners": number,
  "surfaceNotes": "string — general surface grip character, resurfaced areas, bumps",
  "elevationProfile": "string — overall elevation character (flat, hilly, significant changes)",
  "corners": [
    {
      "number": 1,
      "name": "string — official corner name if exists, else Turn N",
      "direction": "left|right",
      "type": "hairpin|sweeper|chicane|esses|kink|offcamber|medium",
      "severity": "very_tight|tight|medium|fast|flat_out",
      "gazeTargets": {
        "brakingReference": "string — the VISUAL LANDMARK the eyes lock onto for braking (e.g. '150m board on left', 'end of pit wall', 'shadow of bridge')",
        "turnInReference": "string — what the eyes shift to at turn-in (e.g. 'inside kerb start', 'apex kerb tooth #3')",
        "apexFixation": "string — the SPECIFIC VISUAL POINT the eyes settle on at apex (e.g. 'red-white kerb midpoint', 'inside grass edge', 'drain cover at kerb')",
        "exitTarget": "string — where the eyes SNAP to before throttle (e.g. 'end of exit kerb', 'barrier gap on right', 'bridge in distance')",
        "peripheralCues": "string — what exists in peripheral vision that gives spatial awareness (e.g. 'gravel trap on outside', 'grandstand on right', 'grass verge width change')"
      },
      "kerbDescription": {
        "inside": "string — colour, type, aggressiveness of inside kerb",
        "outside": "string — colour, type of exit/outside kerb",
        "notes": "string — sausage kerbs, painted kerbs, dangerous kerbs"
      },
      "elevation": "uphill|downhill|flat|crest|dip|blind_crest",
      "camber": "positive|negative|off_camber|mixed",
      "approach": "string — what comes before (e.g. 'long 800m straight', 'exit of Turn 3')",
      "exitTo": "string — what follows (e.g. 'short straight to Turn 5', 'immediately into Turn 4 left')",
      "isPartOfComplex": false,
      "complexWith": [],
      "visualChallenge": "string — what makes this corner hard for the EYES (e.g. 'blind entry over crest', 'sun glare in morning sessions', 'no obvious braking reference', 'apex hidden until late')",
      "danVanNotes": "string — QE-specific note about this corner. What would trigger VAN? What helps DAN stay locked? (e.g. 'Late apex reveal may trigger VAN — commit to kerb fixation early', 'Wide entry creates uncertainty — pre-commit to 100m board')"
    }
  ],
  "notableVisualFeatures": [
    "string — track-wide visual features relevant to gaze (e.g. 'Bridge between T5 and T6 serves as long-range visual anchor', 'Pit wall visible from multiple corners provides peripheral reference')"
  ],
  "problemCornersForQuietEye": [
    {
      "cornerNumber": number,
      "issue": "string — why this corner is hard for QE (e.g. 'Blind crest entry means PTIS fires with no visual anchor', 'Chicane requires 3 rapid saccades in 1.5s')",
      "remedy": "string — QE-specific fix (e.g. 'Use marshal post as pre-crest anchor, then switch to apex kerb as it appears', 'Train as one gaze flow, not separate fixations')"
    }
  ]
}

IMPORTANT:
- Be SPECIFIC about visual landmarks. "The braking point" is useless. "The 100m board on the left beside the tyre wall" is what the eyes need.
- Include kerb COLOURS and types — these are critical visual anchors for foveal fixation.
- Note any corners where the apex is BLIND or hidden — these need special QE handling.
- Note elevation-related visual challenges (crests that hide the apex, dips that reveal the exit late).
- If you can't find specific visual details for a corner from web sources, say "No specific visual reference found — requires onboard video review" in that field.`;
    },

    /**
     * Look up cached track data without triggering live research.
     * Returns the cached data if found and valid, or null.
     * Used by buildBlueprint() to auto-load pre-seeded track data.
     */
    getCachedTrackData(trackName, seriesClass) {
        const cacheKey = `lb_track_${trackName.toLowerCase().replace(/\s+/g, '_')}_${(seriesClass || 'general').toLowerCase().replace(/\s+/g, '_')}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed._cachedAt && (Date.now() - parsed._cachedAt) < 30 * 24 * 60 * 60 * 1000) {
                    return parsed;
                }
            } catch (e) { /* invalid */ }
        }
        return null;
    },

    /**
     * Clear cached track research data
     */
    clearTrackCache(trackName, seriesClass) {
        if (trackName) {
            const cacheKey = `lb_track_${trackName.toLowerCase().replace(/\s+/g, '_')}_${(seriesClass || 'general').toLowerCase().replace(/\s+/g, '_')}`;
            localStorage.removeItem(cacheKey);
        } else {
            // Clear all track caches
            const keys = Object.keys(localStorage).filter(k => k.startsWith('lb_track_'));
            keys.forEach(k => localStorage.removeItem(k));
        }
    },

    /**
     * Load pre-built track data from a JSON file and cache it.
     * Used for tracks where we have detailed manual QE data (e.g. from track guide PDFs).
     * @param {string} jsonUrl — URL to the track data JSON file
     * @param {string} seriesClass — optional series context for cache key
     */
    async loadTrackDataFile(jsonUrl, seriesClass) {
        try {
            const response = await fetch(jsonUrl);
            if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
            const trackData = await response.json();

            // Cache it under the track name
            const trackName = trackData.trackName || 'unknown';
            const cacheKey = `lb_track_${trackName.toLowerCase().replace(/\s+/g, '_')}_${(seriesClass || 'general').toLowerCase().replace(/\s+/g, '_')}`;
            trackData._cachedAt = Date.now();
            trackData._source = trackData._source || 'manual_file';
            localStorage.setItem(cacheKey, JSON.stringify(trackData));

            // Also cache under common name variations
            const aliases = this._getTrackAliases(trackName);
            aliases.forEach(alias => {
                const aliasKey = `lb_track_${alias.toLowerCase().replace(/\s+/g, '_')}_${(seriesClass || 'general').toLowerCase().replace(/\s+/g, '_')}`;
                localStorage.setItem(aliasKey, JSON.stringify(trackData));
            });

            return trackData;
        } catch (error) {
            console.error('[AIEngine] Failed to load track data file:', error);
            throw error;
        }
    },

    /**
     * Get common name variations for a track to improve cache hit rate.
     */
    _getTrackAliases(trackName) {
        const aliases = [];
        const lower = trackName.toLowerCase();

        // Ruapuna variations
        if (lower.includes('ruapuna')) {
            aliases.push('ruapuna', 'ruapuna park', 'mike pero motorsport park', 'ruapuna raceway', 'christchurch');
        }
        // Add more tracks as data files are created

        return aliases.filter(a => a.toLowerCase() !== lower.toLowerCase());
    },

    /**
     * Pre-seed known track data on init.
     * Embeds track data directly — no fetch needed, works from file:// protocol.
     */
    preseedTrackData() {
        const bundledTracks = [
            { data: this._RUAPUNA_QE_DATA, series: 'general' }
        ];

        for (const track of bundledTracks) {
            try {
                const trackData = track.data;
                const trackName = trackData.trackName || 'unknown';
                const seriesClass = track.series || 'general';
                const cacheKey = `lb_track_${trackName.toLowerCase().replace(/\s+/g, '_')}_${seriesClass.toLowerCase().replace(/\s+/g, '_')}`;

                // Set cache timestamp if not present
                if (!trackData._cachedAt) trackData._cachedAt = Date.now();
                trackData._source = trackData._source || 'bundled';

                localStorage.setItem(cacheKey, JSON.stringify(trackData));

                // Also cache under name aliases
                const aliases = this._getTrackAliases(trackName);
                aliases.forEach(alias => {
                    const aliasKey = `lb_track_${alias.toLowerCase().replace(/\s+/g, '_')}_${seriesClass.toLowerCase().replace(/\s+/g, '_')}`;
                    localStorage.setItem(aliasKey, JSON.stringify(trackData));
                });

                console.log(`[AIEngine] Pre-seeded track: ${trackName} (${trackData.corners?.length || 0} corners, ${aliases.length + 1} cache keys)`);
            } catch (e) {
                console.warn('[AIEngine] Track preseed error:', e.message);
            }
        }
    },

    // ── Bundled Track Data: Ruapuna Park ──────────────────────
    // Source: 2K Cup TrackTime Manual — corner-by-corner QE gaze targets
    _RUAPUNA_QE_DATA: {"trackName":"Ruapuna Park (Mike Pero Motorsport Park)","country":"New Zealand","length":"3.03km (full circuit)","direction":"clockwise","totalCorners":8,"surfaceNotes":"Mixed surface quality. Ripple strips (rough concrete) on exits of T1, T3, T5. Concrete pads at T1 exit and pit area. Greasy ripple strips in wet conditions. Dip on entry to T2. Bump near T2 apex.","elevationProfile":"Generally flat \u2014 Canterbury Plains. Minor undulations. Notable dip on approach to Turn 2.","corners":[{"number":1,"name":"Turn 1","direction":"right","type":"medium","severity":"medium","gazeTargets":{"brakingReference":"200m board approaching on left side of main straight. Then the 100m board on the left \u2014 this is where eyes commit to the braking zone.","turnInReference":"Right-hand edge of track \u2014 use full width of right side. The white line on the right provides the turn-in visual anchor.","apexFixation":"Inside red-white kerb at the tightest point. Close to kerb but avoid mounting it \u2014 the kerb edge itself is the fixation point.","exitTarget":"Rough ripple strip on right side of exit. Straddle the ripple strip \u2014 two wheels outside on the smooth concrete pad beyond it.","peripheralCues":"Concrete pad visible on exit outside. Tyre wall barrier on outside through corner. Main straight receding in peripheral behind."},"kerbDescription":{"inside":"Red-white striped kerb at apex. Avoid using too much \u2014 unbalances car on acceleration.","outside":"Rough ripple strip on exit (right side). Smooth concrete pad beyond the ripple strip.","notes":"CAUTION: Ripple strip gets greasy in wet conditions. The concrete pad outside is safe to straddle."},"elevation":"flat","camber":"positive","approach":"Long main straight \u2014 high speed approach. 200m and 100m boards on left provide braking references.","exitTo":"Short kinked straight to Turn 2 \u2014 straight is not truly straight, has a slight kink.","isPartOfComplex":false,"complexWith":[],"visualChallenge":"Long straight means high closing speed. Eyes must commit early to the 200m board, then transfer to 100m board, then to apex kerb \u2014 three saccades in quick succession at high speed.","danVanNotes":"High-speed entry from main straight can trigger VAN if braking commitment is late. Lock eyes onto 200m board early to anchor DAN. The kerb is a strong visual target \u2014 let it pull the gaze."},{"number":2,"name":"Turn 2","direction":"right","type":"sweeper","severity":"fast","gazeTargets":{"brakingReference":"Short braking zone \u2014 the kinked straight from T1 narrows the visual field. The outside edge of track where it begins to curve right is the braking anchor.","turnInReference":"Do not turn in too early \u2014 the turn-in point is later than it appears. Look for where the inside kerb begins on the right.","apexFixation":"Large apex kerb \u2014 the visual target is RIGHT BESIDE the kerb but NOT on it. The kerb edge is the fixation line. Bump visible near apex \u2014 peripheral awareness of surface change.","exitTarget":"Right-hand side kerbing on exit. Full throttle zone \u2014 eyes snap to the exit kerbing and track-out point toward Turn 3.","peripheralCues":"Tyre wall on outside. Large gravel trap visible on outside. Club track junction visible (grey area) \u2014 ignore it, peripheral only. Dip on entry creates a visual pitch change."},"kerbDescription":{"inside":"Large red-white apex kerb \u2014 do NOT mount it, it's quite large. Stay right beside it.","outside":"Red-white exit kerbing on right \u2014 use this on exit.","notes":"Quickest corner on the circuit. Apex kerb is large and will unbalance the car if mounted."},"elevation":"dip","camber":"positive","approach":"Short kinked straight from Turn 1 \u2014 car needs to be eased to middle then re-committed to outside. The straight is NOT truly straight.","exitTo":"Full throttle run to Turn 3 (Hairpin) \u2014 heading towards the right side of circuit.","isPartOfComplex":false,"complexWith":[],"visualChallenge":"Dip on entry disrupts visual horizon momentarily. The kinked straight means gaze must re-anchor after T1 exit. Bump near apex can pull attention down \u2014 keep eyes on kerb edge, not surface.","danVanNotes":"Fastest corner on circuit \u2014 VAN risk if eyes drop to surface at the dip or bump. The large kerb is a powerful DAN anchor \u2014 commit gaze to its edge early. Trust peripheral vision for the bump."},{"number":3,"name":"Hairpin (Turn 3)","direction":"right","type":"hairpin","severity":"very_tight","gazeTargets":{"brakingReference":"Full throttle approach from T2. The visual cue is the track narrowing as it bends sharply right. Brake marker boards if present, otherwise the point where the hairpin geometry becomes visible ahead.","turnInReference":"Keep car straight heading towards right side of circuit. The turn-in is where eyes shift from the braking zone to the inside of the hairpin \u2014 the inside kerb appearing in peripheral vision.","apexFixation":"Apex is \u2154 of the way around the hairpin. Important to be CLOSE to the kerb but no advantage in touching it. The kerb edge at the \u2154 point is the QE fixation target.","exitTarget":"Track opening up on right side beyond the hairpin. Do NOT let eyes drop to the right-side ripple strip \u2014 look past it to where the track straightens toward T4.","peripheralCues":"Club track junction visible on inside of hairpin (grey area). Large gravel trap on outside. Tyre wall barriers on outside. Right-side ripple strip on exit \u2014 peripheral only, do not fixate."},"kerbDescription":{"inside":"Red-white kerb through hairpin. Be close but do not touch \u2014 no advantage in mounting it.","outside":"Ripple strip on right side of exit. Difficult to avoid if entered too fast or applied power too early.","notes":"Slowest corner on the circuit. The \u2154 apex means a late apex \u2014 eyes must wait for it."},"elevation":"flat","camber":"positive","approach":"Full throttle from Turn 2 \u2014 long braking zone into slowest corner on circuit.","exitTo":"Short straight with slight S-bends heading into Turn 4 (the complex).","isPartOfComplex":false,"complexWith":[],"visualChallenge":"Late apex (\u2154 around) means the eyes must resist locking onto the early part of the kerb. The hairpin geometry pulls the gaze inward too early \u2014 WAIT for the \u2154 point. Exit ripple strip is a VAN trap if you look at it.","danVanNotes":"Biggest VAN risk: eyes dropping to right-side ripple strip on exit \u2014 this is target fixation toward the hazard. DAN fix: lock exit gaze PAST the ripple strip to where the track opens. The \u2154 late apex requires patience \u2014 if gaze commits too early, DAN breaks and VAN uncertainty creeps in."},{"number":4,"name":"Turn 4 (The Complex Entry)","direction":"left","type":"medium","severity":"medium","gazeTargets":{"brakingReference":"Enter on the left-hand side. White line on the left of the circuit is the braking anchor. Brake hard ON the white line.","turnInReference":"Late turn-in point \u2014 deeper than you think. Let the car go into the corner further before committing the turn. The inside (left) kerb appearing is the turn-in trigger.","apexFixation":"Apex is \u2154 of the way around. Large kerbing marks the apex \u2014 do NOT want to hit it, but it's the visual reference. Eyes fixate on the kerb edge at the \u2154 point.","exitTarget":"Middle of track \u2014 eyes must immediately find the NEXT apex (Turn 5, right-hander). Exit gaze transitions straight to T5 entry reference.","peripheralCues":"The S-bend approach creates a visual rhythm. Gravel trap on outside. The next right-hand curve (T5) visible in peripheral as you approach the apex."},"kerbDescription":{"inside":"Large red-white kerbing at apex. Avoid hitting it but use as visual reference.","outside":"Exit kerb \u2014 let car run out to it. Preferred to keep car tight on exit.","notes":"Part of 'the complex' \u2014 speed through this section matters. Late turn-in is critical."},"elevation":"flat","camber":"positive","approach":"Relatively easy straight line through slight S-bends from Hairpin. Speed through the complex affects everything after it.","exitTo":"Immediately into Turn 5 (right-hander) \u2014 need to balance car and carry maximum speed through.","isPartOfComplex":true,"complexWith":[5],"visualChallenge":"The S-bend approach makes the visual line non-obvious. Late turn-in means eyes must hold on the braking reference (white line) longer than instinct says. Exit gaze must immediately find T5 \u2014 no resting point between corners.","danVanNotes":"Speed through the complex is critical \u2014 if eyes are uncertain here, VAN fires and scrubs speed for the entire complex section. Commit to the white line braking reference early. The late turn-in requires DAN discipline \u2014 eyes must WAIT for the deeper entry point."},{"number":5,"name":"Turn 5 (In-field Sweeper)","direction":"right","type":"sweeper","severity":"medium","gazeTargets":{"brakingReference":"Let car run from Turn 4 exit nice and wide \u2014 then brake hard in a straight line up to mid-track. The point where you need to be facing the direction you want to go is the braking anchor.","turnInReference":"Turn the car so you are effectively facing the direction you want to go. The inside kerb line appearing on the right is the turn-in visual cue.","apexFixation":"Apex is \u2154 of the way around the sweeper. Smooth throttle here \u2014 the kerb edge at \u2154 point is the fixation target. Do NOT run over the apex kerbing \u2014 it upsets the car's balance.","exitTarget":"Watch for the large ripple section on the outside of the corner. Eyes must look PAST the ripple strip to where the track straightens toward Turn 6.","peripheralCues":"Large ripple strip section on outside is a strong peripheral cue for track limits. There is an opportunity to run slightly wide after the ripple strip if necessary \u2014 the exit is almost at the end of this ripple strip."},"kerbDescription":{"inside":"Red-white apex kerb. Running over it will upset the car's balance \u2014 stay beside it.","outside":"Large ripple strip section on outside of exit. Can run slightly wide after it ends.","notes":"Very challenging to master. The line through here is debated."},"elevation":"flat","camber":"mixed","approach":"Direct from Turn 4 exit \u2014 let car run wide from previous corner before braking.","exitTo":"Run toward Turn 6 \u2014 use every bit of track on left-hand side as approach.","isPartOfComplex":true,"complexWith":[4],"visualChallenge":"The most challenging corner to master. The ideal line is debated, which means the visual anchors are less obvious. The ripple strip on exit is a strong VAN attractor. Need to trust the \u2154 apex commitment even though the line feels uncertain.","danVanNotes":"Highest VAN risk on the circuit \u2014 the brain hasn't decided where to look, which is exactly when VAN takes over. Fix: pre-commit to the \u2154 apex kerb as the sole fixation target. If the eyes are calm at that one point, the rest of the sweeper follows. The ripple strip exit is the secondary VAN trap \u2014 eyes must look THROUGH it."},{"number":6,"name":"Turn 6","direction":"right","type":"medium","severity":"medium","gazeTargets":{"brakingReference":"Use every bit of track on left-hand side approaching. Small concrete kerbing on left provides extra width \u2014 sneak onto it. Short brake \u2014 common problem is braking too late. The turn-in comes slightly EARLIER than expected.","turnInReference":"Get car into the turn slightly earlier than you would think. The inside kerb on the right appearing is the turn-in cue \u2014 but it comes sooner than instinct suggests.","apexFixation":"On the power heading toward apex. It's possible to USE the kerbing here \u2014 the apex kerb can be clipped. This is the fixation point: the kerb edge where you can clip it.","exitTarget":"Let car drift to left-hand side while still on power. DO NOT look at the exit kerbing \u2014 running over it tends to suck the car off track and into the dirt. Eyes look PAST it to the straight toward Cochrane.","peripheralCues":"Concrete kerbing on left at entry gives extra space. Exit kerbing on left is a danger zone \u2014 peripheral only. The straight toward Cochrane visible ahead."},"kerbDescription":{"inside":"Apex kerb can be clipped \u2014 usable as a reference point.","outside":"EXIT DANGER: Kerbing at exit tends to suck car off track into dirt. Avoid running over it.","notes":"Common problem is braking too late and entering too fast. Turn in earlier than you think."},"elevation":"flat","camber":"positive","approach":"From Turn 5 exit \u2014 use full width of left side, including small concrete kerbing for extra room.","exitTo":"Short straight into Cochrane (Turn 6b) \u2014 no time to get fully to right-hand side.","isPartOfComplex":true,"complexWith":[7],"visualChallenge":"The earlier-than-expected turn-in means eyes must commit to the apex sooner than instinct allows. The exit kerbing is a VAN trap \u2014 it sucks the car off track, so the gaze must actively avoid it.","danVanNotes":"Counter-intuitive timing \u2014 turn in earlier than you think. DAN must override the instinct to wait. The exit kerb is the primary VAN hazard: if eyes drop to it, the car follows. Keep exit gaze on the straight ahead, not the kerb edge."},{"number":7,"name":"Cochrane","direction":"right","type":"medium","severity":"tight","gazeTargets":{"brakingReference":"Nice straight line brake from T6 exit. No time to get car to right-hand side \u2014 \u00bd track width is adequate for entry positioning. The braking reference is the point where Cochrane's curve becomes visible.","turnInReference":"Turn the car AS you come off the brakes \u2014 the transition from braking to turning is simultaneous. Get on the throttle by the apex.","apexFixation":"Apex kerb can be clipped \u2014 use it more as a REFERENCE POINT to know you are at the apex. The kerb edge is the QE fixation point.","exitTarget":"Full throttle at exit. Taking advantage of the kerbing \u2014 run the car ALONG the exit kerbing, then smoothly back onto the track heading for Turn 7.","peripheralCues":"T6 exit still in peripheral behind. The exit kerbing line provides a guiding visual rail toward Turn 7. Pit entry visible on left."},"kerbDescription":{"inside":"Apex kerb \u2014 clippable, serves as reference point to confirm apex position.","outside":"Exit kerbing \u2014 take full advantage, run along it before transitioning back to track.","notes":"Very quick transition from T6. No time to fully position \u2014 commit to \u00bd track entry width."},"elevation":"flat","camber":"positive","approach":"Immediate from Turn 6 exit \u2014 straight line brake but only \u00bd track positioning available.","exitTo":"Full throttle along exit kerbing toward Turn 7 (final corner before main straight).","isPartOfComplex":true,"complexWith":[6],"visualChallenge":"Rapid transition from T6 \u2014 eyes must re-anchor very quickly from T6 exit gaze to Cochrane braking reference. The simultaneous brake-to-turn transition means gaze must already be committed to the apex before the car has finished braking.","danVanNotes":"Speed of transition from T6 is the VAN risk \u2014 if eyes haven't found the new anchor by the time braking starts, VAN fires. Pre-load the Cochrane apex in peripheral vision while still completing T6 exit. The apex kerb as a reference point to know you are there is perfect QE language \u2014 it's a settling point, not an action point."},{"number":8,"name":"Turn 7 (Final Sweeper)","direction":"left","type":"sweeper","severity":"medium","gazeTargets":{"brakingReference":"Approach \u2154 to the right-hand side of entry. Not necessary to follow the white line. Quite a deep braking zone \u2014 the brake point is where the sweeper geometry becomes visible.","turnInReference":"Turn the car smoothly. The tendency is to accelerate too quickly \u2014 the turn-in must be smooth and progressive. Inside (left) kerb appearing is the turn-in cue.","apexFixation":"Apex is \u2154 of the way around the sweeper. Full throttle looking for the apex \u2014 the red-white kerb at the \u2154 point is the QE fixation target.","exitTarget":"Use FULL WIDTH of road at exit. Let car run smoothly up to the white line on the right-hand side. The white line on the right is the exit gaze target \u2014 eyes must find it early to maximise straight-line speed.","peripheralCues":"CONCRETE WALL on outside if out too wide \u2014 apexed early = in trouble. No run-off at this corner. Pit entry on left visible. Main straight opening up ahead is the long-range visual anchor."},"kerbDescription":{"inside":"Red-white apex kerb at the \u2154 point.","outside":"Concrete wall \u2014 NO run-off. White line on right at exit provides track limit reference.","notes":"CRITICAL CORNER: No run-off, concrete wall on outside. Keep your eyes up. Gear change points after corner indicate exit quality."},"elevation":"flat","camber":"positive","approach":"From Cochrane exit \u2014 full throttle along exit kerbing, then deep braking into sweeper.","exitTo":"Main straight \u2014 front straight. Quality of exit directly determines straight-line speed. Very important corner.","isPartOfComplex":false,"complexWith":[],"visualChallenge":"Concrete wall on outside with no run-off \u2014 the biggest consequence corner on the circuit. If apexed too early, the wall is the consequence. Eyes must stay UP and committed to the \u2154 apex, not dropping to the wall.","danVanNotes":"HIGHEST CONSEQUENCE CORNER. The concrete wall is the ultimate VAN trigger \u2014 if eyes even glance at it, target fixation takes over. DAN must be absolute here. The \u2154 late apex is the single settling point. Keep your eyes up is pure QE instruction \u2014 eyes on the apex kerb, aware of the exit white line in peripheral. The wall exists only in peripheral. This corner determines lap time \u2014 the exit speed sets the entire main straight speed."}],"notableVisualFeatures":["200m and 100m braking boards on main straight approach to Turn 1 \u2014 primary distance reference for the entire lap","Red-white striped kerbs at every apex \u2014 consistent visual language throughout the circuit, all kerbs are the same style","Ripple strips (rough concrete) on exits of T1, T3, T5 \u2014 these are VAN traps if fixated upon. Use as peripheral track-limit references only","Club Track junction visible at T2/T3 area (grey shaded) \u2014 ignore as visual noise, peripheral only","Concrete pad beyond T1 exit ripple strip \u2014 safe run-off surface, can straddle","White line on left side of circuit usable as braking reference at T4","Small concrete kerbing on left at T6 entry provides extra track width","Pit entry visible on left between Cochrane and Turn 7","Concrete wall on outside of Turn 7 \u2014 NO run-off. Most consequential visual landmark on the circuit","Tyre wall barriers on outside of T1, T2, T3 provide peripheral depth cues","The circuit has a \u2154 apex pattern \u2014 Turns 3, 4, 5, 7 all have late apexes at approximately \u2154 through the corner"],"problemCornersForQuietEye":[{"cornerNumber":5,"issue":"Most challenging corner to master \u2014 the ideal line is debated, meaning there's no single obvious visual anchor. Uncertainty breaks QE.","remedy":"Pre-commit to the \u2154 apex kerb as the SOLE fixation target. Accept that the line may vary but the gaze anchor doesn't. If the eyes are calm at that one point, the body finds the line. Train this corner 3x in weak corner reps."},{"cornerNumber":8,"issue":"Concrete wall on outside with no run-off. Highest consequence = highest VAN activation. The guide explicitly says keep your eyes up \u2014 acknowledging the natural tendency to drop gaze toward the hazard.","remedy":"This is the single most important QE corner on the circuit. The \u2154 apex kerb is the settling point. The wall does NOT exist in foveal vision \u2014 it is peripheral only. Train the exit gaze to snap to the right-hand white line, not to check the wall distance. Eyes up must become automatic."},{"cornerNumber":3,"issue":"Hairpin with late \u2154 apex \u2014 eyes naturally want to fixate on the early part of the kerb because the hairpin is so tight. Exit ripple strip is a secondary VAN trap.","remedy":"Train the gaze to WAIT for the \u2154 point. Count the kerb \u2014 the fixation point is late. For exit, pre-load the track-straightening point beyond the ripple strip as the PFTS target. The ripple strip is peripheral only."},{"cornerNumber":6,"issue":"Counter-intuitive turn-in timing (earlier than expected) conflicts with natural gaze rhythm. Exit kerbing sucks car off track \u2014 a strong VAN attractor.","remedy":"Override instinct with trained timing \u2014 the eyes must commit to the apex earlier than feels natural. Practice the earlier commitment in Laps 1-2 pause mode. For exit, gaze must actively skip past the kerbing to the straight toward Cochrane."}],"_source":"2K Cup TrackTime Manual \u2014 Ruapuna Park (PDF track guide with corner-by-corner diagrams)","_cachedAt":1740787200000,"_manualEntry":true},


    // ============================================================
    //  TRACK GUIDE EXTRACTION — Gemini Vision on Uploaded PDFs/Images
    //  Extracts QE-relevant gaze targets from track guides, maps, notes
    // ============================================================

    /**
     * Extract QE data from an uploaded track guide (images from a PDF, track map, or text notes).
     * Sends each page/image to Gemini Vision for QE-focused analysis.
     * @param {Array<{type: string, data: string}>} pages — array of {type: 'image'|'text', data: base64DataUrl|textContent}
     * @param {string} trackName — name of the circuit
     * @param {string} vehicleType — motorcycle|car|kart|formula
     * @param {Function} onProgress — (pct, message) callback
     * @returns {Object} structured QE track data (same format as researchTrack output)
     */
    async extractFromTrackGuide(pages, trackName, vehicleType, onProgress) {
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key needed to extract track guide data. Set your key in Settings.');
        }

        if (onProgress) onProgress(5, 'Preparing track guide for analysis...');

        // Build content parts from all pages
        const contentParts = [];

        // Add the extraction prompt first
        contentParts.push({
            text: this._buildGuideExtractionPrompt(trackName, vehicleType)
        });

        // Add each page as image or text
        pages.forEach((page, i) => {
            if (page.type === 'image') {
                // Extract mime type and base64 from data URL
                const match = page.data.match(/^data:(image\/\w+);base64,(.+)$/);
                if (match) {
                    contentParts.push({
                        inlineData: {
                            mimeType: match[1],
                            data: match[2]
                        }
                    });
                }
            } else if (page.type === 'text') {
                contentParts.push({
                    text: `--- PAGE ${i + 1} TEXT CONTENT ---\n${page.data}\n--- END PAGE ${i + 1} ---`
                });
            }
        });

        if (onProgress) onProgress(20, `Sending ${pages.length} page(s) to Gemini Vision...`);

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${this.geminiApiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: contentParts
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 16384
                    }
                })
            });

            if (onProgress) onProgress(60, 'Extracting visual landmarks and gaze targets...');

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
            }

            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Empty response from Gemini guide extraction.');

            if (onProgress) onProgress(80, 'Structuring QE corner data...');

            // Parse JSON
            let jsonStr = rawText.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            let trackData;
            try {
                trackData = JSON.parse(jsonStr);
            } catch (e) {
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    trackData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Could not parse track guide extraction data.');
                }
            }

            // Mark source and cache
            trackData._source = 'track_guide_upload';
            trackData._cachedAt = Date.now();

            const cacheKey = `lb_track_${(trackName || 'unknown').toLowerCase().replace(/\s+/g, '_')}_general`;
            try {
                localStorage.setItem(cacheKey, JSON.stringify(trackData));
            } catch (e) { console.warn('[AIEngine] Cache storage failed:', e.message); }

            if (onProgress) onProgress(100, `Guide extracted — ${trackData.corners?.length || 0} corners with QE data`);

            return trackData;

        } catch (error) {
            if (error.message.includes('API key') || error.message.includes('API_KEY')) {
                throw new Error('Invalid Gemini API key. Check your key in Settings.');
            }
            throw error;
        }
    },

    /**
     * Build the prompt for extracting QE data from a track guide document.
     */
    _buildGuideExtractionPrompt(trackName, vehicleType) {
        return `You are a Quiet Eye conditioning data extractor. You are reading a TRACK GUIDE document for "${trackName || 'a racing circuit'}".

YOUR TASK: Extract every piece of VISUAL and SPATIAL information that can be used to build Quiet Eye gaze-lock protocols.

CRITICAL: This is NOT about driving/riding technique. Extract what the EYES see:
- What visual landmarks mark braking zones? (boards, kerb starts, barrier ends, shadow lines, bridge pillars)
- What does the apex LOOK like? (kerb colour, kerb type — flat/sausage/ripple, grass edge, drain covers)
- What does the exit target look like? (exit kerb end, barrier opening, track straightening point)
- What's in PERIPHERAL vision? (gravel traps, walls, grandstands, concrete pads)
- What's DANGEROUS for the eyes? (blind crests, ripple strips that attract gaze, walls with no run-off)
- What would trigger VAN (threat response)? (walls, drops, kerbs that unbalance the car)
- What helps DAN (goal-directed focus) stay locked? (clear kerb references, distance boards, consistent visual anchors)

For vehicle type "${vehicleType || 'car'}", note any visual field implications (visor frame for motorcycle, A-pillars for car, etc.)

LOOK AT EVERY IMAGE carefully. Extract:
- Corner numbers and names from maps
- BP (Braking Point), TP (Turn-in Point), APEX, EXIT markers on diagrams
- Kerb colours and patterns (red-white, sausage kerbs, ripple strips)
- Gravel/grass/wall positions relative to corners
- Any arrows, racing lines, or directional indicators
- Any text descriptions of entry, apex, and exit for each corner
- Notes and warnings (wet conditions, bumps, dips)

RESPOND ONLY IN VALID JSON with this exact structure:
{
  "trackName": "string",
  "country": "string",
  "length": "string",
  "direction": "clockwise|anticlockwise",
  "totalCorners": number,
  "surfaceNotes": "string",
  "elevationProfile": "string",
  "corners": [
    {
      "number": 1,
      "name": "string",
      "direction": "left|right",
      "type": "hairpin|sweeper|chicane|esses|kink|offcamber|medium",
      "severity": "very_tight|tight|medium|fast|flat_out",
      "gazeTargets": {
        "brakingReference": "string — specific visual landmark for braking",
        "turnInReference": "string — what eyes shift to at turn-in",
        "apexFixation": "string — the exact visual point eyes settle on at apex",
        "exitTarget": "string — where eyes snap to before throttle",
        "peripheralCues": "string — what exists in peripheral vision"
      },
      "kerbDescription": {
        "inside": "string — colour, type, aggressiveness",
        "outside": "string — exit kerb details",
        "notes": "string — warnings about kerbs"
      },
      "elevation": "uphill|downhill|flat|crest|dip|blind_crest",
      "camber": "positive|negative|off_camber|mixed",
      "approach": "string — what comes before",
      "exitTo": "string — what follows",
      "isPartOfComplex": false,
      "complexWith": [],
      "visualChallenge": "string — what makes this corner hard for the EYES",
      "danVanNotes": "string — QE analysis: VAN triggers and DAN anchors"
    }
  ],
  "notableVisualFeatures": ["string"],
  "problemCornersForQuietEye": [
    {
      "cornerNumber": number,
      "issue": "string — why this corner is hard for QE",
      "remedy": "string — QE-specific fix"
    }
  ]
}

Be SPECIFIC. "The apex" is useless. "Red-white kerb at the ⅔ point, do not mount — stay beside it" is what the eyes need.
If the guide mentions specific distances (200m board, 100m board), include them.
If the guide warns about specific hazards (ripple strips, concrete walls, no run-off), flag these as VAN triggers.`;
    },


    // ============================================================
    //  GEMINI VIDEO ANALYSIS — Full Video Upload (Forward Pass)
    //  Uploads complete lap video to Gemini 2.5 Pro for automated
    //  corner detection with timestamps and visual references
    // ============================================================

    /**
     * Upload a video file to Gemini Files API and return the file URI.
     * @param {File} videoFile — the video file to upload
     * @param {Function} onProgress — (pct, message) callback
     * @returns {Object} { fileUri, mimeType } for use in generateContent
     */
    async _uploadVideoToGemini(videoFile, onProgress) {
        if (!this.geminiApiKey) {
            throw new Error('Gemini API key not configured. Set your key in Settings.');
        }

        if (onProgress) onProgress(5, `Uploading ${(videoFile.size / (1024 * 1024)).toFixed(1)}MB video to Gemini...`);

        // Step 1: Start resumable upload
        const startUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.geminiApiKey}`;
        const startResponse = await fetch(startUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'start',
                'X-Goog-Upload-Header-Content-Length': videoFile.size,
                'X-Goog-Upload-Header-Content-Type': videoFile.type || 'video/mp4',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file: {
                    display_name: videoFile.name || 'lap-video'
                }
            })
        });

        if (!startResponse.ok) {
            const err = await startResponse.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini upload start failed: ${startResponse.status}`);
        }

        const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) throw new Error('No upload URL returned from Gemini Files API');

        // Step 2: Upload the file bytes
        if (onProgress) onProgress(15, 'Sending video data...');

        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Length': videoFile.size,
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize'
            },
            body: videoFile
        });

        if (!uploadResponse.ok) {
            const err = await uploadResponse.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini upload failed: ${uploadResponse.status}`);
        }

        const uploadResult = await uploadResponse.json();
        const fileName = uploadResult.file?.name;
        if (!fileName) throw new Error('No file name returned from Gemini upload');

        // Step 3: Poll for processing to complete
        if (onProgress) onProgress(30, 'Gemini processing video...');

        let fileUri = uploadResult.file?.uri;
        let state = uploadResult.file?.state;
        let pollCount = 0;
        const maxPolls = 120; // 10 minutes max (5s intervals)

        while (state === 'PROCESSING' && pollCount < maxPolls) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;

            const pct = Math.min(30 + (pollCount / maxPolls) * 30, 58);
            if (onProgress) onProgress(pct, `Gemini processing video... (${pollCount * 5}s)`);

            const checkUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${this.geminiApiKey}`;
            const checkResponse = await fetch(checkUrl);
            if (!checkResponse.ok) continue;

            const checkResult = await checkResponse.json();
            state = checkResult.state;
            fileUri = checkResult.uri;
        }

        if (state === 'PROCESSING') {
            throw new Error('Video processing timed out. Try a shorter or smaller video.');
        }
        if (state === 'FAILED') {
            throw new Error('Gemini failed to process video. Try a different format (MP4 recommended).');
        }

        if (onProgress) onProgress(60, 'Video ready for analysis');

        return {
            fileUri: fileUri,
            mimeType: videoFile.type || 'video/mp4',
            fileName: fileName
        };
    },

    /**
     * Analyze an uploaded lap video using Gemini 2.5 Pro to detect all corners
     * with timestamps, visual references, and confidence scores.
     * This is the FORWARD PASS from Craig's 14-step pipeline (Step 3).
     *
     * @param {File} videoFile — the trimmed lap video file
     * @param {Object} options — { trackName, vehicleType, lapStart, lapEnd }
     * @param {Function} onProgress — (pct, message) callback
     * @returns {Object} { corners: [...], lapDuration, trackEstimate }
     */
    async analyzeVideoForward(videoFile, options = {}, onProgress) {
        const { trackName, vehicleType, lapStart, lapEnd } = options;

        if (onProgress) onProgress(2, 'Starting forward pass video analysis...');

        // Upload video to Gemini
        const uploaded = await this._uploadVideoToGemini(videoFile, (pct, msg) => {
            // Scale upload progress to 0-60%
            if (onProgress) onProgress(Math.round(pct * 0.6), msg);
        });

        if (onProgress) onProgress(62, 'Analysing video for corners...');

        // Build the forward pass prompt
        const prompt = this._buildForwardPassPrompt(trackName, vehicleType, lapStart, lapEnd);

        // Call Gemini 2.5 Pro with the uploaded video
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${this.geminiApiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            fileData: {
                                mimeType: uploaded.mimeType,
                                fileUri: uploaded.fileUri
                            }
                        },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 16384
                }
            })
        });

        if (onProgress) onProgress(85, 'Processing corner detection results...');

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini API Error: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Empty response from Gemini video analysis.');

        // Parse JSON response
        let jsonStr = rawText.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        let result;
        try {
            result = JSON.parse(jsonStr);
        } catch (e) {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                console.error('[AIEngine] Failed to parse forward pass response:', rawText.substring(0, 500));
                throw new Error('Could not parse video analysis data. Try again.');
            }
        }

        // Clean up the uploaded file (fire and forget)
        try {
            await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploaded.fileName}?key=${this.geminiApiKey}`, {
                method: 'DELETE'
            });
        } catch (e) { /* non-critical */ }

        if (onProgress) onProgress(100, `Forward pass complete — ${result.corners?.length || 0} corners detected`);

        return result;
    },

    /**
     * Build the forward pass corner detection prompt.
     * Gemini watches the video and identifies every corner with timestamps.
     */
    _buildForwardPassPrompt(trackName, vehicleType, lapStart, lapEnd) {
        const timeContext = (lapStart != null && lapEnd != null)
            ? `\nThe lap runs from ${lapStart.toFixed(1)}s to ${lapEnd.toFixed(1)}s in the video. Only analyse this segment.`
            : '';

        const trackContext = trackName
            ? `\nThis is onboard footage from "${trackName}".`
            : '\nThe track name is unknown — identify it if possible from visual cues.';

        const vehicleContext = vehicleType
            ? `\nVehicle type: ${vehicleType}.`
            : '';

        return `You are a visual target analyst for a gaze conditioning system used by racing drivers and riders.

You are NOT analysing driving technique. You are identifying VISUAL TARGETS — the specific objects, markers, and reference points that are visible in the onboard footage at critical moments around each corner.
${trackContext}${vehicleContext}${timeContext}

Watch this onboard lap video. For every corner on the track, identify and timestamp these four moments:

1. BRAKING MARKER VISIBLE — The exact moment a braking reference (distance board, marshal post, kerb start, barrier, shadow, bridge, sign, tree, building) first becomes visible IN THE DISTANCE ahead. This is NOT when braking happens — it is when the marker first appears in the visual field.

2. APEX VISIBLE — The moment the inside of the corner (kerb, grass edge, cone, painted line, rumble strip) is clearly visible and the vehicle is at or near the braking point.

3. EXIT VISIBLE — The moment the corner exit (track opening up, exit kerb, straight ahead) becomes the dominant visual target. The vehicle is at or near the apex.

4. STRAIGHT / NEXT BRAKING MARKER VISIBLE — The moment the road ahead opens up after the corner AND the next corner's braking reference begins to appear in the distance.

For each of these four moments, describe:
- TIMESTAMP: in seconds from video start (e.g. 12.4)
- WHAT IS VISIBLE: Describe exactly what physical object/marker/reference is in the centre of the visual field
- WHAT IS IN PERIPHERAL VISION: Describe what is visible to the left and right edges of the frame — this represents the driver's peripheral awareness

CRITICAL RULES:
- You are describing what is VISIBLE in the video frame, not what the driver should do
- Describe physical objects: "200m board on left side", "inside kerb with red/white paint", "concrete pad on right", "marshal post beside track"
- Do NOT describe actions, technique, speed, or driving advice
- If a marker is unclear or not visible, state "NO CLEAR MARKER VISIBLE — nearest reference: [describe]"
- For moments where the next braking marker is not yet visible on the straight, state the approximate timestamp when it first appears
- Timestamps must be in SECONDS from start of video (e.g. 12.5, not "0:12")
- Every corner must have brakeMarkerVisible ≤ entry ≤ apex ≤ exit ≤ nextMarkerVisible
- If corners form a complex (chicane, esses), still list them individually but note the connection

RESPOND IN VALID JSON ONLY:
{
  "trackEstimate": "string — your best guess at the track name, or 'Unknown'",
  "lapDuration": number,
  "totalCorners": number,
  "corners": [
    {
      "number": 1,
      "name": "string — corner name if known, otherwise 'Turn 1'",
      "direction": "left|right",
      "type": "hairpin|tight|sweeper|kink|chicane|esses|offcamber|straight|medium",
      "severity": "very_tight|tight|medium|fast|flat_out",
      "timestamps": {
        "brakeMarkerVisible": 0.0,
        "entry": 0.0,
        "apex": 0.0,
        "exit": 0.0,
        "nextMarkerVisible": 0.0
      },
      "pause_points": [
        {
          "cue": "Eyes Braking Marker — Aware Apex",
          "timestamp": 0.0,
          "eyes_target": "200m distance board on left side of track",
          "peripheral_field": "Inside kerb beginning to appear on right edge of frame"
        },
        {
          "cue": "Eyes Apex — Aware Exit",
          "timestamp": 0.0,
          "eyes_target": "Red and white inside kerb at closest point",
          "peripheral_field": "Track opening up on left edge of frame, concrete pad visible"
        },
        {
          "cue": "Eyes Exit — Aware Straight",
          "timestamp": 0.0,
          "eyes_target": "Concrete pad beyond ripple strip on right",
          "peripheral_field": "Straight road ahead visible in upper portion of frame"
        },
        {
          "cue": "Eyes Straight — Aware Braking Marker",
          "timestamp": 0.0,
          "eyes_target": "Straight road ahead",
          "peripheral_field": "Next corner entry reference beginning to appear in distance"
        }
      ],
      "visualReferences": {
        "brakingReference": "string — physical object eyes fixate on as braking cue",
        "apexFixation": "string — physical object eyes lock onto at apex",
        "exitTarget": "string — physical object eyes snap to on exit",
        "peripheralCues": "string — what's in peripheral vision"
      },
      "isPartOfComplex": false,
      "complexWith": [],
      "confidence": 0.95
    }
  ]
}`;
    },


    // ============================================================
    //  GPT-4o TRACK MAP ANALYSIS — Spatial/Geometric Reasoning
    // ============================================================

    /**
     * Analyze a track map image using GPT-4o to extract corner geometry,
     * spatial relationships, racing line, and corner characteristics.
     * @param {string} trackMapDataUrl — base64 data URL of the track map image
     * @param {string} trackName — name of the circuit
     * @param {Array} existingCorners — any corners already detected from video
     * @param {Function} onProgress — (pct, message) callback
     * @returns {Object} enriched corner data with spatial information
     */
    async analyzeTrackMap(trackMapDataUrl, trackName, existingCorners = [], onProgress) {
        if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured. Set your GPT-4o key in Settings for track map analysis.');
        }

        if (onProgress) onProgress(10, 'Preparing track map for GPT-4o...');

        const existingDesc = existingCorners.length > 0
            ? `\n\nEXISTING CORNERS DETECTED FROM VIDEO:\n${existingCorners.map((c, i) =>
                `Corner ${i + 1}: "${c.name}" — ${c.direction || 'unknown'} ${c.type || c.cornerType || ''}, severity: ${c.severity || 'unknown'}`
              ).join('\n')}\n\nCross-reference these with what you see on the map.`
            : '';

        const content = [
            {
                type: 'text',
                text: `You are a visual target mapper for a gaze conditioning system used by racing drivers and riders.

You are NOT analysing racing lines or driving technique. You are identifying WHAT PHYSICAL OBJECTS are visible at each critical point around each corner — the things a driver's eyes would fixate on.

Look at this track map for "${trackName || 'Unknown Track'}". For each corner marked on the map, identify:

1. BRAKING MARKER — What physical object or reference would be visible ahead as the driver approaches? Look for: distance boards, marshal posts, barriers, kerb starts, track edge changes, buildings, trees, bridges, painted markings, tyre walls, catch fencing. Describe the object and its position (left/right of track).

2. APEX REFERENCE — What physical object marks the inside of the corner? Look for: inside kerb (describe colour/type), grass edge, painted line, rumble strip, cone position, marshal post, tyre barrier. Describe what the driver would fixate on.

3. EXIT REFERENCE — What physical object or view marks the corner exit? Look for: exit kerb, track widening, concrete run-off, ripple strip, barrier end, straight road appearing. Describe what becomes the dominant visual target.

4. STRAIGHT / TRANSITION — What is visible between this corner's exit and the next corner's braking marker? Describe the visual field: straight road, slight curves, buildings in distance, next corner's entry features becoming visible.

Also identify from the map:
- Corner number and name (if labelled)
- Direction: Left or Right
- Whether the map shows: BP (Braking Point), TP (Turn-in Point), APEX, EXIT markers
- Any hazards or features marked: kerbing (red/white stripes), gravel traps (dots), grass (green), walls, tyre barriers, marshal posts (M), concrete pads
- Spatial relationship between corners: how far apart, connected or separated by straight
${existingDesc}

CRITICAL RULES:
- Describe only PHYSICAL OBJECTS that are visible — things eyes can fixate on
- Do NOT describe driving lines, technique, speed, or vehicle behaviour
- If the map does not show enough detail for a specific target, state "NOT VISIBLE ON MAP — requires video confirmation"
- Use the map legend and markings to identify kerb types, run-off areas, and marshal positions

Respond ONLY in valid JSON:
{
  "trackName": "string",
  "direction": "clockwise|counter-clockwise",
  "totalCorners": number,
  "sectors": [{ "name": "string", "corners": [1, 2, 3] }],
  "corners": [
    {
      "number": 1,
      "name": "string — corner name if labeled, else 'Turn N'",
      "direction": "left|right",
      "type": "hairpin|sweeper|chicane|esses|kink|offcamber|medium",
      "severity": "very_tight|tight|medium|fast|flat_out",
      "map_markers_shown": ["BP", "TP", "APEX", "EXIT"],
      "visual_targets": {
        "braking_marker": "200m board on left side — visible on approach from main straight",
        "apex_reference": "Red/white inside kerb — tight radius",
        "exit_reference": "Concrete pad on right beyond ripple strip",
        "straight_transition": "Short straight, next corner entry features visible within 100m"
      },
      "hazards_visible": ["Ripple strip on exit (right)", "Gravel trap beyond kerb"],
      "distance_to_next_corner": "short|medium|long",
      "approach": "string — what precedes this corner",
      "exit": "string — what follows this corner",
      "elevation": "uphill|downhill|flat|crest|dip|unknown",
      "isPartOfComplex": false,
      "complexWith": [],
      "brakingZone": "heavy|medium|light|none",
      "notes": "string — any additional spatial context"
    }
  ],
  "keyFeatures": ["string — notable track characteristics"]
}`
            },
            {
                type: 'image_url',
                image_url: { url: trackMapDataUrl, detail: 'high' }
            }
        ];

        if (onProgress) onProgress(30, 'Sending track map to GPT-4o...');

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content }],
                    max_tokens: 4096,
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                })
            });

            if (onProgress) onProgress(70, 'Processing spatial data...');

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || `OpenAI API Error: ${response.status}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;
            if (!text) throw new Error('Empty response from GPT-4o');

            const trackData = JSON.parse(text);

            if (onProgress) onProgress(100, `Track map analyzed — ${trackData.corners?.length || 0} corners identified`);

            return trackData;

        } catch (error) {
            if (error.message.includes('api_key') || error.message.includes('Incorrect API key')) {
                throw new Error('Invalid OpenAI API key. Check your key in Settings.');
            }
            throw error;
        }
    },

    /**
     * Merge track map spatial data with video-detected corner data.
     * Track map gives geometry; video gives timing. Together = complete picture.
     */
    mergeTrackMapData(videoCorners, mapCorners) {
        // If counts match, merge 1:1
        if (videoCorners.length === mapCorners.length) {
            return videoCorners.map((vc, i) => ({
                ...vc,
                ...mapCorners[i],
                // Prefer video timing data
                firstSight: vc.firstSight,
                brakingMarker: vc.brakingMarker,
                apex: vc.apex,
                exit: vc.exit,
                // Use map data for spatial info
                name: mapCorners[i].name || vc.name,
                type: mapCorners[i].type || vc.type || vc.cornerType,
                direction: mapCorners[i].direction || vc.direction,
                severity: mapCorners[i].severity || vc.severity,
                approach: mapCorners[i].approach,
                elevation: mapCorners[i].elevation,
                brakingZone: mapCorners[i].brakingZone,
                notes: [vc.notes, mapCorners[i].notes].filter(Boolean).join('. '),
            }));
        }

        // If counts don't match, enrich what we can by matching direction/sequence
        return videoCorners.map((vc, i) => {
            // Try to find a matching map corner by index or direction
            const mc = mapCorners[i] || {};
            return {
                ...vc,
                name: mc.name || vc.name,
                type: mc.type || vc.type || vc.cornerType,
                approach: mc.approach || '',
                elevation: mc.elevation || 'unknown',
                brakingZone: mc.brakingZone || 'unknown',
                notes: [vc.notes, mc.notes].filter(Boolean).join('. '),
            };
        });
    },


    // ============================================================
    //  SYSTEM PROMPT — The Complete Quiet Eye Science Framework
    // ============================================================

    buildSystemPrompt() {
        return `You are an elite motorsport Quiet Eye conditioning specialist and neuroscience-based performance coach. Your expertise is in Joan Vickers' Quiet Eye research, the DAN (Dorsal Attention Network) vs VAN (Ventral Attention Network) framework, and Decision Training methodology.

YOUR CORE KNOWLEDGE:
• The Quiet Eye (QE) is the final fixation or tracking gaze directed to a single target before the execution of a critical movement. Elite performers maintain QE 62% longer than novices.
• The DAN (Dorsal Attention Network) governs voluntary, goal-directed focus. It filters noise and maintains lock on apex/exit targets despite high-speed distractions.
• The VAN (Ventral Attention Network) reacts to threats (debris, riders). When dominant, it causes fragmented attention and anxiety.
• The THREE-PHASE GAZE SEQUENCE for every corner:
  1. PTIS (Pre-Turn-In Saccade): Before braking, eyes saccade to the Apex. This visual anchor organizes braking pressure and entry speed.
  2. APEX FIXATION: During lean, gaze locks on the curb/apex. This guides maximum load and prevents looking down.
  3. PFTS (Pre-Full-Throttle Saccade): Before throttle, eyes snap to the Exit target. This anticipates track-out and prevents running wide.
• The "Eyes → Aware" Protocol: "Eyes" = where foveal vision is locked (current target). "Aware" = what peripheral awareness is scanning (next target).
• Head rotation leads steering by ~0.65 seconds. Head must rotate toward apex BEFORE the bike/car reaches the turn-in point.
• Target fixation is a VAN panic response. Counter it with "Target Replacement" — force foveal vision to the escape route, keep hazard in peripheral only.
• A Lap Blueprint is NOT memorizing lines. It is: "Giving your brain a place to settle early. One place per corner where, if your eyes are calm there, the rest of the corner takes care of itself."
• The "Look and Call" drill: verbalize targets ("Brake!", "Apex!", "Exit!") before reaching them to force proactive gaze commitment.
• Weak corners should be repeated 3x for neural reprogramming.
• Subconscious Conditioning uses progressive overlay reduction across 5 laps:
  - Laps 1-2: PAUSE at each gaze point (5s), full "Eyes [X] — Aware [Y]" cues
  - Lap 3: SLOW (-10%), full cues, no pauses
  - Lap 4: NORMAL speed, "Aware [Y]" cues only
  - Lap 5: FAST (+10%), marker icons only — subconscious mode

YOUR TASK:
Generate a complete Quiet Eye Lap Blueprint. For EACH corner, you must provide:

1. GAZE SEQUENCE with exact Eyes/Aware instructions:
   - BRAKE phase: Eyes = [specific braking reference], Aware = [what they sense peripherally]
   - APEX phase: Eyes = [specific apex point], Aware = [exit preparation cue]
   - EXIT phase: Eyes = [exit target], Aware = [next straight/section]

2. QUIET EYE COACHING CUE: A single, powerful sentence the driver can use as their internal command for this corner. It should feel like a place for the brain to "settle."

3. RISK FACTORS: What can go wrong with gaze in this corner (e.g., target fixation, early apex look, instrument glance).

4. SPEED RAMP INDICATOR: Whether to approach this corner in the blueprint video at 25% speed (technical), 50% speed (moderate), or 100% speed (simple/straight).

5. LOOK-AND-CALL SCRIPT: The exact verbal sequence the driver should say aloud during training.

6. HEAD ROTATION CUE: When the head should begin rotating relative to the corner entry.

RESPOND ONLY IN VALID JSON with this exact structure:
{
  "trackName": "string",
  "clientName": "string",
  "vehicleType": "string",
  "skillLevel": "string",
  "generatedAt": "ISO date string",
  "overallStrategy": "string — 2-3 sentence overview of the lap's Quiet Eye strategy",
  "keyPrinciple": "string — the single most important thing for this driver on this track",
  "corners": [
    {
      "number": 1,
      "name": "string",
      "type": "string — hairpin/sweeper/chicane/esses/offcamber/straight",
      "gazeSequence": {
        "brake": {
          "eyes": "string — specific braking reference point",
          "aware": "string — peripheral awareness target"
        },
        "apex": {
          "eyes": "string — specific apex fixation point",
          "aware": "string — peripheral awareness during apex"
        },
        "exit": {
          "eyes": "string — specific exit target",
          "aware": "string — what awareness opens up to"
        }
      },
      "quietEyeCue": "string — the settling instruction for this corner",
      "riskFactors": ["string", "string"],
      "speedRamp": "25%|50%|100%",
      "lookAndCall": ["string", "string", "string"],
      "headRotationCue": "string — when to begin head rotation",
      "coachingNotes": "string — additional coaching context"
    }
  ],
  "trainingProtocol": {
    "dailyMinutes": 15,
    "steps": [
      {
        "title": "string",
        "instruction": "string",
        "duration": "string"
      }
    ],
    "weakCornerDrills": "string — how to identify and drill weak corners"
  }
}`;
    },

    buildUserPrompt(trackConfig) {
        const cornersDesc = trackConfig.corners.map((c, i) => {
            const lines = [`Corner ${i + 1}: "${c.name}"`];
            if (c.type || c.cornerType) lines.push(`  Type: ${c.type || c.cornerType}`);
            if (c.direction) lines.push(`  Direction: ${c.direction}`);
            if (c.severity) lines.push(`  Severity: ${c.severity}`);
            if (c.approach) lines.push(`  Approach: ${c.approach}`);
            if (c.exitTo) lines.push(`  Exit to: ${c.exitTo}`);
            if (c.elevation) lines.push(`  Elevation: ${c.elevation}`);
            if (c.camber) lines.push(`  Camber: ${c.camber}`);
            if (c.approachSpeed) lines.push(`  Approach Speed: ${c.approachSpeed}`);
            if (c.maxLeanAngle) lines.push(`  Max Lean: ${c.maxLeanAngle}°`);

            // QE-specific gaze target data from research
            if (c.gazeTargets) {
                if (c.gazeTargets.brakingReference) lines.push(`  Braking Visual Reference: ${c.gazeTargets.brakingReference}`);
                if (c.gazeTargets.turnInReference) lines.push(`  Turn-In Visual Reference: ${c.gazeTargets.turnInReference}`);
                if (c.gazeTargets.apexFixation) lines.push(`  Apex Fixation Point: ${c.gazeTargets.apexFixation}`);
                if (c.gazeTargets.exitTarget) lines.push(`  Exit Gaze Target: ${c.gazeTargets.exitTarget}`);
                if (c.gazeTargets.peripheralCues) lines.push(`  Peripheral Awareness Cues: ${c.gazeTargets.peripheralCues}`);
                // Legacy format support
                if (c.gazeTargets.brake && !c.gazeTargets.brakingReference) lines.push(`  Brake Gaze: ${c.gazeTargets.brake}`);
                if (c.gazeTargets.apex && !c.gazeTargets.apexFixation) lines.push(`  Apex Gaze: ${c.gazeTargets.apex}`);
                if (c.gazeTargets.exit && !c.gazeTargets.exitTarget) lines.push(`  Exit Gaze: ${c.gazeTargets.exit}`);
            }

            if (c.kerbDescription) {
                if (c.kerbDescription.inside) lines.push(`  Inside Kerb: ${c.kerbDescription.inside}`);
                if (c.kerbDescription.outside) lines.push(`  Outside Kerb: ${c.kerbDescription.outside}`);
            }

            if (c.visualChallenge) lines.push(`  Visual Challenge: ${c.visualChallenge}`);
            if (c.danVanNotes) lines.push(`  DAN/VAN Note: ${c.danVanNotes}`);
            if (c.notes) lines.push(`  Notes: ${c.notes}`);

            return lines.join('\n');
        }).join('\n\n');

        return `Generate a complete Quiet Eye Lap Blueprint for:

TRACK: ${trackConfig.trackName}
CLIENT: ${trackConfig.clientName}
VEHICLE: ${trackConfig.vehicleType}
SKILL LEVEL: ${trackConfig.skillLevel}

TRACK CONTEXT:
${trackConfig.trackNotes || 'No additional track data available.'}

CORNERS (with visual landmark data from track research):
${cornersDesc}

CRITICAL INSTRUCTION:
This is NOT about riding/driving technique. This is about building the perfect GAZE PROTOCOL for flow state.
Use the visual landmark data provided for each corner to create SPECIFIC, CONCRETE gaze instructions.
Instead of generic "look at the apex" — use the actual visual references: kerb colours, specific markers, landmark features.
The "Eyes" instruction must tell the brain EXACTLY what visual target to fixate on.
The "Aware" instruction must tell the brain what exists in peripheral vision to maintain spatial context.

Generate the full Quiet Eye conditioning blueprint. Make every gaze instruction feel like a precision instrument — one clear place for the brain to settle at each phase of each corner.`;
    },


    // ============================================================
    //  BLUEPRINT GENERATION — Routes to Claude, Gemini, or Demo
    // ============================================================

    async generateBlueprint(trackConfig, onProgress) {
        // PIPELINE MODE — 4-step deterministic pipeline (preferred)
        if (typeof BlueprintPipeline !== 'undefined' && BlueprintPipeline.isConfigured()) {
            if (onProgress) onProgress(1, 'Using 4-step QE pipeline...');
            return BlueprintPipeline.generateBlueprint(trackConfig, onProgress);
        }

        // LEGACY MODE — single-prompt fallback
        const provider = this.blueprintProvider;

        if (provider === 'claude' && this.claudeApiKey) {
            return this._generateViaClaude(trackConfig, onProgress);
        } else if (provider === 'gemini' && this.geminiApiKey) {
            return this._generateViaGemini(trackConfig, onProgress);
        } else if (this.claudeApiKey) {
            return this._generateViaClaude(trackConfig, onProgress);
        } else if (this.geminiApiKey) {
            return this._generateViaGemini(trackConfig, onProgress);
        } else {
            if (onProgress) onProgress(50, 'No API keys configured — using demo blueprint...');
            const blueprint = this.generateDemoBlueprint(trackConfig);
            if (onProgress) onProgress(100, 'Demo blueprint generated');
            return blueprint;
        }
    },

    /**
     * Focused Claude API call for pipeline steps.
     * Temperature 0 for deterministic output. Lower max_tokens for focused responses.
     */
    async _callClaudePipeline(prompt) {
        if (!this.claudeApiKey) throw new Error('Claude API key required for pipeline mode.');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.claudeApiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: this.claudeModel || 'claude-sonnet-4-5-20250929',
                max_tokens: 2048,
                temperature: 0,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Claude Pipeline Error: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.content?.[0]?.text;
        if (!rawText) throw new Error('Empty response from Claude pipeline step.');
        return rawText;
    },


    // ============================================================
    //  CLAUDE API — The Blueprint Brain
    // ============================================================

    async _generateViaClaude(trackConfig, onProgress) {
        if (onProgress) onProgress(10, 'Building Quiet Eye model...');

        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(trackConfig);

        if (onProgress) onProgress(25, 'Sending to Claude (Blueprint Brain)...');

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.claudeApiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: this.claudeModel,
                    max_tokens: 8192,
                    temperature: 0.7,
                    system: systemPrompt,
                    messages: [{
                        role: 'user',
                        content: userPrompt
                    }]
                })
            });

            if (onProgress) onProgress(60, 'Processing neural pathways...');

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || `Claude API Error: ${response.status}`);
            }

            const data = await response.json();

            if (onProgress) onProgress(80, 'Assembling gaze blueprint...');

            // Extract content from Claude response
            const content = data.content?.[0]?.text;
            if (!content) {
                throw new Error('Empty response from Claude. Please try again.');
            }

            // Claude may wrap JSON in markdown code blocks — strip them
            let jsonStr = content.trim();
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            let blueprint;
            try {
                blueprint = JSON.parse(jsonStr);
            } catch (e) {
                console.error('[AIEngine] Failed to parse Claude response:', jsonStr.substring(0, 200));
                throw new Error('Failed to parse AI response. Please try again.');
            }

            // Add metadata
            blueprint.id = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            blueprint.generatedAt = new Date().toISOString();
            blueprint.trackConfig = trackConfig;
            blueprint.provider = 'claude';

            if (onProgress) onProgress(100, 'Blueprint complete!');

            return blueprint;

        } catch (error) {
            if (error.message.includes('api_key') || error.message.includes('authentication')) {
                throw new Error('Invalid Claude API key. Please check your key in settings.');
            }
            throw error;
        }
    },


    // ============================================================
    //  GEMINI API — Fallback Blueprint Generation
    // ============================================================

    async _generateViaGemini(trackConfig, onProgress) {
        if (onProgress) onProgress(10, 'Building Quiet Eye model...');

        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(trackConfig);

        if (onProgress) onProgress(25, 'Sending to Gemini AI...');

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: [{
                        parts: [{ text: userPrompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json'
                    }
                })
            });

            if (onProgress) onProgress(60, 'Processing neural pathways...');

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || `API Error: ${response.status}`);
            }

            const data = await response.json();

            if (onProgress) onProgress(80, 'Assembling gaze blueprint...');

            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
                throw new Error('Empty response from Gemini. Please try again.');
            }

            let blueprint;
            try {
                blueprint = JSON.parse(content);
            } catch (e) {
                throw new Error('Failed to parse AI response. Please try again.');
            }

            blueprint.id = `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            blueprint.generatedAt = new Date().toISOString();
            blueprint.trackConfig = trackConfig;
            blueprint.provider = 'gemini';

            if (onProgress) onProgress(100, 'Blueprint complete!');

            return blueprint;

        } catch (error) {
            if (error.message.includes('API key') || error.message.includes('API_KEY')) {
                throw new Error('Invalid API key. Please check your Gemini API key in settings.');
            }
            throw error;
        }
    },


    // ============================================================
    //  DEMO MODE — Offline Blueprint Generation (No API Required)
    // ============================================================

    generateDemoBlueprint(trackConfig) {
        const corners = trackConfig.corners.map((corner, i) => {
            const type = corner.type || corner.cornerType || 'sweeper';
            const gazeTemplates = {
                hairpin: {
                    brake: { eyes: 'End of brake marker board', aware: 'Inside kerb appearing in peripheral vision' },
                    apex: { eyes: 'Inside kerb at the tightest point', aware: 'Exit kerb and track-out zone' },
                    exit: { eyes: 'Far end of exit kerb', aware: 'Next straight/braking zone opening up' }
                },
                sweeper: {
                    brake: { eyes: 'Reference point at turn-in (barrier end/sign)', aware: 'Apex kerb coming into view' },
                    apex: { eyes: 'Mid-corner apex point on inside kerb', aware: 'Exit and track-out line widening' },
                    exit: { eyes: 'Exit kerb termination point', aware: 'Full throttle zone and next section' }
                },
                chicane: {
                    brake: { eyes: 'First apex entry reference', aware: 'Second apex in peripheral scan' },
                    apex: { eyes: 'First apex touch point', aware: 'Transition to second apex' },
                    exit: { eyes: 'Second apex exit point', aware: 'Straight opening ahead' }
                },
                esses: {
                    brake: { eyes: 'First turn-in reference point', aware: 'Flow of connected corners' },
                    apex: { eyes: 'Kerb touch point', aware: 'Next direction change' },
                    exit: { eyes: 'Last apex exit point', aware: 'Acceleration zone' }
                },
                offcamber: {
                    brake: { eyes: 'Braking reference (200m board or shadow line)', aware: 'Camber change point' },
                    apex: { eyes: 'Apex — hold gaze LONGER here (QE extended)', aware: 'Grip feedback through peripheral' },
                    exit: { eyes: 'Exit kerb where camber returns', aware: 'Road surface normalization' }
                },
                kink: {
                    brake: { eyes: 'Kink entry reference point', aware: 'Exit visible in peripheral' },
                    apex: { eyes: 'Brief fixation — kink apex kerb', aware: 'Track straightening ahead' },
                    exit: { eyes: 'Vanishing point beyond kink', aware: 'Next braking zone approaching' }
                },
                medium: {
                    brake: { eyes: 'Braking reference marker', aware: 'Apex kerb entering peripheral vision' },
                    apex: { eyes: 'Inside kerb at the tightest point', aware: 'Exit kerb visible in peripheral' },
                    exit: { eyes: 'Exit kerb end point', aware: 'Straight or next corner opening up' }
                },
                straight: {
                    brake: { eyes: 'End of straight — next braking zone', aware: 'Side barriers in peripheral for speed reference' },
                    apex: { eyes: 'Not applicable — maintain far focus', aware: 'Track position and surroundings' },
                    exit: { eyes: 'Next corner approach point', aware: 'Speed building / RPM awareness' }
                }
            };

            const template = gazeTemplates[type] || gazeTemplates.sweeper;
            const speedRamps = {
                hairpin: '25%', sweeper: '50%', chicane: '25%',
                esses: '50%', offcamber: '25%', kink: '100%',
                medium: '50%', straight: '100%'
            };

            return {
                number: i + 1,
                name: corner.name || `Turn ${i + 1}`,
                type: type,
                gazeSequence: template,
                quietEyeCue: `"Settle your eyes on the ${type === 'hairpin' ? 'inside kerb' : 'apex reference'} — let the ${trackConfig.vehicleType} follow."`,
                riskFactors: [
                    'VAN activation from late visual pickup',
                    type === 'hairpin' ? 'Target fixation on outside barrier' : 'Premature gaze shift to exit before apex commitment',
                    'Instrument cluster glance breaking gaze rhythm'
                ],
                speedRamp: speedRamps[type] || '50%',
                lookAndCall: [
                    `"BRAKE!" — as eyes lock on braking reference`,
                    `"APEX!" — as eyes transition to inside kerb`,
                    `"EXIT!" — as eyes snap to track-out point`
                ],
                headRotationCue: `Begin head rotation ${type === 'hairpin' ? '0.8s' : '0.65s'} before turn-in point. Head leads, body follows.`,
                coachingNotes: `${corner.notes || `Standard ${type} approach.`} Key: let your Quiet Eye settle here — don't rush the gaze to the next target. If this corner feels "busy" in your mind, your eyes haven't committed.`
            };
        });

        return {
            id: `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            trackName: trackConfig.trackName,
            clientName: trackConfig.clientName,
            vehicleType: trackConfig.vehicleType,
            skillLevel: trackConfig.skillLevel,
            generatedAt: new Date().toISOString(),
            overallStrategy: `This blueprint programs ${trackConfig.clientName}'s Quiet Eye for ${trackConfig.trackName}. Each corner has one clear gaze target per phase — Brake, Apex, Exit. The goal is NOT to memorize lines. It is to give the brain a place to settle early so the subconscious can execute automatically.`,
            keyPrinciple: `"One place per corner where, if your eyes are calm there, the rest of the corner takes care of itself." Train the DAN to stay locked. Suppress the VAN. Let the ${trackConfig.vehicleType} follow your eyes.`,
            corners: corners,
            provider: 'demo',
            trainingProtocol: {
                dailyMinutes: 15,
                steps: [
                    {
                        title: 'Equipment Setup',
                        instruction: 'Wear Neuphoria headband (if available). Start in a quiet, seated position. This is measurement, not meditation.',
                        duration: '2 min'
                    },
                    {
                        title: 'Full Lap Visualization',
                        instruction: 'Watch the complete lap blueprint video once through at natural pace. Don\'t analyze — just absorb.',
                        duration: '3 min'
                    },
                    {
                        title: 'Corner-by-Corner Training',
                        instruction: 'Work through each corner individually. Pause the video before turn-in. Ask yourself: "Where are my eyes right now?" If the answer isn\'t clear, rewind.',
                        duration: '7 min'
                    },
                    {
                        title: 'Look and Call Drill',
                        instruction: 'Before pressing play again, say the sequence out loud: "Eyes: braking marker" → "Aware: apex". Speech finalizes the decision — the brain stops searching, the eyes commit.',
                        duration: '2 min'
                    },
                    {
                        title: 'Weak Corner Repetition',
                        instruction: 'Identify corners where your Quiet Eye breaks (where you feel "busy" or uncertain). Repeat these 3 times. This is neural reprogramming — 3 reps is the sweet spot.',
                        duration: '1 min'
                    }
                ],
                weakCornerDrills: 'If Quiet Eye breaks somewhere: your brain hasn\'t decided yet, or the target is unclear, or fear is stealing attention. Repeating the same corner builds earlier commitment, strengthens the gaze anchor, and removes hesitation.'
            },
            trackConfig: trackConfig
        };
    }
};
