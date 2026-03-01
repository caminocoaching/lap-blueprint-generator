/* ============================================================
   BLUEPRINT PIPELINE — 4-Step Deterministic Blueprint Engine
   ============================================================
   Generates QE blueprints through 4 focused API calls, each
   validated before proceeding. Temperature 0 for exact
   reproducibility. Vehicle template injected at every step.

   Steps:
   1. CLASSIFY — corner type + QE difficulty + VAN trigger
   2. GAZE SEQUENCE — Eyes/Aware for brake→apex→exit
   3. RISK ANALYSIS — VAN triggers + quietEyeCue + coaching
   4. PROTOCOL ASSEMBLY — strategy, lookAndCall, head rotation

   Steps 1–3 run per corner. Step 4 runs once for the lap.
   ============================================================ */

const BlueprintPipeline = {

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

        // 2. Process each corner through Steps 1–3
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
            overallStrategy: protocol.overallStrategy,
            keyPrinciple: protocol.keyPrinciple,
            corners: processedCorners,
            trainingProtocol: protocol.trainingProtocol || {
                dailyMinutes: 15,
                steps: [],
                weakCornerDrills: ''
            }
        };

        if (onProgress) onProgress(100, 'Blueprint complete');
        return blueprint;
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

        const prompt = `You are a Quiet Eye corner classification specialist.

TRACK: ${trackConfig.trackName}
VEHICLE: ${template.vehicleType}
SKILL LEVEL: ${trackConfig.skillLevel}

${template.systemPromptSection}

CORNER DATA:
${cornerJSON}

TRACK CONTEXT:
${trackConfig.trackNotes || 'No additional context.'}

CLASSIFY this corner for Quiet Eye protocol design:

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

        const prompt = `You are a Quiet Eye gaze sequence engineer.

TRACK: ${trackConfig.trackName}
CORNER: ${classified.name} (${classified.direction} ${classified.type}, QE difficulty: ${classified.qeDifficulty})
VEHICLE: ${template.vehicleType}
PRIMARY VAN TRIGGER: ${classified.primaryVanTrigger}
GAZE DOMINANCE: ${classified.gazeDominanceRecommendation}

${template.systemPromptSection}

VISUAL LANDMARK DATA FOR THIS CORNER:
${classified.gazeTargets ? JSON.stringify(classified.gazeTargets, null, 2) : 'No specific visual data — use corner type defaults.'}
${classified.kerbDescription ? 'KERB: ' + JSON.stringify(classified.kerbDescription, null, 2) : ''}
${classified.visualChallenge ? 'VISUAL CHALLENGE: ' + classified.visualChallenge : ''}
${classified.danVanNotes ? 'DAN/VAN NOTES: ' + classified.danVanNotes : ''}

GAZE PHASE SPECIFICATIONS:
${phaseSpecs}

CRITICAL RULES:
1. "eyes" = SPECIFIC visual feature (kerb colour, board number, landmark). Never generic.
2. "aware" = VEHICLE-SPECIFIC peripheral cue (${template.vehicleType === 'motorcycle' ? 'lean angle, tank edge, handlebar, vestibular' : 'steering wheel, brake pedal, throttle, hand grip'}).
3. Each instruction = ONE clear place for the brain to settle.

RESPOND IN VALID JSON ONLY:
{
  "cornerNumber": ${classified.cornerNumber || classified.number},
  "gazeSequence": {
    "brake": {
      "eyes": "concrete visual target for braking",
      "aware": "vehicle-specific peripheral awareness",
      "fixationDurationSeconds": number
    },
    "apex": {
      "eyes": "concrete visual target at apex",
      "aware": "vehicle-specific peripheral awareness at max load",
      "fixationDurationSeconds": number
    },
    "exit": {
      "eyes": "concrete visual target beyond corner",
      "aware": "vehicle-specific peripheral awareness opening to throttle",
      "fixationDurationSeconds": number
    }
  }
}`;

        return await this._callWithRetry(prompt, 'gazeSequence', template);
    },

    // ── Step 3: Risk Analysis ─────────────────────────────────

    async _step3_riskAnalysis(classified, gazeData, template, trackConfig) {
        const prompt = `You are a Quiet Eye risk analyst specialising in VAN (Ventral Attention Network) suppression.

