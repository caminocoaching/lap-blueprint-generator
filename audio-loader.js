/* ============================================================
   AUDIO CUE AUTO-LOADER
   ============================================================
   Automatically loads bundled MP3 voice cues from /audio/ folder.
   Falls back gracefully if files aren't present yet.

   File naming convention:
     full_eyes-braking-marker_aware-apex.mp3    (Laps 1-3)
     aware_apex.mp3                              (Lap 4)
     marker_braking-marker.mp3                   (Lap 5)

   Usage:
     await AudioCueLoader.init();
     const audio = AudioCueLoader.getCue('full_eyesBrake_awareApex');
     if (audio) audio.play();
   ============================================================ */

const AudioCueLoader = {

    // ── Audio file map ──
    // Maps cue IDs (used by conditioning engine) to filenames in /audio/
    CUE_FILES: {
        // Full cues (Laps 1-3): "Eyes [X] — Aware [Y]"
        'full_eyesBrake_awareApex':      'audio/full_eyes-braking-marker_aware-apex.mp3',
        'full_eyesApex_awareExit':       'audio/full_eyes-apex_aware-exit.mp3',
        'full_eyesExit_awareStraight':   'audio/full_eyes-exit_aware-straight.mp3',
        'full_eyesStraight_awareBrake':  'audio/full_eyes-straight_aware-braking-marker.mp3',

        // Conditioning engine phase cues (maps segment types to full cues)
        'eyes_brakeMarker':  'audio/full_eyes-braking-marker_aware-apex.mp3',
        'eyes_apex':         'audio/full_eyes-apex_aware-exit.mp3',
        'eyes_exit':         'audio/full_eyes-exit_aware-straight.mp3',
        'eyes_straight':     'audio/full_eyes-straight_aware-braking-marker.mp3',

        // Awareness cues (Lap 4): "Aware [Y]"
        'aware_apex':           'audio/aware_apex.mp3',
        'aware_exit':           'audio/aware_exit.mp3',
        'aware_straight':       'audio/aware_straight.mp3',
        'aware_brakingMarker':  'audio/aware_braking-marker.mp3',

        // Marker cues (Lap 5): "[X]" only
        'marker_brakingMarker': 'audio/marker_braking-marker.mp3',
        'marker_apex':          'audio/marker_apex.mp3',
        'marker_exit':          'audio/marker_exit.mp3',
        'marker_straight':      'audio/marker_straight.mp3',
    },

    // Loaded Audio elements
    _loaded: {},
    _audioCtx: null,
    _buffers: {},
    _ready: false,

    /**
     * Initialize: attempt to load all bundled MP3 files.
     * Silently skips any that don't exist yet.
     * @returns {number} count of successfully loaded cues
     */
    async init() {
        this._loaded = {};
        this._buffers = {};
        let loadedCount = 0;

        // Try AudioContext for conditioning engine compatibility
        try {
            this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[AudioCueLoader] No AudioContext available');
        }

        const loadPromises = Object.entries(this.CUE_FILES).map(async ([cueId, path]) => {
            try {
                // First check if file exists with a HEAD request
                const headResp = await fetch(path, { method: 'HEAD' });
                if (!headResp.ok) return;

                // Load as Audio element (for direct playback)
                const audio = new Audio(path);
                audio.preload = 'auto';

                // Also load as AudioBuffer (for conditioning engine)
                if (this._audioCtx) {
                    try {
                        const resp = await fetch(path);
                        const arrayBuffer = await resp.arrayBuffer();
                        const audioBuffer = await this._audioCtx.decodeAudioData(arrayBuffer);
                        this._buffers[cueId] = audioBuffer;
                    } catch (e) {
                        // Buffer decode failed — Audio element still works
                    }
                }

                this._loaded[cueId] = audio;
                loadedCount++;
            } catch (e) {
                // File doesn't exist yet — that's fine
            }
        });

        await Promise.all(loadPromises);

        this._ready = true;
        if (loadedCount > 0) {
            console.log(`[AudioCueLoader] ✅ Loaded ${loadedCount} bundled voice cues from /audio/`);
        } else {
            console.log('[AudioCueLoader] No bundled voice cues found in /audio/ — will use TTS fallback');
        }

        return loadedCount;
    },

    /**
     * Get an Audio element for a cue ID.
     * @param {string} cueId
     * @returns {HTMLAudioElement|null}
     */
    getCue(cueId) {
        return this._loaded[cueId] || null;
    },

    /**
     * Get an AudioBuffer for a cue ID (for conditioning engine).
     * @param {string} cueId
     * @returns {AudioBuffer|null}
     */
    getBuffer(cueId) {
        return this._buffers[cueId] || null;
    },

    /**
     * Play a cue by ID. Returns true if played, false if not available.
     * @param {string} cueId
     * @returns {boolean}
     */
    play(cueId) {
        const audio = this._loaded[cueId];
        if (!audio) return false;

        // Clone and play so overlapping calls work
        const clone = audio.cloneNode();
        clone.play().catch(() => {});
        return true;
    },

    /**
     * Check if any bundled cues are loaded.
     * @returns {boolean}
     */
    hasAnyCues() {
        return Object.keys(this._loaded).length > 0;
    },

    /**
     * Get count of loaded cues.
     * @returns {number}
     */
    loadedCount() {
        return Object.keys(this._loaded).length;
    },

    /**
     * Inject loaded AudioBuffers into the conditioning engine's voice cue store.
     * Call this after ConditioningEngine.init() to override IndexedDB cues.
     */
    injectIntoConditioningEngine() {
        if (typeof ConditioningEngine === 'undefined') return;
        if (!ConditioningEngine._voiceCues) return;

        let injected = 0;
        for (const [cueId, buffer] of Object.entries(this._buffers)) {
            if (buffer) {
                ConditioningEngine._voiceCues[cueId] = buffer;
                injected++;
            }
        }

        if (injected > 0) {
            console.log(`[AudioCueLoader] Injected ${injected} audio buffers into conditioning engine`);
        }
    }
};
