/* ============================================================
   AIRTABLE PROMPT MANAGER — Live Prompt Editing via Airtable
   ============================================================
   Fetches pipeline prompt templates from an Airtable base so
   you can tweak wording, rules, and schemas without redeploying.

   Airtable Table: "Pipeline Prompts"
   Required Fields:
     - StepName       (Single line text)  — classify | gazeSequence | riskAnalysis | protocol
     - SystemRole     (Long text)         — AI persona / role line
     - PromptTemplate (Long text)         — Main prompt body with {{PLACEHOLDERS}}
     - CriticalRules  (Long text)         — Rules section (edited separately for clarity)
     - ResponseSchema (Long text)         — JSON schema the API must return
     - VehicleType    (Single line text)   — "all" or "motorcycle" | "car" | "kart" | "formula"
     - Active         (Checkbox)          — only active rows are used
     - Version        (Number)            — for tracking changes
     - Notes          (Long text)         — documentation

   Placeholder tokens in PromptTemplate / CriticalRules / ResponseSchema:
     {{TRACK_NAME}}         — track name
     {{VEHICLE_TYPE}}       — motorcycle / car / kart / formula
     {{SKILL_LEVEL}}        — beginner / intermediate / advanced / elite
     {{CLIENT_NAME}}        — driver/rider name
     {{SYSTEM_PROMPT}}      — vehicle template system prompt section
     {{CORNER_JSON}}        — JSON of the current corner data
     {{CORNER_NAME}}        — corner name
     {{CORNER_DIRECTION}}   — left / right
     {{CORNER_TYPE}}        — hairpin / sweeper / etc.
     {{CORNER_NUMBER}}      — corner index
     {{QE_DIFFICULTY}}      — trivial / simple / moderate / challenging / expert
     {{VAN_TRIGGER}}        — primary VAN trigger
     {{GAZE_DOMINANCE}}     — gaze dominance recommendation
     {{GAZE_PHASES}}        — formatted gaze phase specs from template
     {{VISUAL_LANDMARKS}}   — corner-specific visual data
     {{GAZE_SEQUENCE_JSON}} — gaze sequence from step 2
     {{VISUAL_CHALLENGE}}   — visual challenge text
     {{DAN_VAN_NOTES}}      — DAN/VAN notes
     {{VAN_TRIGGERS_LIST}}  — known VAN triggers per phase
     {{ALL_CORNERS_SUMMARY}} — summary of all corners for step 4
     {{SPEED_RAMP_DEFAULTS}} — speed ramp JSON from template
     {{TRACK_NOTES}}        — additional track context
   ============================================================ */

