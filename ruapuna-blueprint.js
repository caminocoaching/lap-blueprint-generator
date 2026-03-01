/* ============================================================
   RUAPUNA PARK — Complete Quiet Eye Blueprint (4-Cue Model)
   ============================================================
   Pre-built blueprint data for Ruapuna Park (Euromarque Motorsport Park)
   Christchurch, New Zealand — Counter-clockwise — 3.33km

   THE FOUR CUES (every corner, same language, same sequence):
     Pause 1: "Eyes Braking Marker — Aware Apex"
     Pause 2: "Eyes Apex — Aware Exit"
     Pause 3: "Eyes Exit — Aware Straight"
     Pause 4: "Eyes Straight — Aware Braking Marker"

   7 Sections × 4 Pause Points = 28 Total Pause Points
   ============================================================ */

const RuapunaBlueprint = {

    // ── Track Metadata ──
    trackName: 'Ruapuna Park (Euromarque Motorsport Park)',
    country: 'New Zealand',
    location: 'Christchurch',
    length: '3.33 km',
    direction: 'counter-clockwise',
    totalSections: 7,
    totalPausePoints: 28,

    // ── The Four Cues ──
    CUE_LABELS: [
        'Eyes Braking Marker — Aware Apex',
        'Eyes Apex — Aware Exit',
        'Eyes Exit — Aware Straight',
        'Eyes Straight — Aware Braking Marker'
    ],

    // ── Weak Corners ──
    WEAK_CORNERS: [3, 5, 7],

    // ── Section Data ──
    // Each section has 4 pause cues with EYES and AWARE targets
    sections: [
        {
            number: 1,
            name: 'Section 1',
            direction: 'left',
            type: 'medium',
            severity: 'medium',
            title: '',
            isWeak: false,
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: '200m board, left side',
                    aware: 'Inside kerb at apex'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Inside apex kerb',
                    aware: 'Concrete pad beyond ripple strip'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Concrete pad / ripple strip junction',
                    aware: 'Straight toward Section 2'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Straight ahead',
                    aware: 'Section 2 kink reference loading in peripheral'
                }
            ]
        },
        {
            number: 2,
            name: 'Section 2',
            direction: 'right',
            type: 'sweeper',
            severity: 'fast',
            title: 'Fastest Corner',
            isWeak: false,
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'Kink where straight bends toward turn (left side)',
                    aware: 'Large apex curve on right'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Large apex kerb on right',
                    aware: 'Right-hand exit kerbing'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Right-hand exit kerbing',
                    aware: 'Straight toward Section 3'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Down straight',
                    aware: 'Hairpin brake reference loading in peripheral'
                }
            ]
        },
        {
            number: 3,
            name: 'Section 3',
            direction: 'right',
            type: 'hairpin',
            severity: 'very_tight',
            title: 'Hairpin / Slowest Corner',
            isWeak: true,
            weakReps: 3,
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'Marshal post / track edge reference on right',
                    aware: 'Late apex — 2/3 around inside kerb'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Inside kerb — 2/3 point',
                    aware: 'Track opening beyond hairpin'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Track opening up on exit',
                    aware: 'Straight toward Section 4'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Ahead toward Section 4',
                    aware: 'S-bend white line brake reference loading in peripheral'
                }
            ]
        },
        {
            number: 4,
            name: 'Section 4',
            direction: 'right',  // right then left
            type: 'esses',
            severity: 'medium',
            title: 'S-Bend Complex',
            isWeak: false,
            subSections: ['4a — Right', '4b — Left'],
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'White line on left side of circuit',
                    aware: 'First apex 2/3 around right-hander'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'First apex — 2/3 around right-hand kerbing',
                    aware: 'Second apex (left — Turn 4b)'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Second apex (left) → exit kerb (right)',
                    aware: 'Straight toward Section 5'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Ahead toward Section 5',
                    aware: 'Section 5 mid-track brake reference loading in peripheral'
                }
            ]
        },
        {
            number: 5,
            name: 'Section 5',
            direction: 'left',
            type: 'sweeper',
            severity: 'medium',
            title: 'In-Field Sweeper',
            isWeak: true,
            weakReps: 3,
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'Mid-track reference — straight line braking zone',
                    aware: 'Sweeper apex 2/3 around on left'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Apex — 2/3 around left-hand kerb',
                    aware: 'Exit beyond ripple section'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Exit — beyond ripple strip',
                    aware: 'Section 6 Cochrane approach'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Ahead toward Cochrane complex',
                    aware: 'Section 6 left-side kerbing brake reference loading in peripheral'
                }
            ]
        },
        {
            number: 6,
            name: 'Section 6',
            direction: 'right',  // right then left
            type: 'chicane',
            severity: 'tight',
            title: 'Cochrane Complex',
            isWeak: false,
            subSections: ['6a — Right', '6b — Left (Cochrane)'],
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'Left-side kerbing — brake reference',
                    aware: 'Turn 6a apex kerbing on right'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Turn 6a apex kerbing on right',
                    aware: 'Cochrane (6b) apex on left'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Cochrane apex kerb (left) → exit kerbing',
                    aware: 'Straight toward Section 7'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Ahead toward Section 7',
                    aware: 'Section 7 right-side brake reference loading in peripheral'
                }
            ]
        },
        {
            number: 7,
            name: 'Section 7',
            direction: 'right',
            type: 'sweeper',
            severity: 'medium',
            title: 'Final Sweeper → Main Straight',
            isWeak: true,
            weakReps: 2,
            cues: [
                {
                    pause: 1,
                    label: 'Eyes Braking Marker — Aware Apex',
                    eyes: 'Right-side reference — 2/3 approach marker',
                    aware: 'Apex 2/3 around right-hand sweeper'
                },
                {
                    pause: 2,
                    label: 'Eyes Apex — Aware Exit',
                    eyes: 'Apex — 2/3 around right-hand sweeper',
                    aware: 'Exit — track opening to main straight'
                },
                {
                    pause: 3,
                    label: 'Eyes Exit — Aware Straight',
                    eyes: 'Exit — full width of road, right-hand white line',
                    aware: 'Main straight ahead'
                },
                {
                    pause: 4,
                    label: 'Eyes Straight — Aware Braking Marker',
                    eyes: 'Down main straight',
                    aware: 'Section 1 — 200m board loading in peripheral'
                }
            ]
        }
    ],

    // ── Training Protocol ──
    trainingProtocol: {
        dailyMinutes: 15,
        weeks: [
            { week: 1, speed: 0.5,  pauseDuration: 5, method: 'Watch + listen to cues' },
            { week: 2, speed: 0.75, pauseDuration: 4, method: '"Look and Call" — say cues out loud' },
            { week: 3, speed: 1.0,  pauseDuration: 3, method: 'Audio cues only — no visual overlays' },
            { week: 4, speed: 1.25, pauseDuration: 2, method: 'Audio cues only — gaze sequence is automatic' }
        ],
        weakCornerReps: [
            { section: 3, name: 'Hairpin', reps: 3 },
            { section: 5, name: 'In-Field Sweeper', reps: 3 },
            { section: 7, name: 'Final Sweeper', reps: 2 }
        ],
        lookAndCall: [
            'Eyes Braking Marker — Aware Apex',
            'Eyes Apex — Aware Exit',
            'Eyes Exit — Aware Straight',
            'Eyes Straight — Aware Braking Marker'
        ]
    },

    // ══════════════════════════════════════════════
    //  CONVERSION METHODS
    //  Convert blueprint data into formats the app expects
    // ══════════════════════════════════════════════

    /**
     * Convert sections into the builder.corners format the conditioning engine expects.
     * Each section becomes a corner with 4 gaze phases.
     * @param {number} lapStart — video start time in seconds
     * @param {number} lapEnd — video end time in seconds
     * @returns {Array} corners array for builder.corners
     */
    toCornersArray(lapStart = 0, lapEnd = 90) {
        const lapDuration = lapEnd - lapStart;
        const sectionDuration = lapDuration / this.sections.length;

        return this.sections.map((sec, idx) => {
            // Estimate timestamps based on even distribution
            // These will be overridden by actual video analysis when available
            const sectionStart = lapStart + idx * sectionDuration;
            const brakeTime = sectionStart + sectionDuration * 0.1;
            const apexTime = sectionStart + sectionDuration * 0.4;
            const exitTime = sectionStart + sectionDuration * 0.7;
            const nextMarkerTime = sectionStart + sectionDuration * 0.9;

            return {
                number: sec.number,
                name: sec.name + (sec.title ? ` (${sec.title})` : ''),
                direction: sec.direction,
                cornerType: sec.type,
                type: sec.type,
                severity: sec.severity,
                isWeak: sec.isWeak,
                weakReps: sec.weakReps || 0,

                // Timestamps (estimated — real ones come from video analysis)
                brakeMarkerVisible: sectionStart,
                brakeTime: brakeTime,
                apexTime: apexTime,
                exitTime: exitTime,
                nextMarkerVisible: nextMarkerTime,
                timestamps: {
                    brakeMarkerVisible: sectionStart,
                    entry: brakeTime,
                    apex: apexTime,
                    exit: exitTime,
                    nextMarkerVisible: nextMarkerTime
                },

                // The 4-cue gaze data — this is the core QE protocol
                gazeSequence: {
                    brakeMarkerVisible: {
                        eyes: sec.cues[0].eyes,
                        aware: sec.cues[0].aware,
                        cueLabel: sec.cues[0].label
                    },
                    brake: {
                        eyes: sec.cues[1].eyes,
                        aware: sec.cues[1].aware,
                        cueLabel: sec.cues[1].label
                    },
                    apex: {  // "Eyes Exit — Aware Straight" maps to apex→exit transition
                        eyes: sec.cues[2].eyes,
                        aware: sec.cues[2].aware,
                        cueLabel: sec.cues[2].label
                    },
                    exit: {
                        eyes: sec.cues[2].eyes,
                        aware: sec.cues[2].aware,
                        cueLabel: sec.cues[2].label
                    },
                    nextMarker: {
                        eyes: sec.cues[3].eyes,
                        aware: sec.cues[3].aware,
                        cueLabel: sec.cues[3].label
                    }
                },

                // Visual references for conditioning engine overlay
                visualReferences: {
                    brakingReference: sec.cues[0].eyes,
                    apexFixation: sec.cues[1].eyes,
                    exitTarget: sec.cues[2].eyes,
                    peripheralCues: sec.cues[3].aware
                },

                // Pause cue text for voice and overlay
                pauseCues: sec.cues.map(cue => ({
                    label: cue.label,
                    eyes: cue.eyes,
                    aware: cue.aware,
                    voiceCue: `Eyes: ${cue.eyes.split(',')[0]}. Aware: ${cue.aware.split(',')[0].split('—')[0].trim()}`
                })),

                confidence: 1.0,
                source: 'ruapuna_blueprint'
            };
        });
    },

    /**
     * Convert to the full blueprint format that the player/renderer expects.
     * @param {string} vehicleType — 'motorcycle'|'car'|'kart'|'formula'
     * @param {number} lapStart — video start time
     * @param {number} lapEnd — video end time
     * @returns {Object} complete blueprint object
     */
    toBlueprint(vehicleType = 'car', lapStart = 0, lapEnd = 90) {
        const corners = this.toCornersArray(lapStart, lapEnd);

        return {
            id: 'ruapuna_qe_blueprint_v2',
            trackName: this.trackName,
            vehicleType: vehicleType,
            provider: 'ruapuna_preset',
            overallStrategy: 'Four-cue Quiet Eye protocol: Every corner follows the same sequence — Eyes Braking Marker → Aware Apex → Eyes Apex → Aware Exit → Eyes Exit → Aware Straight → Eyes Straight → Aware Next Braking Marker. The consistency of the language trains automatic gaze transitions. The brain stops searching because it already knows the next target.',
            keyPrinciple: 'Same language. Same sequence. Automatic. The 4 cues become a rhythm — when the eyes know where to go next, the brain enters flow state. DAN stays locked, VAN never fires.',
            corners: corners.map((c, i) => ({
                number: c.number,
                name: c.name,
                direction: c.direction,
                cornerType: c.type,
                severity: c.severity,
                qeDifficulty: c.isWeak ? 'high' : 'medium',
                primaryVanTrigger: c.isWeak ? 'uncertainty_breaks_gaze_sequence' : 'none',
                gazeDominanceRecommendation: 'DAN_locked',
                gazeSequence: c.gazeSequence,
                quietEyeCue: `Eyes: ${c.pauseCues[0].eyes}. Aware: ${c.pauseCues[0].aware}.`,
                isWeak: c.isWeak,
                riskFactors: c.isWeak ? [
                    'Uncertainty in visual target breaks QE sequence',
                    'Late gaze acquisition triggers VAN',
                    'Requires extra repetitions in training'
                ] : []
            })),
            trainingProtocol: {
                dailyMinutes: this.trainingProtocol.dailyMinutes,
                steps: [
                    {
                        title: 'Watch + Listen (Week 1)',
                        instruction: 'Play the conditioning video at 0.5x speed with 5-second pauses. Let the eyes absorb the sequence. No action required — just watch and listen to the cues.',
                        duration: '5 min'
                    },
                    {
                        title: 'Look and Call (Week 2)',
                        instruction: 'Say each cue out loud at every pause: "Eyes Braking Marker — Aware Apex", "Eyes Apex — Aware Exit", "Eyes Exit — Aware Straight", "Eyes Straight — Aware Braking Marker". Speech commits the brain — the gaze anchor becomes automatic.',
                        duration: '5 min'
                    },
                    {
                        title: 'Audio Only (Week 3)',
                        instruction: 'Turn off visual overlays. Listen to audio cues only. Your eyes should already know where to go. If they don\'t — rewind and repeat that corner 3 times.',
                        duration: '3 min'
                    },
                    {
                        title: 'Full Speed (Week 4)',
                        instruction: 'Play at 1.25x with 2-second pauses. Audio cues only. The gaze sequence should be automatic. If you need to think about where to look — that corner needs more reps.',
                        duration: '2 min'
                    },
                    {
                        title: 'Weak Corner Repetition',
                        instruction: 'Section 3 (Hairpin) × 3, Section 5 (In-Field Sweeper) × 3, Section 7 (Final Sweeper) × 2. These corners have the highest VAN risk — the brain hasn\'t fully committed the gaze anchor yet.',
                        duration: '5 min'
                    }
                ],
                weakCornerDrills: 'If Quiet Eye breaks at any corner: your brain hasn\'t decided yet, or the target is unclear, or fear is stealing attention. Repeat that corner 3 times. The repetition builds earlier commitment, strengthens the gaze anchor, and removes hesitation.'
            },
            _source: 'ruapuna_4cue_blueprint',
            _version: '2.0',
            _createdAt: new Date().toISOString()
        };
    },

    /**
     * Convert sections to the conditioning engine's segment format.
     * Uses the 4-cue model: each section gets 4 segments with pause points.
     * @param {number} lapStart
     * @param {number} lapEnd
     * @returns {Array} segments for ConditioningEngine
     */
    toConditioningSegments(lapStart = 0, lapEnd = 90) {
        const corners = this.toCornersArray(lapStart, lapEnd);
        // The conditioning engine builds its own segments from corners
        // Just return the corners in the right format
        return corners;
    },

    /**
     * Check if a track name matches Ruapuna.
     * @param {string} trackName
     * @returns {boolean}
     */
    isRuapuna(trackName) {
        if (!trackName) return false;
        const name = trackName.toLowerCase();
        return name.includes('ruapuna') ||
               name.includes('euromarque') ||
               (name.includes('christchurch') && name.includes('motorsport'));
    },

    /**
     * Get the voice cue text for a specific section and pause number.
     * @param {number} sectionNum — 1-7
     * @param {number} pauseNum — 1-4
     * @returns {string} voice cue text
     */
    getVoiceCue(sectionNum, pauseNum) {
        const section = this.sections.find(s => s.number === sectionNum);
        if (!section) return '';
        const cue = section.cues[pauseNum - 1];
        if (!cue) return '';
        return `Eyes: ${cue.eyes}. Aware: ${cue.aware}.`;
    },

    /**
     * Get the overlay text for conditioning video.
     * @param {number} sectionNum — 1-7
     * @param {number} pauseNum — 1-4
     * @returns {Object} { eyes, aware, label }
     */
    getOverlayText(sectionNum, pauseNum) {
        const section = this.sections.find(s => s.number === sectionNum);
        if (!section) return { eyes: '', aware: '', label: '' };
        const cue = section.cues[pauseNum - 1];
        if (!cue) return { eyes: '', aware: '', label: '' };
        return {
            eyes: cue.eyes,
            aware: cue.aware,
            label: cue.label
        };
    }
};
