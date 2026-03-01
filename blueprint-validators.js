/* ============================================================
   BLUEPRINT VALIDATORS — Schema Validation for Pipeline Steps
   ============================================================
   Validates AI output at every pipeline step to ensure
   consistency and quality. If validation fails, the pipeline
   retries once with the error message injected into the prompt.
   ============================================================ */

const BlueprintValidators = {

    /**
     * Validate Step 1: Corner Classification
     */
    validateClassification(data) {
        const errors = [];
        const required = ['cornerNumber', 'name', 'type', 'qeDifficulty', 'primaryVanTrigger', 'gazeDominanceRecommendation'];

        for (const field of required) {
            if (!(field in data)) errors.push(`Missing: ${field}`);
        }

        const validTypes = ['hairpin', 'tight', 'sweeper', 'kink', 'chicane', 'esses', 'offcamber', 'straight', 'medium'];
        if (data.type && !validTypes.includes(data.type)) {
            errors.push(`Invalid type "${data.type}". Must be: ${validTypes.join(', ')}`);
        }

        const validDifficulties = ['trivial', 'simple', 'moderate', 'challenging', 'expert'];
        if (data.qeDifficulty && !validDifficulties.includes(data.qeDifficulty)) {
            errors.push(`Invalid qeDifficulty "${data.qeDifficulty}". Must be: ${validDifficulties.join(', ')}`);
        }

        return { valid: errors.length === 0, errors, data };
    },

    /**
     * Validate Step 2: Gaze Sequence
     */
    validateGazeSequence(data, template) {
        const errors = [];

        if (!data.gazeSequence) {
            errors.push('Missing gazeSequence object');
            return { valid: false, errors, data };
        }

        const phases = ['brake', 'apex', 'exit'];
        const rules = template.validationRules;
        const seq = data.gazeSequence;

        for (const phase of phases) {
            if (!seq[phase]) {
                errors.push(`Missing phase: ${phase}`);
                continue;
            }

            const p = seq[phase];
            const spec = template.gazePhases[phase];

            // Check eyes target exists and is concrete
            if (!p.eyes || p.eyes.length < rules.eyesMinLength) {
                errors.push(`${phase}.eyes too vague or missing (need ≥${rules.eyesMinLength} chars, got ${(p.eyes || '').length}). Must be a SPECIFIC visual landmark.`);
            }

            // Check aware target exists and is concrete
            if (!p.aware || p.aware.length < rules.awareMinLength) {
                errors.push(`${phase}.aware too vague or missing (need ≥${rules.awareMinLength} chars, got ${(p.aware || '').length}).`);
            }

            // Vehicle-specific keyword check on aware targets
            if (rules.awareKeywordRequired && p.aware) {
                const hasKeyword = rules.awareKeywords.some(kw =>
                    p.aware.toLowerCase().includes(kw.toLowerCase())
                );
                if (!hasKeyword) {
                    errors.push(`${phase}.aware must include vehicle-specific cue. Expected one of: ${rules.awareKeywords.join(', ')}. Got: "${p.aware.substring(0, 60)}..."`);
                }
            }

            // Fixation duration check (if provided)
            if (typeof p.fixationDurationSeconds === 'number') {
                if (p.fixationDurationSeconds < spec.minFixationSec) {
                    errors.push(`${phase} fixation ${p.fixationDurationSeconds}s below min ${spec.minFixationSec}s`);
                }
                if (p.fixationDurationSeconds > spec.maxFixationSec) {
                    errors.push(`${phase} fixation ${p.fixationDurationSeconds}s above max ${spec.maxFixationSec}s`);
                }
            }
        }

        return { valid: errors.length === 0, errors, data };
    },

    /**
     * Validate Step 3: Risk Analysis
     */
    validateRiskAnalysis(data, template) {
        const errors = [];
        const rules = template.validationRules;

        if (!data.riskFactors || !Array.isArray(data.riskFactors) || data.riskFactors.length < rules.minRiskFactors) {
            errors.push(`Need ≥${rules.minRiskFactors} riskFactors, got ${(data.riskFactors || []).length}`);
        }

        if (!data.quietEyeCue || data.quietEyeCue.length < 20) {
            errors.push('quietEyeCue missing or too short (need ≥20 chars). Must be a settling instruction.');
        }

        // Check quietEyeCue is actionable (has a directive verb)
        if (data.quietEyeCue) {
            const hasVerb = rules.quietEyeCueVerbs.some(v =>
                data.quietEyeCue.toLowerCase().includes(v)
            );
            if (!hasVerb) {
                errors.push(`quietEyeCue must be actionable. Include one of: ${rules.quietEyeCueVerbs.join(', ')}. Got: "${data.quietEyeCue.substring(0, 60)}"`);
            }
        }

        if (!data.coachingNotes || data.coachingNotes.length < 10) {
            errors.push('coachingNotes missing or too short');
        }

        return { valid: errors.length === 0, errors, data };
    },

    /**
     * Validate Step 4: Training Protocol
     */
    validateProtocol(data, template) {
        const errors = [];
        const rules = template.validationRules;

        if (!data.overallStrategy || data.overallStrategy.length < 30) {
            errors.push('overallStrategy missing or too short (need ≥30 chars)');
        }

        if (!data.keyPrinciple || data.keyPrinciple.length < 20) {
            errors.push('keyPrinciple missing or too short (need ≥20 chars)');
        }

        if (!data.corners || !Array.isArray(data.corners)) {
            errors.push('corners array missing');
        } else {
            for (const c of data.corners) {
                if (!c.lookAndCall || c.lookAndCall.length < 3) {
                    errors.push(`Corner ${c.number}: lookAndCall needs ≥3 cues, got ${(c.lookAndCall || []).length}`);
                }
                if (!c.headRotationCue || c.headRotationCue.length < 10) {
                    errors.push(`Corner ${c.number}: headRotationCue missing or too short`);
                }
                if (!rules.validSpeedRamps.includes(c.speedRamp)) {
                    errors.push(`Corner ${c.number}: speedRamp "${c.speedRamp}" invalid. Must be: ${rules.validSpeedRamps.join(', ')}`);
                }
            }
        }

        if (!data.trainingProtocol || !data.trainingProtocol.steps || data.trainingProtocol.steps.length < 3) {
            errors.push('trainingProtocol must have ≥3 steps');
        }

        return { valid: errors.length === 0, errors, data };
    },

    /**
     * Extract JSON from AI response (handles markdown wrapping)
     */
    extractJSON(rawText) {
        let jsonStr = rawText.trim();
        // Strip markdown code blocks
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            // Try to find JSON object in mixed content
            const match = rawText.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]);
            }
            throw new Error(`Could not parse JSON from AI response: ${rawText.substring(0, 200)}...`);
        }
    }
};