const AirtablePrompts = {

    // ── Configuration ────────────────────────────────────────
    _apiKey: null,
    _baseId: null,
    _tableId: null,

    // ── Cache ────────────────────────────────────────────────
    _cache: null,
    _cacheTimestamp: 0,
    _cacheTTL: 5 * 60 * 1000, // 5 minutes — keeps prompts fresh during iteration

    // ── Initialization ───────────────────────────────────────
    init() {
        this._apiKey = localStorage.getItem('lb_airtable_key') || null;
        this._baseId = localStorage.getItem('lb_airtable_base') || null;
        this._tableId = localStorage.getItem('lb_airtable_table') || null;
    },

    setConfig(apiKey, baseId, tableId) {
        this._apiKey = apiKey;
        this._baseId = baseId;
        this._tableId = tableId;
        if (apiKey) localStorage.setItem('lb_airtable_key', apiKey);
        if (baseId) localStorage.setItem('lb_airtable_base', baseId);
        if (tableId) localStorage.setItem('lb_airtable_table', tableId);
    },

    isConfigured() {
        return !!(this._apiKey && this._baseId && this._tableId);
    },

    // ── Fetch Prompts from Airtable ──────────────────────────

    /**
     * Fetch all active prompts from Airtable.
     * Returns a map: { "classify": { systemRole, promptTemplate, criticalRules, responseSchema }, ... }
     * Falls back to null if Airtable is unreachable (pipeline uses hardcoded prompts).
     */
    async fetchPrompts(vehicleType = 'all') {
        if (!this.isConfigured()) return null;

        // Check cache
        if (this._cache && (Date.now() - this._cacheTimestamp) < this._cacheTTL) {
            console.log('[Airtable] Using cached prompts');
            return this._filterByVehicle(this._cache, vehicleType);
        }

        try {
            // Airtable API: list records, filter for Active = true
            const url = `https://api.airtable.com/v0/${this._baseId}/${this._tableId}?filterByFormula={Active}=TRUE()&sort[0][field]=StepName&sort[0][direction]=asc`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this._apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Airtable] API error:', response.status, errText);
                return null;
            }

            const data = await response.json();
            const prompts = this._parseRecords(data.records);

            // Cache the full result
            this._cache = prompts;
            this._cacheTimestamp = Date.now();

            console.log(`[Airtable] Loaded ${data.records.length} prompt records`);
            return this._filterByVehicle(prompts, vehicleType);

        } catch (err) {
            console.error('[Airtable] Fetch failed:', err.message);
            return null; // Fallback to hardcoded
        }
    },

    /**
     * Parse Airtable records into a usable map.
     * Groups by StepName, with vehicle-specific overrides.
     */
    _parseRecords(records) {
        const map = {};

        for (const record of records) {
            const f = record.fields;
            const stepName = (f.StepName || '').trim().toLowerCase();
            const vehicleType = (f.VehicleType || 'all').trim().toLowerCase();

            if (!stepName) continue;

            const entry = {
                stepName,
                vehicleType,
                systemRole: f.SystemRole || '',
                promptTemplate: f.PromptTemplate || '',
                criticalRules: f.CriticalRules || '',
                responseSchema: f.ResponseSchema || '',
                version: f.Version || 1,
                notes: f.Notes || '',
                recordId: record.id
            };

            // Key format: "classify" for generic, "classify_motorcycle" for vehicle-specific
            const key = vehicleType === 'all' ? stepName : `${stepName}_${vehicleType}`;
            map[key] = entry;
        }

        return map;
    },

    /**
     * Filter prompts for a specific vehicle type.
     * Vehicle-specific prompts override generic "all" prompts.
     */
    _filterByVehicle(allPrompts, vehicleType) {
        const result = {};
        const steps = ['classify', 'gazesequence', 'riskanalysis', 'protocol'];

        for (const step of steps) {
            // Prefer vehicle-specific, fall back to generic
            const specificKey = `${step}_${vehicleType}`;
            const genericKey = step;

            // Normalize step name for output (camelCase)
            const outputKey = step === 'gazesequence' ? 'gazeSequence'
                : step === 'riskanalysis' ? 'riskAnalysis'
                : step;

            if (allPrompts[specificKey]) {
                result[outputKey] = allPrompts[specificKey];
            } else if (allPrompts[genericKey]) {
                result[outputKey] = allPrompts[genericKey];
            }
        }

        return result;
    },

    // ── Placeholder Replacement ──────────────────────────────

    /**
     * Replace all {{PLACEHOLDER}} tokens in a prompt string with actual values.
     * @param {string} template — prompt template with {{PLACEHOLDERS}}
     * @param {object} values — key-value map of replacements
     * @returns {string} — filled prompt
     */
    fillTemplate(template, values) {
        if (!template) return '';

        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            // Try exact key first, then common variations
            if (values[key] !== undefined) return values[key];

            // Convert SCREAMING_SNAKE to camelCase for lookup
            const camel = key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (values[camel] !== undefined) return values[camel];

            // Return the placeholder unchanged if no match
            console.warn(`[Airtable] Unresolved placeholder: {{${key}}}`);
            return match;
        });
    },

    /**
     * Build a complete prompt from Airtable parts + dynamic values.
     * Combines: SystemRole + PromptTemplate + CriticalRules + ResponseSchema
     */
    buildPrompt(promptData, values) {
        if (!promptData) return null;

        const parts = [];

        if (promptData.systemRole) {
            parts.push(this.fillTemplate(promptData.systemRole, values));
        }

        if (promptData.promptTemplate) {
            parts.push(this.fillTemplate(promptData.promptTemplate, values));
        }

        if (promptData.criticalRules) {
            parts.push('CRITICAL RULES:\n' + this.fillTemplate(promptData.criticalRules, values));
        }

        if (promptData.responseSchema) {
            parts.push('RESPOND IN VALID JSON ONLY:\n' + this.fillTemplate(promptData.responseSchema, values));
        }

        return parts.join('\n\n');
    },

    // ── Cache Management ─────────────────────────────────────

    clearCache() {
        this._cache = null;
        this._cacheTimestamp = 0;
        console.log('[Airtable] Cache cleared');
    },

    /**
     * Force refresh prompts from Airtable (bypasses cache).
     */
    async refreshPrompts(vehicleType = 'all') {
        this.clearCache();
        return this.fetchPrompts(vehicleType);
    }
};
