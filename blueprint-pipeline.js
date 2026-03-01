/* ============================================================
   BLUEPRINT PIPELINE — 4-Step Deterministic Blueprint Engine
   ============================================================
   Generates QE blueprints through 4 focused API calls, each
   validated before proceeding. Temperature 0 for exact
   reproducibility. Vehicle template injected at every step.

   PROMPT SOURCE PRIORITY:
   1. Airtable (live fetch) — if configured and reachable
   2. Hardcoded fallback    — built-in prompts below

   Steps:
   1. CLASSIFY — corner type + QE difficulty + VAN trigger
   2. GAZE SEQUENCE — Eyes/Aware for brake→apex→exit
   3. RISK ANALYSIS — VAN triggers + quietEyeCue + coaching
   4. PROTOCOL ASSEMBLY — strategy, lookAndCall, head rotation

   Steps 1–3 run per corner. Step 4 runs once for the lap.
   ============================================================ */

const BlueprintPipeline = {

    // Cached Airtable prompts for this generation run
    _airtablePrompts: null,

    /**
     * Main entry point — generates a full blueprint through the 4-step pipeline.
     * @param {object} trackConfig — { trackName, clientName, vehicleType, skillLevel, trackNotes, corners }
     * @param {function} onProgress — (percent, message) callback
     * @returns {object} — complete blueprint JSON
     */
    async generateBlueprint(trackConfig, onProgress) {
        // 1. Load vehicle template
        const template = BlueprintTemplates.getTemplate(trackConfig.vehicleType);
        const templateId = BlueprintTemplates.getTemplateId(trackConfig.vehicleType);
        const totalCorners = trackConfig.corners.length;

        if (onProgress) onProgress(2, `Loaded ${template.name} template`);

        // 2. Try to fetch Airtable prompts (non-blocking — falls back to hardcoded)
        this._airtablePrompts = null;
        if (typeof AirtablePrompts !== 'undefined' && AirtablePrompts.isConfigured()) {
            try {
                if (onProgress) onProgress(3, 'Fetching prompts from Airtable...');
                this._airtablePrompts = await AirtablePrompts.fetchPrompts(trackConfig.vehicleType);
                if (this._airtablePrompts) {
                    const stepCount = Object.keys(this._airtablePrompts).length;
                    console.log(`[Pipeline] Using ${stepCount} Airtable prompts`);
                    if (onProgress) onProgress(4, `Loaded ${stepCount} prompts from Airtable`);
                }
            } catch (err) {
                console.warn('[Pipeline] Airtable fetch failed, using hardcoded prompts:', err.message);
                this._airtablePrompts = null;
            }
        }

        // 3. Process each corner through Steps 1–3
        const processedCorners = [];
        for (let i = 0; i < totalCorners; i++) {
            const corner = trackConfig.corners[i];
            const cornerLabel = corner.name || `Turn ${i + 1}`;
            const basePercent = 5 + Math.floor((i / totalCorners) * 70);

            // Step 1: Classify
            if (onProgress) onProgress(basePercent, `Step 1/4 — Classifying ${cornerLabel}...`);
            const classified = await this._step1_classify(corner, template, trackConfig);

            // Step 2: Gaze Sequence
            if (onProgress) onProgress(basePercent + 8, `Step 2/4 — Gaze sequence for ${cornerLabel}...`);
            const gazeData = await this._step2_gazeSequence(classified, template, trackConfig);

            // Step 3: Risk Analysis
            if (onProgress) onProgress(basePercent + 16, `Step 3/4 — Risk analysis for ${cornerLabel}...`);
            const riskData = await this._step3_riskAnalysis(classified, gazeData, template, trackConfig);

            // Merge all step outputs into one corner object
            processedCorners.push({
                number: corner.number || (i + 1),
                name: classified.name || cornerLabel,
                type: classified.type || corner.type || 'medium',
                direction: corner.direction || classified.direction || 'unknown',
                severity: classified.severity || corner.severity || 'medium',
                qeDifficulty: classified.qeDifficulty,
                primaryVanTrigger: classified.primaryVanTrigger,
                gazeSequence: gazeData.gazeSequence,
                riskFactors: riskData.riskFactors,
                quietEyeCue: riskData.quietEyeCue,
                coachingNotes: riskData.coachingNotes,
                // Pass through existing data
                approach: corner.approach,
                exitTo: corner.exitTo,
                elevation: corner.elevation,
                camber: corner.camber
            });
        }

        // Step 4: Protocol Assembly (all corners at once)
        if (onProgress) onProgress(80, 'Step 4/4 — Assembling training protocol...');
        const protocol = await this._step4_protocol(processedCorners, template, trackConfig);

        // Merge protocol data into corners
        if (protocol.corners) {
            for (const pc of protocol.corners) {
                const target = processedCorners.find(c => c.number === pc.number);
                if (target) {
                    target.lookAndCall = pc.lookAndCall;
                    target.headRotationCue = pc.headRotationCue;
                    target.speedRamp = pc.speedRamp;
                }
            }
        }

        // Build final blueprint
        const promptSource = this._airtablePrompts ? 'airtable' : 'hardcoded';
        const blueprint = {
            id: `bp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            trackName: trackConfig.trackName,
            clientName: trackConfig.clientName,
            vehicleType: trackConfig.vehicleType,
            skillLevel: trackConfig.skillLevel,
            generatedAt: new Date().toISOString(),
            templateId: templateId,
            templateVersion: template.version,
            templateChecksum: BlueprintTemplates.getTemplateChecksum(template),
            provider: 'claude_pipeline',
            promptSource: promptSource,
            overallStrategy: protocol.overallStrategy,
            keyPrinciple: protocol.keyPrinciple,
            corners: processedCorners,
            trainingProtocol: protocol.trainingProtocol || {
                dailyMinutes: 15,
                steps: [],
                weakCornerDrills: ''
            }
        };

        if (onProgress) onProgress(100, `Blueprint complete (prompts: ${promptSource})`);
        return blueprint;
    },

    // ── Prompt Builder Helper ────────────────────────────────

    /**
     * Try to build a prompt from Airtable, fall back to hardcoded.
     * @param {string} stepName — classify | gazeSequence | riskAnalysis | protocol
     * @param {object} values — placeholder values for Airtable template
     * @param {string} hardcodedPrompt — fallback prompt
     * @returns {string} — the final prompt to send to Claude
     */
    _getPrompt(stepName, values, hardcodedPrompt) {
        if (this._airtablePrompts && this._airtablePrompts[stepName]) {
            const airtablePrompt = AirtablePrompts.buildPrompt(this._airtablePrompts[stepName], values);
            if (airtablePrompt) {
                console.log(`[Pipeline] ${stepName}: using Airtable prompt (v${this._airtablePrompts[stepName].version})`);
                return airtablePrompt;
            }
        }
        return hardcodedPrompt;
    },

    // ── Step 1: Corner Classification ─────────────────────────

    async _step1_classify(corner, template, trackConfig) {
        const cornerJSON = JSON.stringify({
            number: corner.number,
            name: corner.name,
            type: corner.type,
            direction: corner.direction,
            severity: corner.severity,
            approach: corner.approach,
            exitTo: corner.exitTo,
            elevation: corner.elevation,
            camber: corner.camber,
            gazeTargets: corner.gazeTargets,
            kerbDescription: corner.kerbDescription,
            visualChallenge: corner.visualChallenge,
            danVanNotes: corner.danVanNotes
        }, null, 2);

        const hardcoded = `You are the Quiet Eye Blueprint Engine — a corner classification specialist based on two scientific principles:

PRINCIPLE 1 — QUIET EYE (Joan Vickers): The final fixation on a target before a critical movement. Elite performers hold this fixation 62% longer than novices. Training eyes to lock onto the correct target improves motor performance automatically.

PRINCIPLE 2 — FLOW STATE AWARENESS (200ms Lead): In flow, awareness operates 200ms ahead of reality. The "Eyes → Aware" protocol trains this: EYES on current target (now), AWARE holds next target in peripheral (200ms ahead). When automatic, the driver is in flow.

THE FOUR CUES — same language, every corner, no exceptions:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"

TRACK: ${trackConfig.trackName}
VEHICLE: ${template.vehicleType}
SKILL LEVEL: ${trackConfig.skillLevel}

${template.systemPromptSection}

CORNER DATA:
${cornerJSON}

TRACK CONTEXT:
${trackConfig.trackNotes || 'No additional context.'}

CLASSIFY this corner for Quiet Eye protocol design. Consider:
- Where is the gap between visual targets longest? (harder QE)
- Where are targets hardest to see? (unclear markers = VAN trigger)
- Where is the transition from one cue to the next most complex?

CRITICAL RULES:
- This is ONLY about where the eyes look and where awareness sits
- NEVER include driving technique, braking advice, throttle guidance
- Describe visual targets as physical objects: "red/white inside kerb", "200m board on left"

RESPOND IN VALID JSON ONLY:
{
  "cornerNumber": ${corner.number || 1},
  "name": "${corner.name || 'Turn'}",
  "type": "hairpin|tight|sweeper|kink|chicane|esses|offcamber|straight|medium",
  "direction": "${corner.direction || 'unknown'}",
  "severity": "very_tight|tight|medium|fast|flat_out",
  "qeDifficulty": "trivial|simple|moderate|challenging|expert",
  "primaryVanTrigger": "target_fixation|early_apex_look|peripheral_threat|instrument_glance|unexpected_threat",
  "gazeDominanceRecommendation": "early_commitment|extended_fixation|rapid_transition",
  "classificationReasoning": "string — 1-2 sentences explaining the QE challenge of this corner"
}`;

        // Airtable placeholder values
        const values = {
            TRACK_NAME: trackConfig.trackName,
            VEHICLE_TYPE: template.vehicleType,
            SKILL_LEVEL: trackConfig.skillLevel,
            SYSTEM_PROMPT: template.systemPromptSection,
            CORNER_JSON: cornerJSON,
            CORNER_NAME: corner.name || 'Turn',
            CORNER_DIRECTION: corner.direction || 'unknown',
            CORNER_NUMBER: String(corner.number || 1),
            TRACK_NOTES: trackConfig.trackNotes || 'No additional context.'
        };

        const prompt = this._getPrompt('classify', values, hardcoded);
        return await this._callWithRetry(prompt, 'classification', template);
    },

    // ── Step 2: Gaze Sequence Generation ──────────────────────

    async _step2_gazeSequence(classified, template, trackConfig) {
        const phaseSpecs = Object.entries(template.gazePhases).map(([phase, spec]) =>
            `${phase.toUpperCase()}:
  Fixation: ${spec.minFixationSec}s–${spec.maxFixationSec}s
  Eyes hint: ${spec.eyesHint}
  Aware hint: ${spec.awareHint}
  DAN fix: ${spec.danFix}`
        ).join('\n\n');

        const visualLandmarks = classified.gazeTargets
            ? JSON.stringify(classified.gazeTargets, null, 2)
            : 'No specific visual data — use corner type defaults.';
        const kerbInfo = classified.kerbDescription
            ? 'KERB: ' + JSON.stringify(classified.kerbDescription, null, 2)
            : '';
        const visualChallenge = classified.visualChallenge || '';
        const danVanNotes = classified.danVanNotes || '';
        const peripheralExamples = template.vehicleType === 'motorcycle'
            ? 'lean angle, tank edge, handlebar, vestibular'
            : 'steering wheel, brake pedal, throttle, hand grip';

        const hardcoded = `You are the Quiet Eye Blueprint Engine — a gaze sequence engineer based on two scientific principles:

PRINCIPLE 1 — QUIET EYE (Joan Vickers): The final fixation on a target before a critical movement. Elite performers hold this fixation 62% longer than novices.

PRINCIPLE 2 — FLOW STATE AWARENESS (200ms Lead): EYES are on the current target (now), AWARE holds the next target in peripheral vision (200ms ahead). When this becomes automatic, the driver is in flow.

THE FOUR CUES — same language, every corner, no exceptions:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"

TRACK: ${trackConfig.trackName}
CORNER: ${classified.name} (${classified.direction} ${classified.type}, QE difficulty: ${classified.qeDifficulty})
VEHICLE: ${template.vehicleType}
PRIMARY VAN TRIGGER: ${classified.primaryVanTrigger}
GAZE DOMINANCE: ${classified.gazeDominanceRecommendation}

${template.systemPromptSection}

VISUAL LANDMARK DATA FOR THIS CORNER:
${visualLandmarks}
${kerbInfo}
${visualChallenge ? 'VISUAL CHALLENGE: ' + visualChallenge : ''}
${danVanNotes ? 'DAN/VAN NOTES: ' + danVanNotes : ''}

GAZE PHASE SPECIFICATIONS:
${phaseSpecs}

FOR THIS CORNER, generate the gaze sequence for all four pause points. Each "eyes" target must be a PHYSICAL OBJECT the driver can fixate on: "red/white inside kerb", "200m board on left", "concrete pad on right". NEVER use abstract concepts like "the braking zone" or "the racing line."

The AWARE target is always the NEXT thing in the sequence — this trains the brain to process ahead of reality (the mechanism of flow).

If video and map data conflict on a visual target, prefer the video data (what the driver actually sees). The map fills gaps where video is unclear.

CRITICAL RULES:
1. "eyes" = SPECIFIC physical feature (kerb colour, board number, landmark). Never generic.
2. "aware" = VEHICLE-SPECIFIC peripheral cue (${peripheralExamples}) + next visual target.
3. Each instruction = ONE clear place for the brain to settle.
4. NEVER include driving technique, braking advice, throttle guidance, body position

RESPOND IN VALID JSON ONLY:
{
  "cornerNumber": ${classified.cornerNumber || classified.number},
  "gazeSequence": {
    "brakeMarkerVisible": {
      "eyes": "the PHYSICAL braking reference visible on approach — board, post, kerb start, barrier",
      "aware": "apex zone in peripheral + vehicle-specific awareness (speed, straight remaining)",
      "fixationDurationSeconds": number,
      "cueLabel": "Eyes Braking Marker — Aware Apex"
    },
    "brake": {
      "eyes": "the PHYSICAL apex reference now visible — inside kerb, grass edge, paint marking",
      "aware": "exit zone visible in peripheral + vehicle-specific awareness",
      "fixationDurationSeconds": number,
      "cueLabel": "Eyes Apex — Aware Exit"
    },
    "apex": {
      "eyes": "the PHYSICAL exit reference — exit kerb, track widening, concrete pad",
      "aware": "straight road opening up in peripheral",
      "fixationDurationSeconds": number,
      "cueLabel": "Eyes Exit — Aware Straight"
    },
    "exit": {
      "eyes": "straight road ahead — the PHYSICAL road surface visible",
      "aware": "next corner's braking marker beginning to appear in distance",
      "fixationDurationSeconds": number,
      "cueLabel": "Eyes Straight — Aware Braking Marker"
    },
    "nextMarker": {
      "eyes": "next corner's braking reference now visible in the distance",
      "aware": "vehicle-specific peripheral awareness during acceleration/transition",
      "fixationDurationSeconds": number,
      "cueLabel": "Eyes Straight — Aware Braking Marker"
    }
  }
}`;

        const values = {
            TRACK_NAME: trackConfig.trackName,
            CORNER_NAME: classified.name,
            CORNER_DIRECTION: classified.direction,
            CORNER_TYPE: classified.type,
            CORNER_NUMBER: String(classified.cornerNumber || classified.number),
            VEHICLE_TYPE: template.vehicleType,
            QE_DIFFICULTY: classified.qeDifficulty,
            VAN_TRIGGER: classified.primaryVanTrigger,
            GAZE_DOMINANCE: classified.gazeDominanceRecommendation,
            SYSTEM_PROMPT: template.systemPromptSection,
            VISUAL_LANDMARKS: visualLandmarks + (kerbInfo ? '\n' + kerbInfo : ''),
            VISUAL_CHALLENGE: visualChallenge,
            DAN_VAN_NOTES: danVanNotes,
            GAZE_PHASES: phaseSpecs
        };

        const prompt = this._getPrompt('gazeSequence', values, hardcoded);
        return await this._callWithRetry(prompt, 'gazeSequence', template);
    },

    // ── Step 3: Risk Analysis ─────────────────────────────────

    async _step3_riskAnalysis(classified, gazeData, template, trackConfig) {
        const gazeJSON = JSON.stringify(gazeData.gazeSequence, null, 2);
        const vanTriggersList = Object.entries(template.gazePhases).map(([phase, spec]) =>
            `${phase}: ${spec.vanTriggers.join(', ')}`
        ).join('\n');

        const hardcoded = `You are the Quiet Eye Blueprint Engine — a risk analyst specialising in VAN (Ventral Attention Network) suppression.

THE FOUR CUES — same language, every corner, no exceptions:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"

The brain's Quiet Eye can break at any of these four transitions. When it breaks: the brain hasn't decided yet, or the target is unclear, or fear is stealing attention. Your job is to identify WHERE in the 4-cue sequence this corner is most likely to fail.

TRACK: ${trackConfig.trackName}
CORNER: ${classified.name} (${classified.direction} ${classified.type})
VEHICLE: ${template.vehicleType}
QE DIFFICULTY: ${classified.qeDifficulty}
PRIMARY VAN TRIGGER: ${classified.primaryVanTrigger}

GAZE SEQUENCE (just generated for this corner):
${gazeJSON}

VISUAL CONTEXT:
${classified.visualChallenge || 'No specific visual challenge noted.'}
${classified.danVanNotes || ''}

KNOWN VAN TRIGGERS FOR ${template.vehicleType.toUpperCase()}:
${vanTriggersList}

WEAK CORNER FLAGS — identify if this corner meets any of these criteria:
- Gap between visual targets is longest (eyes have nowhere clear to go)
- Targets are hardest to see (unclear markers, late acquisition)
- Transition from one cue to the next is most complex
- If Quiet Eye breaks here: the brain hasn't decided, the target is unclear, or fear is stealing attention

Generate risk analysis. The quietEyeCue must be:
- One powerful sentence the driver/rider says internally
- Contains an ACTION VERB (settle, lock, commit, fixate, snap, hold, anchor)
- References the SPECIFIC physical target from the gaze sequence above
- Ends with vehicle-specific follow-through (e.g. "let the ${template.vehicleType} follow")
- NEVER includes technique advice — only gaze targets

RESPOND IN VALID JSON ONLY:
{
  "cornerNumber": ${classified.cornerNumber || classified.number},
  "riskFactors": [
    "specific risk 1 — which cue transition is vulnerable",
    "specific risk 2 — what physical target is unclear",
    "specific risk 3 — what triggers VAN at this corner"
  ],
  "isWeakCorner": true/false,
  "weakCornerReason": "string — why this corner needs extra repetitions, or empty",
  "quietEyeCue": "Settle your eyes on [specific physical target] — let the ${template.vehicleType} follow.",
  "coachingNotes": "2-3 sentences. ONLY about gaze targets and awareness. Never technique."
}`;

        const values = {
            TRACK_NAME: trackConfig.trackName,
            CORNER_NAME: classified.name,
            CORNER_DIRECTION: classified.direction,
            CORNER_TYPE: classified.type,
            CORNER_NUMBER: String(classified.cornerNumber || classified.number),
            VEHICLE_TYPE: template.vehicleType,
            QE_DIFFICULTY: classified.qeDifficulty,
            VAN_TRIGGER: classified.primaryVanTrigger,
            GAZE_SEQUENCE_JSON: gazeJSON,
            VISUAL_CHALLENGE: classified.visualChallenge || 'No specific visual challenge noted.',
            DAN_VAN_NOTES: classified.danVanNotes || '',
            VAN_TRIGGERS_LIST: vanTriggersList
        };

        const prompt = this._getPrompt('riskAnalysis', values, hardcoded);
        return await this._callWithRetry(prompt, 'riskAnalysis', template);
    },

    // ── Step 4: Training Protocol Assembly ────────────────────

    async _step4_protocol(allCorners, template, trackConfig) {
        const cornerSummary = allCorners.map(c =>
            `Corner ${c.number}: "${c.name}" — ${c.direction} ${c.type} (QE: ${c.qeDifficulty}, VAN: ${c.primaryVanTrigger})`
        ).join('\n');

        const headLeadTime = template.vehicleType === 'motorcycle' ? '0.8–1.0s' : '0.55–0.75s';

        const hardcoded = `You are the Quiet Eye Blueprint Engine — a training protocol designer based on two scientific principles:

PRINCIPLE 1 — QUIET EYE (Joan Vickers): The final fixation on a target before a critical movement. Elite performers hold this fixation 62% longer. Training builds this automatically.

PRINCIPLE 2 — FLOW STATE AWARENESS (200ms Lead): EYES on current target, AWARE holds next target in peripheral. When automatic, the brain enters flow state. DAN stays locked, VAN never fires.

THE FOUR CUES — same language, every corner, no exceptions:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"

The repetition IS the conditioning. The consistency of the language trains automatic gaze transitions. The brain stops searching because it already knows the next target.

TRACK: ${trackConfig.trackName}
VEHICLE: ${template.vehicleType}
SKILL LEVEL: ${trackConfig.skillLevel}
CLIENT: ${trackConfig.clientName || 'Driver'}

${template.systemPromptSection}

ALL CORNERS (classified and with gaze sequences):
${cornerSummary}

SPEED RAMP DEFAULTS FOR ${template.vehicleType.toUpperCase()}:
${JSON.stringify(template.speedRampDefaults, null, 2)}

GENERATE the complete training protocol using this exact 4-week progression:

TRAINING PROTOCOL:
- Week 1: 0.5x speed, 5-second pauses, watch + listen. Let the eyes absorb the sequence. No action required.
- Week 2: 0.75x speed, 4-second pauses, "Look and Call" — say each cue out loud at every pause. Speech commits the brain.
- Week 3: 1.0x speed, 3-second pauses, audio cues only. Eyes should already know where to go.
- Week 4: 1.25x speed, 2-second pauses, audio cues only. Gaze sequence is automatic.
- Weak corners get 3x repetition per session.

For each corner, the lookAndCall must use the FOUR CUE format:
"Eyes Braking Marker — Aware Apex"
"Eyes Apex — Aware Exit"
"Eyes Exit — Aware Straight"
"Eyes Straight — Aware Braking Marker"

CRITICAL RULES:
- This is ONLY about where the eyes look and where awareness sits
- NEVER include driving technique, braking advice, throttle guidance, body position, or vehicle behaviour
- NEVER say what the driver "should do" — only what the driver's eyes and awareness should be on
- The blueprint trains the gaze. In flow, driving technique takes care of itself.
- If Quiet Eye breaks at any corner: the brain hasn't decided yet, or the target is unclear, or fear is stealing attention. Repeat that corner 3 times.

RESPOND IN VALID JSON ONLY:
{
  "overallStrategy": "string — gaze philosophy, NOT technique advice. Focus on the 4-cue rhythm and flow state.",
  "keyPrinciple": "string — THE single most important insight: same language, same sequence, automatic.",
  "corners": [
    {
      "number": 1,
      "lookAndCall": [
        "Eyes Braking Marker — Aware Apex",
        "Eyes Apex — Aware Exit",
        "Eyes Exit — Aware Straight",
        "Eyes Straight — Aware Braking Marker"
      ],
      "headRotationCue": "Begin head rotation ${headLeadTime} before turn-in...",
      "speedRamp": "25%|50%|100%"
    }
  ],
  "trainingProtocol": {
    "dailyMinutes": 15,
    "steps": [
      { "title": "Watch + Listen (Week 1)", "instruction": "0.5x speed, 5s pauses. Eyes absorb the sequence.", "duration": "5min" },
      { "title": "Look and Call (Week 2)", "instruction": "0.75x speed, 4s pauses. Say each cue aloud.", "duration": "5min" },
      { "title": "Audio Only (Week 3)", "instruction": "1.0x speed, 3s pauses. Visual overlays off.", "duration": "3min" },
      { "title": "Full Speed (Week 4)", "instruction": "1.25x speed, 2s pauses. Automatic.", "duration": "2min" },
      { "title": "Weak Corner Repetition", "instruction": "3x reps on flagged weak corners.", "duration": "5min" }
    ],
    "weakCornerDrills": "If Quiet Eye breaks: brain hasn't decided, target unclear, or fear stealing attention. Repeat 3x."
  }
}`;

        const values = {
            TRACK_NAME: trackConfig.trackName,
            VEHICLE_TYPE: template.vehicleType,
            SKILL_LEVEL: trackConfig.skillLevel,
            CLIENT_NAME: trackConfig.clientName || 'Driver',
            SYSTEM_PROMPT: template.systemPromptSection,
            ALL_CORNERS_SUMMARY: cornerSummary,
            SPEED_RAMP_DEFAULTS: JSON.stringify(template.speedRampDefaults, null, 2)
        };

        const prompt = this._getPrompt('protocol', values, hardcoded);
        return await this._callWithRetry(prompt, 'protocol', template);
    },

    // ── API Caller with Validation & Retry ────────────────────

    async _callWithRetry(prompt, stepName, template, retryCount = 0) {
        const rawText = await AIEngine._callClaudePipeline(prompt);

        let parsed;
        try {
            parsed = BlueprintValidators.extractJSON(rawText);
        } catch (e) {
            if (retryCount < 1) {
                console.warn(`[Pipeline] ${stepName}: JSON parse failed, retrying...`);
                const retryPrompt = prompt + `\n\nIMPORTANT: Your previous response was not valid JSON. Error: ${e.message}\nPlease respond with ONLY valid JSON, no markdown, no explanation.`;
                return this._callWithRetry(retryPrompt, stepName, template, retryCount + 1);
            }
            throw new Error(`Pipeline ${stepName}: Failed to parse JSON after retry. ${e.message}`);
        }

        // Validate based on step
        let validation;
        switch (stepName) {
            case 'classification':
                validation = BlueprintValidators.validateClassification(parsed);
                break;
            case 'gazeSequence':
                validation = BlueprintValidators.validateGazeSequence(parsed, template);
                break;
            case 'riskAnalysis':
                validation = BlueprintValidators.validateRiskAnalysis(parsed, template);
                break;
            case 'protocol':
                validation = BlueprintValidators.validateProtocol(parsed, template);
                break;
            default:
                validation = { valid: true, errors: [], data: parsed };
        }

        if (!validation.valid) {
            if (retryCount < 1) {
                console.warn(`[Pipeline] ${stepName}: Validation failed, retrying...`, validation.errors);
                const errorList = validation.errors.join('\n- ');
                const retryPrompt = prompt + `\n\nIMPORTANT: Your previous response failed validation:\n- ${errorList}\n\nPlease fix these issues and respond with valid JSON only.`;
                return this._callWithRetry(retryPrompt, stepName, template, retryCount + 1);
            }
            console.error(`[Pipeline] ${stepName}: Validation failed after retry:`, validation.errors);
            // Return best-effort data rather than crashing
            return parsed;
        }

        return parsed;
    },

    /**
     * Check if the pipeline is ready to run.
     */
    isConfigured() {
        return !!AIEngine.claudeApiKey && typeof BlueprintTemplates !== 'undefined' && typeof BlueprintValidators !== 'undefined';
    }
};