TRACK: ${trackConfig.trackName}
CORNER: ${classified.name} (${classified.direction} ${classified.type})
VEHICLE: ${template.vehicleType}
QE DIFFICULTY: ${classified.qeDifficulty}
PRIMARY VAN TRIGGER: ${classified.primaryVanTrigger}

GAZE SEQUENCE (just generated for this corner):
${JSON.stringify(gazeData.gazeSequence, null, 2)}

VISUAL CONTEXT:
${classified.visualChallenge || 'No specific visual challenge noted.'}
${classified.danVanNotes || ''}

KNOWN VAN TRIGGERS FOR ${template.vehicleType.toUpperCase()}:
${Object.entries(template.gazePhases).map(([phase, spec]) =>
    `${phase}: ${spec.vanTriggers.join(', ')}`
).join('\n')}

Generate risk analysis and the Quiet Eye settling cue for this corner.

The quietEyeCue must be:
- One powerful sentence the driver/rider says internally
- Contains an ACTION VERB (settle, lock, commit, fixate, snap, hold, anchor)
- References the SPECIFIC visual target from the gaze sequence above
- Ends with vehicle-specific follow-through (e.g. "let the ${template.vehicleType} follow")

RESPOND IN VALID JSON ONLY:
{
  "cornerNumber": ${classified.cornerNumber || classified.number},
  "riskFactors": [
    "specific risk 1",
    "specific risk 2",
    "specific risk 3"
  ],
  "quietEyeCue": "Settle your eyes on [specific target] — let the ${template.vehicleType} follow.",
  "coachingNotes": "2-3 sentences of additional coaching context for this corner"
}`;

        return await this._callWithRetry(prompt, 'riskAnalysis', template);
    },

    // ── Step 4: Training Protocol Assembly ────────────────────

    async _step4_protocol(allCorners, template, trackConfig) {
        const cornerSummary = allCorners.map(c =>
            `Corner ${c.number}: "${c.name}" — ${c.direction} ${c.type} (QE: ${c.qeDifficulty}, VAN: ${c.primaryVanTrigger})`
        ).join('\n');

        const prompt = `You are a Quiet Eye training protocol designer.

TRACK: ${trackConfig.trackName}
VEHICLE: ${template.vehicleType}
SKILL LEVEL: ${trackConfig.skillLevel}
CLIENT: ${trackConfig.clientName || 'Driver'}

${template.systemPromptSection}

ALL CORNERS (classified and with gaze sequences):
${cornerSummary}

SPEED RAMP DEFAULTS FOR ${template.vehicleType.toUpperCase()}:
${JSON.stringify(template.speedRampDefaults, null, 2)}

GENERATE the complete training protocol.

For each corner, provide:
1. lookAndCall — exactly 3 verbal cues (what the driver/rider SAYS aloud during training): "BRAKE!" → "APEX!" → "EXIT!" with specific visual reference
2. headRotationCue — when to begin head rotation (use ${template.vehicleType === 'motorcycle' ? '0.8–1.0s' : '0.55–0.75s'} lead time)
3. speedRamp — "25%"|"50%"|"100%" based on corner difficulty

Also generate:
- overallStrategy: 2-3 sentences on the lap gaze philosophy for this track + vehicle
- keyPrinciple: THE single most important QE insight for this driver
- trainingProtocol: daily training steps (≥5 steps)
- weakCornerDrills: instructions for repeating weak corners

RESPOND IN VALID JSON ONLY:
{
  "overallStrategy": "string",
  "keyPrinciple": "string",
  "corners": [
    {
      "number": 1,
      "lookAndCall": ["BRAKE — eyes on [target]!", "APEX — lock [target]!", "EXIT — snap to [target]!"],
      "headRotationCue": "Begin head rotation X seconds before turn-in...",
      "speedRamp": "25%|50%|100%"
    }
  ],
  "trainingProtocol": {
    "dailyMinutes": 15,
    "steps": [
      { "title": "string", "instruction": "string", "duration": "Xmin" }
    ],
    "weakCornerDrills": "string"
  }
}`;

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
