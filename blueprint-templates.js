/* ============================================================
   BLUEPRINT TEMPLATES — Vehicle-Specific QE Protocol Database
   ============================================================

   Each template defines the EXACT gaze protocol parameters for
   a vehicle type. Templates are embedded (no fetch needed) and
   versioned for reproducibility. Same template + same input =
   same blueprint every time.

   Supported vehicles: motorcycle, car, kart, formula
   ============================================================ */

const BlueprintTemplates = {

    // ── Current Template Version ─────────────────────────────
    CURRENT_VERSION: '1.0.0',

    // ── Template Registry ────────────────────────────────────
    _templates: {},

    init() {
        this._templates = {
            motorcycle: this._MOTORCYCLE_TEMPLATE,
            car: this._CAR_TEMPLATE,
            kart: this._KART_TEMPLATE,
            formula: this._FORMULA_TEMPLATE
        };
        console.log(`[BlueprintTemplates] Loaded ${Object.keys(this._templates).length} vehicle templates (v${this.CURRENT_VERSION})`);
    },

    /**
     * Get the template for a vehicle type.
     * @param {string} vehicleType — 'motorcycle'|'car'|'kart'|'formula'
     * @returns {object} — the vehicle template
     */
    getTemplate(vehicleType) {
        const template = this._templates[vehicleType] || this._templates.car;
        if (!template) throw new Error(`No template for vehicle type: ${vehicleType}`);
        return template;
    },

    /**
     * Get the template ID string for a vehicle type + version.
     */
    getTemplateId(vehicleType) {
        return `${vehicleType}_v${this.CURRENT_VERSION}`;
    },

    /**
     * Simple checksum for template integrity tracking.
     */
    getTemplateChecksum(template) {
        const str = JSON.stringify(template);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    },

    // ══════════════════════════════════════════════════════════
    //  MOTORCYCLE TEMPLATE
    // ══════════════════════════════════════════════════════════

    _MOTORCYCLE_TEMPLATE: {
        id: 'motorcycle_v1.0.0',
        name: 'Motorcycle Quiet Eye Protocol',
        vehicleType: 'motorcycle',
        version: '1.0.0',

        visualFieldConstraints: {
            peripheralWidth: '160°',
            upperLimit: 'Visor frame restricts upward vision by ~15°',
            sideLimit: 'Visor aperture narrows peripheral by ~20° each side',
            leanEffect: 'At 40° lean, visual horizon tilts 40° — foveal targets shift relative to body',
            summary: 'Visor frame limits peripheral vision. Lean angle tilts the entire visual field. Eyes must lead body lean by 0.8–1.0 seconds.'
        },

        gazePhases: {
            brakeMarkerVisible: {
                minFixationSec: 0.8,
                maxFixationSec: 2.0,
                headLeadTimeSec: [1.0, 1.5],
                peripheralType: 'approach_speed_vestibular',
                eyesHint: 'Eyes FIND the brake marker — the first visual reference that signals this corner is coming (distance board, marshal post, barrier end, shadow line, bridge structure appearing on horizon)',
                awareHint: 'Aware = current speed through wind/vestibular, straight remaining in peripheral, bike settling from previous corner, handlebar vibration feedback',
                vanTriggers: ['late_marker_acquisition', 'distraction_by_other_rider', 'instrument_check_instead_of_marker_search', 'visor_condensation_obscuring_marker'],
                danFix: 'EARLY ACQUISITION — eyes must find the brake marker as EARLY as possible. The earlier the marker enters foveal vision, the calmer the braking decision. Late acquisition triggers VAN panic.'
            },
            brake: {
                minFixationSec: 0.5,
                maxFixationSec: 1.2,
                headLeadTimeSec: [0.8, 1.0],
                peripheralType: 'lean_angle_vestibular',
                eyesHint: 'Eyes lock to BRAKING REFERENCE — a specific visual landmark (distance board, kerb paint change, marshal post, barrier end, shadow line, rumble strip start)',
                awareHint: 'Aware = lean angle buildup sensation through vestibular system, inside kerb geometry appearing in peripheral, apex entrance cues, handlebar angle beginning to change',
                vanTriggers: ['target_fixation_on_obstacle', 'fixating_on_oncoming_rider', 'visor_glare_breaking_fixation', 'looking_down_at_instruments'],
                danFix: 'DAN lock — eyes must lead body repositioning by 0.8s minimum. Commit to braking reference BEFORE the body begins to shift weight.'
            },
            apex: {
                minFixationSec: 0.3,
                maxFixationSec: 0.7,
                headLeadTimeSec: [0, 0],
                peripheralType: 'body_position_grip_feedback',
                eyesHint: 'Eyes fixate APEX KERB TOUCH POINT — a specific visual feature (kerb tooth, color band, painted sausage kerb, grass edge, drain cover)',
                awareHint: 'Aware = maximum lean angle sensation through vestibular, tank edge in lower peripheral, handlebar position, exit kerb appearing in far peripheral',
                vanTriggers: ['looking_down_at_knee_slider', 'gazing_at_oncoming_rider', 'target_fixation_preventing_exit_look', 'surface_change_pulling_eyes_down'],
                danFix: 'Extended QE — hold apex fixation LONGER than instinct says. Novices break apex gaze too early. The kerb edge is the settling point.'
            },
            exit: {
                minFixationSec: 0.4,
                maxFixationSec: 0.9,
                headLeadTimeSec: [0, 0],
                peripheralType: 'throttle_application_next_section',
                eyesHint: 'Eyes SNAP to EXIT TARGET — a specific point beyond the corner (end of exit kerb, barrier opening, tree line, bridge structure, vanishing point of next straight)',
                awareHint: 'Aware = bike straightening sensation through vestibular, throttle hand opening, track-out zone boundary in peripheral, next braking zone appearing',
                vanTriggers: ['fixating_on_gravel_trap', 'staring_at_runoff_area', 'premature_look_to_next_brake_zone', 'looking_back_at_apex'],
                danFix: 'PFTS (Pre-Full-Throttle Saccade) — eyes snap to exit target, throttle hand follows. Commit the saccade BEFORE the throttle opens.'
            },
            nextMarker: {
                minFixationSec: 0.5,
                maxFixationSec: 1.5,
                headLeadTimeSec: [0, 0],
                peripheralType: 'acceleration_vestibular',
                eyesHint: 'Eyes SEARCH for the next corner marker — the first visual reference for the NEXT corner appearing in the distance (next distance board, next kerb line, next marshal post)',
                awareHint: 'Aware = throttle application feedback, bike straightening and accelerating, track opening up, wind building on body',
                vanTriggers: ['celebrating_good_exit', 'looking_back_at_previous_corner', 'distraction_by_other_traffic', 'early_relaxation_before_next_corner'],
                danFix: 'TRANSITION LOCK — the 5-second pause here is for the brain to BREATHE and PRE-LOAD the next corner. Eyes settle on the next reference, DAN pre-commits to the next sequence.'
            }
        },

        peripheralCueTypes: [
            'lean_angle_vestibular',
            'knee_slider_position',
            'tank_edge_in_lower_peripheral',
            'handlebar_angle',
            'throttle_hand_position',
            'wind_pressure_change'
        ],

        systemPromptSection: `MOTORCYCLE-SPECIFIC QE COACHING:
The gaze sequence for motorcycle riders is constrained by:
1. VISOR FRAME — upper and side peripheral vision restricted. Visual targets must be within visor aperture.
2. LEAN ANGLE HORIZON TILT — at 40° lean, the visual horizon tilts 40°. Eyes must LEAD body lean by 0.8–1.0 seconds.
3. BODY COUNTER-STEER — rider's entire body rotates toward apex BEFORE the bike reaches turn-in. Eyes drive this timing.
4. PERIPHERAL = VESTIBULAR — rider doesn't SEE lean angle, they FEEL it through inner ear. "Aware" cues use vestibular feedback, not visual peripheral.
5. HEAD ROTATION IS EXTREME — much more than car. Head rotation leads steering by ~0.75–1.0s.
6. KNEE/TANK/HANDLEBAR — these are the rider's peripheral position cues, not mirrors or steering wheel.

Every "Eyes" instruction must be a SPECIFIC visual feature the fovea locks onto.
Every "Aware" instruction must reference lean sensation, vestibular feedback, tank edge, or handlebar position — NOT just track geometry.`,

        userPromptSection: `VEHICLE: Motorcycle
- Account for visor frame limiting upper/side peripheral vision
- Lean angle at 40° tilts visual horizon 40° — reference points shift relative to rider
- "Aware" targets MUST include vestibular/lean/tank/handlebar references
- Head rotation leads turn-in by 0.8–1.0 seconds (longer than car)
- Exit gaze must snap BEFORE throttle hand opens (PFTS)`,

        validationRules: {
            eyesMinLength: 10,
            awareMinLength: 10,
            awareKeywords: ['lean', 'tank', 'handlebar', 'knee', 'vestibular', 'throttle hand', 'visor', 'wind'],
            awareKeywordRequired: true,
            quietEyeCueVerbs: ['settle', 'lock', 'focus', 'commit', 'fixate', 'snap', 'hold', 'anchor'],
            minRiskFactors: 2,
            validSpeedRamps: ['25%', '50%', '100%']
        },

        speedRampDefaults: {
            hairpin: '25%', tight: '25%', medium: '50%',
            sweeper: '50%', kink: '100%', chicane: '25%',
            esses: '50%', offcamber: '25%', straight: '100%'
        }
    },

    // ══════════════════════════════════════════════════════════
    //  CAR TEMPLATE
    // ══════════════════════════════════════════════════════════

    _CAR_TEMPLATE: {
        id: 'car_v1.0.0',
        name: 'Car Quiet Eye Protocol',
        vehicleType: 'car',
        version: '1.0.0',

        visualFieldConstraints: {
            peripheralWidth: '180°',
            upperLimit: 'Windscreen frame and roof line restrict upward vision',
            sideLimit: 'A-pillars create 20–30° blind spots left and right',
            leanEffect: 'None — body stays upright. Visual field is stable relative to horizon.',
            summary: 'A-pillars create blind spots. Steering wheel in lower visual field. Mirror checks can break gaze rhythm. Visual horizon remains stable.'
        },

        gazePhases: {
            brakeMarkerVisible: {
                minFixationSec: 0.8,
                maxFixationSec: 2.0,
                headLeadTimeSec: [0.6, 1.0],
                peripheralType: 'approach_speed_pedal_feedback',
                eyesHint: 'Eyes FIND the brake marker — the first visual reference that signals this corner is coming (distance board, brake board, marshal post, barrier end, bridge pillar, shadow line)',
                awareHint: 'Aware = throttle foot position, straight remaining in peripheral, A-pillar position relative to approaching corner, steering wheel centred, mirror check completed before marker',
                vanTriggers: ['late_marker_acquisition', 'mirror_check_at_wrong_moment', 'dashboard_glance_during_approach', 'competitor_distraction'],
                danFix: 'EARLY ACQUISITION — eyes find the brake marker as early as possible. The earlier the marker enters foveal vision, the calmer the braking commitment.'
            },
            brake: {
                minFixationSec: 0.6,
                maxFixationSec: 1.3,
                headLeadTimeSec: [0.55, 0.75],
                peripheralType: 'steering_wheel_brake_pressure',
                eyesHint: 'Eyes lock to BRAKING REFERENCE — a specific visual landmark (distance board, marshal post, brake board, barrier end, shadow line, bridge structure)',
                awareHint: 'Aware = apex kerb geometry appearing in peripheral, A-pillar relationship to apex, steering wheel angle starting to build, brake pedal pressure feedback through foot',
                vanTriggers: ['fixating_on_oncoming_car', 'downward_glance_at_instruments', 'mirror_check_breaking_rhythm', 'A_pillar_blind_spot_anxiety'],
                danFix: 'DAN lock — commit eyes EARLY to braking reference to bypass A-pillar blind spot anxiety. The reference point must be selected to avoid A-pillar occlusion.'
            },
            apex: {
                minFixationSec: 0.4,
                maxFixationSec: 0.8,
                headLeadTimeSec: [0, 0],
                peripheralType: 'steering_input_grip_feedback',
                eyesHint: 'Eyes fixate APEX KERB FEATURE — a specific visual point (inside kerb colour, specific kerb tooth, painted marker, grass edge, drain cover)',
                awareHint: 'Aware = maximum steering angle through hands, grip level feedback, exit kerb appearing in peripheral, brake pressure releasing',
                vanTriggers: ['looking_at_steering_wheel', 'glancing_at_dashboard_RPM', 'fixating_on_competitor', 'mirror_check_mid_corner'],
                danFix: 'Hand position awareness — let peripheral vision monitor steering wheel angle, not foveal. Eyes stay on kerb, hands report through touch.'
            },
            exit: {
                minFixationSec: 0.45,
                maxFixationSec: 1.0,
                headLeadTimeSec: [0, 0],
                peripheralType: 'throttle_application_track_out',
                eyesHint: 'Eyes SNAP to EXIT TARGET — a specific point beyond the corner (exit kerb end, barrier opening, bridge, vanishing point of next straight)',
                awareHint: 'Aware = steering wheel returning to neutral, throttle foot opening, track-out zone boundary in peripheral, next straight/braking zone visible',
                vanTriggers: ['fixating_on_gravel_runoff', 'staring_at_competitor_line', 'early_look_to_next_brake', 'mirror_check_on_exit'],
                danFix: 'Throttle commitment — eyes lock exit target BEFORE foot moves to throttle. The saccade commits the decision; the throttle follows.'
            },
            nextMarker: {
                minFixationSec: 0.5,
                maxFixationSec: 1.5,
                headLeadTimeSec: [0, 0],
                peripheralType: 'acceleration_pedal_feedback',
                eyesHint: 'Eyes SEARCH for the next corner marker — the first visual reference for the NEXT corner appearing ahead (next distance board, next kerb line, next marshal post)',
                awareHint: 'Aware = throttle foot fully open, steering wheel returning to centre, car accelerating and straightening, next corner geometry appearing in distance',
                vanTriggers: ['mirror_check_breaking_forward_focus', 'celebrating_good_exit', 'dashboard_glance', 'relaxation_before_next_corner'],
                danFix: 'TRANSITION LOCK — the 5-second pause here is for the brain to BREATHE and PRE-LOAD the next corner sequence. Eyes settle on the next reference, DAN pre-commits.'
            }
        },

        peripheralCueTypes: [
            'steering_wheel_angle',
            'brake_pedal_pressure',
            'throttle_foot_position',
            'dashboard_RPM_peripheral',
            'mirror_positions',
            'A_pillar_relationship'
        ],

        systemPromptSection: `CAR-SPECIFIC QE COACHING:
The gaze sequence for car drivers is constrained by:
1. A-PILLAR BLIND SPOTS — 20–30° dead zones left/right. DAN must COMMIT early to braking reference to bypass blind spot anxiety.
2. WINDSCREEN FRAME — upper vision limited by roof line. Use horizontal references, not overhead features.
3. STEERING WHEEL IN LOWER VISUAL FIELD — peripheral monitors steering angle and pressure through hands. Eyes must NOT drop to steering wheel.
4. MIRROR CHECKS BREAK RHYTHM — suppress mirror impulse during corner execution. Mirrors are for straights only.
5. HEAD ROTATION LESS EXTREME — but still critical. Head leads steering by ~0.65 seconds.
6. PEDAL FEEDBACK — driver uses foot pressure (brake/throttle) as peripheral awareness, not visual confirmation.

Every "Eyes" instruction must be a SPECIFIC visual feature the fovea locks onto.
Every "Aware" instruction must reference steering wheel angle, brake/throttle pedal feedback, or hand grip sensation — NOT just track geometry.`,

        userPromptSection: `VEHICLE: Car
- Account for A-pillar blind spots (20–30° each side) — select braking references that avoid occlusion
- Steering wheel in lower visual field — "Aware" must reference hand/steering/pedal feedback
- Mirror checks must be suppressed during corner execution
- Head rotation leads turn-in by 0.55–0.75 seconds
- Exit gaze locks BEFORE throttle foot moves`,

        validationRules: {
            eyesMinLength: 10,
            awareMinLength: 10,
            awareKeywords: ['steering', 'throttle', 'brake', 'wheel', 'pedal', 'hand', 'grip', 'foot'],
            awareKeywordRequired: true,
            quietEyeCueVerbs: ['settle', 'lock', 'focus', 'commit', 'fixate', 'snap', 'hold', 'anchor'],
            minRiskFactors: 2,
            validSpeedRamps: ['25%', '50%', '100%']
        },

        speedRampDefaults: {
            hairpin: '25%', tight: '25%', medium: '50%',
            sweeper: '50%', kink: '100%', chicane: '25%',
            esses: '50%', offcamber: '25%', straight: '100%'
        }
    },

    // ══════════════════════════════════════════════════════════
    //  KART TEMPLATE (inherits from car with modifications)
    // ══════════════════════════════════════════════════════════

    _KART_TEMPLATE: {
        id: 'kart_v1.0.0',
        name: 'Kart Quiet Eye Protocol',
        vehicleType: 'kart',
        version: '1.0.0',

        visualFieldConstraints: {
            peripheralWidth: '200°+',
            upperLimit: 'No windscreen — full upward vision',
            sideLimit: 'No A-pillars — full lateral vision. Visor if helmeted.',
            leanEffect: 'None — body stays upright. Low seating position changes vertical perspective.',
            summary: 'Wide open visual field (no A-pillars, no windscreen). Very low seating position changes depth perception. Kart responds instantly to steering — gaze timing is extremely tight.'
        },

        gazePhases: {
            brakeMarkerVisible: {
                minFixationSec: 0.5,
                maxFixationSec: 1.5,
                headLeadTimeSec: [0.5, 0.8],
                peripheralType: 'approach_speed_direct',
                eyesHint: 'Eyes FIND the brake marker — visual reference at low eye-height (cone, kerb start, painted line, barrier base appearing ahead)',
                awareHint: 'Aware = speed through wind on body (no windscreen), straight remaining, other karts in wide peripheral field',
                vanTriggers: ['kart_ahead_blocking_marker_view', 'late_marker_pickup', 'distraction_by_close_racing'],
                danFix: 'EARLY ACQUISITION at kart height — markers are lower relative to eye position. Scan ahead early, find the reference before the braking zone.'
            },
            brake: {
                minFixationSec: 0.4,
                maxFixationSec: 1.0,
                headLeadTimeSec: [0.5, 0.7],
                peripheralType: 'steering_direct_connection',
                eyesHint: 'Eyes lock to BRAKING REFERENCE — specific visual landmark at low eye height (kerb edge, cone, painted line, barrier base)',
                awareHint: 'Aware = steering wheel direct in hands (no power steering), apex kerb visible in wide peripheral, other karts in peripheral',
                vanTriggers: ['fixating_on_kart_ahead', 'contact_anxiety', 'looking_down_at_steering_column'],
                danFix: 'Karts respond instantly — gaze must lead by at least 0.5s. Commit early because correction time is zero.'
            },
            apex: {
                minFixationSec: 0.3,
                maxFixationSec: 0.6,
                headLeadTimeSec: [0, 0],
                peripheralType: 'direct_steering_feedback',
                eyesHint: 'Eyes fixate APEX POINT — kerb edge, cone, painted marker at kart eye-height',
                awareHint: 'Aware = steering load through hands (direct feel), exit opening in wide peripheral, other kart positions',
                vanTriggers: ['looking_at_other_karts', 'contact_flinch', 'looking_at_lap_timer'],
                danFix: 'Short fixation window — apex commitment must be immediate. No time for second-guessing.'
            },
            exit: {
                minFixationSec: 0.3,
                maxFixationSec: 0.8,
                headLeadTimeSec: [0, 0],
                peripheralType: 'throttle_and_track_out',
                eyesHint: 'Eyes SNAP to EXIT — track-out point, next corner entrance visible from low position',
                awareHint: 'Aware = throttle application (right foot), steering straightening, track width available, other kart positions',
                vanTriggers: ['checking_kart_behind', 'fixating_on_barrier', 'premature_next_corner_look'],
                danFix: 'Instant throttle response — eyes commit exit, foot follows with zero lag.'
            },
            nextMarker: {
                minFixationSec: 0.4,
                maxFixationSec: 1.0,
                headLeadTimeSec: [0, 0],
                peripheralType: 'acceleration_direct_feedback',
                eyesHint: 'Eyes SEARCH for next corner reference — next cone, kerb start, or track feature visible from low seating position',
                awareHint: 'Aware = throttle response through right foot, kart accelerating, other kart positions in 200°+ peripheral field',
                vanTriggers: ['checking_behind_for_other_karts', 'celebrating_overtake', 'relaxation_on_short_straight'],
                danFix: 'TRANSITION — kart straights are short, so next marker acquisition must be immediate. Pre-load the next corner before the exit is fully complete.'
            }
        },

        peripheralCueTypes: [
            'steering_wheel_direct_feel',
            'throttle_foot_response',
            'brake_foot_pressure',
            'other_kart_positions',
            'wind_speed_feedback'
        ],

        systemPromptSection: `KART-SPECIFIC QE COACHING:
Kart gaze sequences are unique because:
1. WIDE OPEN VISUAL FIELD — no A-pillars, no windscreen. Full peripheral vision available.
2. VERY LOW SEATING — eye height is ~30cm off ground. Visual references are at kerb/ground level.
3. INSTANT STEERING RESPONSE — no power steering, direct mechanical connection. Gaze timing must be tighter.
4. CLOSE RACING — other karts are constantly in peripheral vision. VAN triggers from proximity are HIGH.
5. SHORT LAP TIMES — corner sequences come very fast. Gaze transitions must be rapid and precise.

Every "Eyes" instruction must reference low-height visual targets.
Every "Aware" instruction must reference direct steering feel and other kart awareness.`,

        userPromptSection: `VEHICLE: Kart
- Low seating position — visual references at kerb/ground level
- Wide open visual field (no A-pillars, no windscreen)
- Direct steering connection — gaze timing is tighter (0.5–0.7s lead)
- Close racing proximity — VAN triggers from other karts are high
- "Aware" references direct steering feel and spatial awareness of other karts`,

        validationRules: {
            eyesMinLength: 10,
            awareMinLength: 10,
            awareKeywords: ['steering', 'throttle', 'brake', 'foot', 'hand', 'kart', 'direct', 'feel'],
            awareKeywordRequired: false,
            quietEyeCueVerbs: ['settle', 'lock', 'focus', 'commit', 'fixate', 'snap', 'hold', 'anchor'],
            minRiskFactors: 2,
            validSpeedRamps: ['25%', '50%', '100%']
        },

        speedRampDefaults: {
            hairpin: '25%', tight: '25%', medium: '50%',
            sweeper: '50%', kink: '100%', chicane: '25%',
            esses: '50%', offcamber: '25%', straight: '100%'
        }
    },

    // ══════════════════════════════════════════════════════════
    //  FORMULA / SINGLE-SEATER TEMPLATE
    // ══════════════════════════════════════════════════════════

    _FORMULA_TEMPLATE: {
        id: 'formula_v1.0.0',
        name: 'Formula / Single-Seater Quiet Eye Protocol',
        vehicleType: 'formula',
        version: '1.0.0',

        visualFieldConstraints: {
            peripheralWidth: '160°',
            upperLimit: 'Halo device bisects upper visual field — must look AROUND or THROUGH it',
            sideLimit: 'Cockpit sides restrict lateral vision. Mirrors are small and vibrate.',
            leanEffect: 'None — body stays upright. Very low cockpit position.',
            summary: 'Halo device in upper visual field. Very low cockpit restricts lateral vision. Small vibrating mirrors. Extremely high closing speeds compress gaze timing.'
        },

        gazePhases: {
            brakeMarkerVisible: {
                minFixationSec: 0.6,
                maxFixationSec: 1.8,
                headLeadTimeSec: [0.6, 1.0],
                peripheralType: 'approach_speed_through_halo',
                eyesHint: 'Eyes FIND the brake marker THROUGH the halo — distance board, barrier end, bridge structure appearing on approach. Must confirm visibility around halo bar.',
                awareHint: 'Aware = extreme closing speed through G-force, halo bar position relative to upcoming marker, straight remaining, DRS closure if applicable',
                vanTriggers: ['halo_obscuring_marker', 'closing_speed_panic', 'steering_display_check_on_approach', 'car_ahead_blocking_view'],
                danFix: 'EARLY ACQUISITION through halo — at these speeds, late marker pickup is catastrophic. Eyes must find the reference through or around the halo bar well before the braking zone.'
            },
            brake: {
                minFixationSec: 0.5,
                maxFixationSec: 1.1,
                headLeadTimeSec: [0.55, 0.75],
                peripheralType: 'steering_wheel_telemetry_peripheral',
                eyesHint: 'Eyes lock to BRAKING REFERENCE — distance board, barrier end, bridge structure, marshal post. Must be visible THROUGH or AROUND halo.',
                awareHint: 'Aware = steering wheel with display in lower peripheral, apex geometry appearing, halo bar position relative to corner entry',
                vanTriggers: ['halo_bar_distraction', 'looking_at_steering_display', 'fixating_on_car_ahead', 'closing_speed_anxiety'],
                danFix: 'Halo adaptation — DAN must learn to look THROUGH the halo bar, not at it. Braking reference must be selected to be visible despite halo geometry.'
            },
            apex: {
                minFixationSec: 0.35,
                maxFixationSec: 0.75,
                headLeadTimeSec: [0, 0],
                peripheralType: 'steering_and_g_force_feedback',
                eyesHint: 'Eyes fixate APEX KERB — specific visual point visible from low cockpit position through halo',
                awareHint: 'Aware = G-force loading through seat and harness, steering wheel angle through hands, exit kerb appearing, DRS zone ahead if applicable',
                vanTriggers: ['glancing_at_steering_display', 'delta_time_checking', 'fixating_on_sausage_kerb_danger', 'halo_bar_in_sight_line'],
                danFix: 'G-force awareness replaces visual lean cues — let the body feel the load while eyes stay locked on kerb.'
            },
            exit: {
                minFixationSec: 0.4,
                maxFixationSec: 0.9,
                headLeadTimeSec: [0, 0],
                peripheralType: 'throttle_deployment_and_DRS',
                eyesHint: 'Eyes SNAP to EXIT TARGET — visible from cockpit, through halo, beyond corner (exit kerb end, barrier gap, straight vanishing point)',
                awareHint: 'Aware = throttle mapping through foot, steering wheel returning, G-force reducing, DRS activation zone if applicable',
                vanTriggers: ['checking_small_mirrors', 'fixating_on_barrier', 'looking_at_steering_wheel_display', 'premature_DRS_check'],
                danFix: 'High-speed exit commitment — eyes lock target, throttle mapping follows. No display checks until straight.'
            },
            nextMarker: {
                minFixationSec: 0.4,
                maxFixationSec: 1.2,
                headLeadTimeSec: [0, 0],
                peripheralType: 'acceleration_g_force_DRS',
                eyesHint: 'Eyes SEARCH for next corner reference through halo — next distance board, barrier, or structure appearing at extreme speed',
                awareHint: 'Aware = throttle deployment through foot, G-force building on acceleration, DRS activation zone, car stability',
                vanTriggers: ['steering_display_delta_check', 'mirror_check_at_speed', 'DRS_activation_distraction', 'relaxation_on_straight'],
                danFix: 'TRANSITION at speed — formula straights compress time. Next marker must be acquired immediately. DRS and display checks are VAN traps — eyes stay forward.'
            }
        },

        peripheralCueTypes: [
            'steering_wheel_with_display',
            'G_force_through_harness',
            'throttle_pedal_mapping',
            'brake_pedal_pressure',
            'halo_bar_position',
            'small_mirror_positions'
        ],

        systemPromptSection: `FORMULA/SINGLE-SEATER QE COACHING:
The gaze sequence for single-seater drivers is constrained by:
1. HALO DEVICE — bisects upper visual field. Driver must learn to look THROUGH or AROUND it. Braking references must be selected to avoid halo occlusion.
2. LOW COCKPIT POSITION — very low eye height, similar to kart but with cockpit side walls.
3. STEERING WHEEL DISPLAY — rich telemetry on steering wheel in lower peripheral. HIGH VAN risk of glancing at delta time or mode settings during corners.
4. HIGH CLOSING SPEEDS — gaze timing is compressed. Saccades must be extremely precise.
5. G-FORCE AWARENESS — lateral and longitudinal G-forces provide body feedback that replaces visual lean cues.
6. SMALL VIBRATING MIRRORS — mirror checks are harder than in GT cars. Suppress mirror impulse during corner execution.

Every "Eyes" instruction must specify a target visible THROUGH the halo from low cockpit position.
Every "Aware" instruction must reference G-force feedback, harness loading, or steering wheel tactile feel.`,

        userPromptSection: `VEHICLE: Formula / Single-Seater
- Halo device in upper visual field — braking references must be visible through/around it
- Very low cockpit position with side wall restrictions
- Steering wheel display is a major VAN trigger — suppress display checks in corners
- G-force feedback through harness replaces visual lean cues
- Extremely high closing speeds compress gaze timing windows`,

        validationRules: {
            eyesMinLength: 10,
            awareMinLength: 10,
            awareKeywords: ['steering', 'throttle', 'brake', 'G-force', 'harness', 'pedal', 'hand', 'foot', 'halo'],
            awareKeywordRequired: false,
            quietEyeCueVerbs: ['settle', 'lock', 'focus', 'commit', 'fixate', 'snap', 'hold', 'anchor'],
            minRiskFactors: 2,
            validSpeedRamps: ['25%', '50%', '100%']
        },

        speedRampDefaults: {
            hairpin: '25%', tight: '25%', medium: '50%',
            sweeper: '50%', kink: '100%', chicane: '25%',
            esses: '50%', offcamber: '25%', straight: '100%'
        }
    }
};
