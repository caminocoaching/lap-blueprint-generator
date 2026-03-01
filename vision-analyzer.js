/* ============================================================
   VISION-ANALYZER.JS — Gemini Vision Corner Detection
   ============================================================
   
   Uses Google Gemini Vision API to analyze onboard racing footage
   frame-by-frame and detect corners with their key markers:
   
   1. First Sight — braking marker becomes visible
   2. Brake Point — driver begins braking  
   3. Apex — tightest point of corner, maximum steering
   4. Exit — car straightens and accelerates
   
   This replaces basic pixel-level CV with real AI scene understanding.
   The model can see: track curvature, kerbs, steering angle (from dash),
   barriers, braking boards, and corner geometry.
   
   Implements the REVERSE-FIRST methodology:
   - First pass: sample frames chronologically
   - Analysis: Gemini classifies each frame
   - Cross-reference with track map for spatial validation
   ============================================================ */

const VisionAnalyzer = {

    // ── Configuration ────────────────────────────────────────
    config: {
        sampleIntervalMs: 500,    // Sample a frame every 500ms (2 fps)
        batchSize: 8,             // Frames per API call (cost vs accuracy)
        imageSize: 512,           // Resize frames to 512px wide
        imageQuality: 0.6,        // JPEG quality
        model: 'gemini-2.0-flash',  // Vision model
    },

    // ── State ────────────────────────────────────────────────
    isAnalyzing: false,
    progress: 0,
    frames: [],              // { time, dataUrl, classification }
    detectedCorners: [],     // Final corner sequences
    trackMapDataUrl: null,   // Track map as base64

    // ── Canvas for frame extraction ──────────────────────────
    _canvas: null,
    _ctx: null,

    // ==========================================================
    //  PUBLIC API
    // ==========================================================

    /**
     * Analyze a video to detect corners using Gemini Vision.
     * @param {HTMLVideoElement} video — the loaded video element
     * @param {number} startTime — lap start time in seconds
     * @param {number} endTime — lap end time in seconds
     * @param {string|null} trackMapUrl — optional track map image URL
     * @param {Function} report — progress callback (progress 0-1, message)
     * @returns {Object} { corners, frameClassifications, stats }
     */
    async analyze(video, startTime, endTime, trackMapUrl, report = () => { }) {
        if (!AIEngine.isConfigured()) {
            throw new Error('Gemini API key required. Set it in Settings.');
        }

        this.isAnalyzing = true;
        this.frames = [];
        this.detectedCorners = [];

        try {
            // ── Phase 1: Extract frames ──────────────────────
            report(0.05, 'Phase 1/4 — Extracting video frames...');
            await this._extractFrames(video, startTime, endTime, report);

            // ── Phase 2: Load track map ──────────────────────
            if (trackMapUrl) {
                report(0.25, 'Phase 2/4 — Loading track map...');
                await this._loadTrackMap(trackMapUrl);
            }

            // ── Phase 3: Send to Gemini Vision ───────────────
            report(0.30, 'Phase 3/4 — AI analyzing frames...');
            await this._classifyFrames(report);

            // ── Phase 4: Build corner sequences ──────────────
            report(0.90, 'Phase 4/4 — Building corner sequences...');
            this.detectedCorners = this._buildCornerSequences();

            report(1.0, `Complete — ${this.detectedCorners.length} corners detected`);

            this.isAnalyzing = false;

            return {
                corners: this.detectedCorners,
                frameClassifications: this.frames,
                stats: {
                    totalFrames: this.frames.length,
                    cornersDetected: this.detectedCorners.length,
                    lapDuration: endTime - startTime,
                }
            };

        } catch (error) {
            this.isAnalyzing = false;
            throw error;
        }
    },


    // ==========================================================
    //  PHASE 1: FRAME EXTRACTION
    // ==========================================================

    async _extractFrames(video, startTime, endTime, report) {
        // Create canvas for frame capture
        if (!this._canvas) {
            this._canvas = document.createElement('canvas');
            this._ctx = this._canvas.getContext('2d');
        }

        const aspectRatio = video.videoHeight / video.videoWidth;
        this._canvas.width = this.config.imageSize;
        this._canvas.height = Math.round(this.config.imageSize * aspectRatio);

        const duration = endTime - startTime;
        const intervalSec = this.config.sampleIntervalMs / 1000;
        const totalFrames = Math.ceil(duration / intervalSec);

        this.frames = [];

        for (let i = 0; i < totalFrames; i++) {
            const time = startTime + (i * intervalSec);
            if (time > endTime) break;

            // Seek video to this time
            video.currentTime = time;
            await new Promise(resolve => {
                video.onseeked = resolve;
                setTimeout(resolve, 200); // Fallback timeout
            });

            // Draw frame to canvas
            this._ctx.drawImage(video, 0, 0, this._canvas.width, this._canvas.height);

            // Convert to base64 JPEG
            const dataUrl = this._canvas.toDataURL('image/jpeg', this.config.imageQuality);

            this.frames.push({
                index: i,
                time: time,
                relTime: time - startTime,
                dataUrl: dataUrl,
                classification: null, // Filled by Phase 3
            });

            const progress = 0.05 + (i / totalFrames) * 0.20;
            report(progress, `Extracting frame ${i + 1}/${totalFrames} (${this._formatTime(time)})`);

            // Yield to UI thread every 5 frames
            if (i % 5 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        console.log(`[VisionAnalyzer] Extracted ${this.frames.length} frames over ${duration.toFixed(1)}s`);
    },


    // ==========================================================
    //  PHASE 2: TRACK MAP LOADING
    // ==========================================================

    async _loadTrackMap(trackMapUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 400;
                const scale = Math.min(maxDim / img.width, maxDim / img.height);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                this.trackMapDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                console.log('[VisionAnalyzer] Track map loaded and resized');
                resolve();
            };
            img.onerror = () => {
                console.warn('[VisionAnalyzer] Could not load track map');
                this.trackMapDataUrl = null;
                resolve();
            };
            img.src = trackMapUrl;
        });
    },


    // ==========================================================
    //  PHASE 3: GEMINI VISION CLASSIFICATION
    // ==========================================================

    async _classifyFrames(report) {
        const batches = [];
        for (let i = 0; i < this.frames.length; i += this.config.batchSize) {
            batches.push(this.frames.slice(i, i + this.config.batchSize));
        }

        console.log(`[VisionAnalyzer] Sending ${batches.length} batches of ${this.config.batchSize} frames to Gemini`);

        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            const progress = 0.30 + (b / batches.length) * 0.58;
            report(progress, `AI analyzing batch ${b + 1}/${batches.length}...`);

            try {
                const classifications = await this._sendBatch(batch, b, batches.length);

                // Apply classifications to frames
                for (let i = 0; i < batch.length; i++) {
                    if (classifications[i]) {
                        batch[i].classification = classifications[i];
                    }
                }
            } catch (err) {
                console.error(`[VisionAnalyzer] Batch ${b + 1} failed:`, err);
                // Mark frames as unclassified rather than failing entirely
                batch.forEach(f => {
                    if (!f.classification) {
                        f.classification = { phase: 'unknown', confidence: 0, notes: 'API error' };
                    }
                });
            }

            // Small delay between batches to respect rate limits
            if (b < batches.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
    },

    async _sendBatch(batchFrames, batchIndex, totalBatches) {
        const frameDescriptions = batchFrames.map((f, i) =>
            `Frame ${batchIndex * this.config.batchSize + i + 1} at ${this._formatTime(f.time)} (${f.relTime.toFixed(1)}s into lap)`
        ).join('\n');

        // Build the prompt text
        const promptText = `You are an expert motorsport vision telemetry system analyzing onboard racing footage from a motorcycle or car. Your task is to classify each video frame into its corner phase and extract visual telemetry data.

VEHICLE DYNAMICS YOU CAN SEE:
• HORIZON TILT = lean angle. A tilted horizon means the vehicle is cornering. Greater tilt = deeper corner.
• HORIZON DROP = braking. When the nose dives under braking, the horizon line drops in the frame.
• HORIZON RISE = acceleration. On exit, the nose lifts and horizon rises.
• TRACK EXPANSION RATE = speed. Objects growing rapidly = high speed. Slower growth = deceleration.
• CURB/KERB PROXIMITY = apex. When inside kerb fills the frame edge, the vehicle is at the apex.
• TRACK CURVATURE = corner severity. Visible curve ahead indicates upcoming corner. Straight track = straight phase.

WHAT TO LOOK FOR IN EACH FRAME:
1. Braking distance boards (200m, 100m, 50m markers)
2. Inside kerbs/curbs (red-white, yellow, blue) and their proximity
3. Track surface markings, run-off areas, barriers, grandstands
4. Dashboard/instrument cluster if visible (speed, gear indicator, RPM)
5. Horizon line angle (tilted = leaning, level = straight)
6. Other vehicles or riders on track
7. Track width changes, elevation changes
8. Shadows, spray, lighting conditions

CLASSIFY EACH FRAME AS ONE OF:
• "straight" — track is straight ahead, horizon level, no significant curvature visible
• "braking" — approaching corner, horizon dropping (nose dive), possible braking markers visible, track beginning to curve ahead
• "turn_in" — vehicle beginning to turn, horizon starting to tilt, inside kerb coming into view, first visual contact with apex zone
• "mid_corner" — deep in the corner, significant horizon tilt (lean angle), between turn-in and apex
• "apex" — at the tightest point: maximum horizon tilt, inside kerb CLOSEST to camera, minimum speed point
• "exit" — straightening up, horizon leveling, inside kerb receding, track opening up ahead, acceleration beginning
• "between_corners" — short transition between connected corners (chicane, esses)

FOR EACH FRAME PROVIDE:
{
  "index": N,
  "phase": "one of the above",
  "direction": "left" | "right" | "none",
  "severity": "hairpin" | "medium" | "fast_sweeper" | "kink" | "chicane_element",
  "confidence": 0.0-1.0,
  "leanAngle": estimated degrees from horizon tilt (0=upright, 30=medium, 50+=deep), 
  "speedEstimate": "very_high" | "high" | "medium" | "low" | "very_low",
  "kerbs": "none" | "approaching" | "alongside" | "receding",
  "brakingBoard": "none" | "200m" | "100m" | "50m" | "other",
  "gazeTarget": what a rider's Quiet Eye should be fixated on in this frame (e.g., "braking marker", "apex kerb", "exit kerb", "vanishing point"),
  "notes": brief description of what you observe
}

These frames are sequential, sampled at 0.5-second intervals from a single racing lap:
${frameDescriptions}

Respond ONLY with valid JSON: { "frames": [ ... ] }`;

        // Build Gemini request parts
        const parts = [];
        parts.push({ text: promptText });

        // Add track map if available
        if (this.trackMapDataUrl) {
            parts.push({ text: 'Here is the track map for reference — use it to understand which part of the circuit these frames are from:' });
            const mapBase64 = this.trackMapDataUrl.split(',')[1];
            const mapMime = this.trackMapDataUrl.split(';')[0].split(':')[1];
            parts.push({
                inlineData: {
                    mimeType: mapMime,
                    data: mapBase64
                }
            });
        }

        // Add each frame image
        for (const frame of batchFrames) {
            const base64 = frame.dataUrl.split(',')[1];
            const mimeType = frame.dataUrl.split(';')[0].split(':')[1];
            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64
                }
            });
        }

        // Send to Gemini
        const model = AIEngine.model || this.config.model;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${AIEngine.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: parts
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `Gemini API Error ${response.status}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('Empty response from Gemini Vision');
        }
        const result = JSON.parse(content);

        return result.frames || [];
    },


    // ==========================================================
    //  PHASE 4: BUILD CORNER SEQUENCES
    // ==========================================================

    _buildCornerSequences() {
        const classified = this.frames.filter(f => f.classification && f.classification.phase !== 'unknown');
        if (classified.length === 0) return [];

        const corners = [];
        let currentCorner = null;
        let cornerNumber = 0;

        for (let i = 0; i < classified.length; i++) {
            const frame = classified[i];
            const phase = frame.classification.phase;
            const cls = frame.classification;

            // Entering a corner zone
            if (['braking', 'turn_in', 'mid_corner', 'apex'].includes(phase)) {
                if (!currentCorner) {
                    cornerNumber++;
                    currentCorner = {
                        number: cornerNumber,
                        firstSight: null,
                        brake: null,
                        apex: null,
                        exit: null,
                        direction: cls.direction || 'unknown',
                        severity: cls.severity || 'medium',
                        confidence: 0,
                        maxLeanAngle: 0,
                        gazeTargets: {},          // { brake, apex, exit }
                        brakingBoard: 'none',     // Nearest detected board
                        frames: [],
                    };
                }

                currentCorner.frames.push(frame);

                // Track maximum lean angle
                if (cls.leanAngle && cls.leanAngle > currentCorner.maxLeanAngle) {
                    currentCorner.maxLeanAngle = cls.leanAngle;
                }

                // Capture braking board sightings
                if (cls.brakingBoard && cls.brakingBoard !== 'none') {
                    currentCorner.brakingBoard = cls.brakingBoard;
                }

                // Assign markers based on phase
                if (phase === 'braking' && !currentCorner.brake) {
                    currentCorner.brake = {
                        time: frame.time,
                        confidence: cls.confidence,
                        notes: cls.notes,
                        gazeTarget: cls.gazeTarget || 'braking marker',
                        leanAngle: cls.leanAngle || 0,
                        speedEstimate: cls.speedEstimate || 'unknown',
                        bidirectional: false,
                    };
                    currentCorner.gazeTargets.brake = cls.gazeTarget || 'braking marker';

                    // First sight = frame before braking (if available)
                    if (i > 0 && !currentCorner.firstSight) {
                        const prevFrame = classified[i - 1];
                        currentCorner.firstSight = {
                            time: prevFrame.time,
                            confidence: cls.confidence * 0.8,
                            notes: 'Frame before braking detected',
                            gazeTarget: 'corner approach — braking marker becoming visible',
                            bidirectional: false,
                        };
                    }
                }

                if (phase === 'turn_in' && !currentCorner.brake) {
                    currentCorner.brake = {
                        time: frame.time,
                        confidence: cls.confidence * 0.7,
                        notes: 'Turn-in (no distinct brake point)',
                        gazeTarget: cls.gazeTarget || 'turn-in reference',
                        leanAngle: cls.leanAngle || 0,
                        bidirectional: false,
                    };
                    currentCorner.gazeTargets.brake = cls.gazeTarget || 'turn-in reference point';
                }

                if (phase === 'apex' || phase === 'mid_corner') {
                    // For apex: take highest lean angle frame as the true apex
                    const isApex = phase === 'apex';
                    const isBetterApex = !currentCorner.apex ||
                        (isApex && !currentCorner._hasExplicitApex) ||
                        (cls.leanAngle && cls.leanAngle > (currentCorner.apex?.leanAngle || 0));

                    if (isBetterApex) {
                        currentCorner.apex = {
                            time: frame.time,
                            confidence: cls.confidence,
                            notes: cls.notes,
                            gazeTarget: cls.gazeTarget || 'inside kerb apex',
                            leanAngle: cls.leanAngle || 0,
                            kerbs: cls.kerbs || 'unknown',
                            bidirectional: false,
                        };
                        currentCorner.gazeTargets.apex = cls.gazeTarget || 'inside kerb at the tightest point';
                        if (isApex) currentCorner._hasExplicitApex = true;
                    }
                    // Update direction from apex/mid-corner (most reliable)
                    if (cls.direction && cls.direction !== 'none') {
                        currentCorner.direction = cls.direction;
                    }
                }
            }

            // Exiting a corner
            if (phase === 'exit' && currentCorner) {
                if (!currentCorner.exit) {
                    currentCorner.exit = {
                        time: frame.time,
                        confidence: cls.confidence,
                        notes: cls.notes,
                        gazeTarget: cls.gazeTarget || 'exit kerb / track-out point',
                        leanAngle: cls.leanAngle || 0,
                        bidirectional: false,
                    };
                    currentCorner.gazeTargets.exit = cls.gazeTarget || 'exit kerb';
                }
                currentCorner.frames.push(frame);
            }

            // Back to straight = corner complete
            if ((phase === 'straight' || phase === 'between_corners') && currentCorner) {
                this._finalizeCorner(currentCorner);
                if (currentCorner.confidence >= 0.3) {
                    corners.push(currentCorner);
                }
                currentCorner = null;
            }
        }

        // Handle final corner if still open
        if (currentCorner) {
            this._finalizeCorner(currentCorner);
            if (currentCorner.confidence >= 0.3) {
                corners.push(currentCorner);
            }
        }

        console.log(`[VisionAnalyzer] Built ${corners.length} corner sequences`);
        corners.forEach((c, i) => {
            console.log(`  Corner ${i + 1}: ${c.direction} ${c.cornerType}, lean=${c.maxLeanAngle}°, ` +
                `markers=${c.markerCount}, conf=${c.confidence.toFixed(2)}`);
        });
        return corners;
    },

    _finalizeCorner(corner) {
        const markers = [corner.firstSight, corner.brake, corner.apex, corner.exit].filter(Boolean);
        corner.confidence = markers.length > 0
            ? markers.reduce((s, m) => s + m.confidence, 0) / markers.length
            : 0;
        corner.markerCount = markers.length;
        delete corner._hasExplicitApex;

        // Calculate duration
        const startEvt = corner.firstSight || corner.brake || corner.apex;
        const endEvt = corner.exit || corner.apex || corner.brake;
        if (startEvt && endEvt) {
            corner.duration = endEvt.time - startEvt.time;
        } else {
            corner.duration = 0;
        }

        // Corner type from severity + duration + lean angle
        if (corner.severity === 'hairpin' || corner.duration > 4 || corner.maxLeanAngle < 20) {
            corner.cornerType = 'hairpin';
        } else if (corner.severity === 'kink' || corner.duration < 1) {
            corner.cornerType = 'kink';
        } else if (corner.severity === 'fast_sweeper' || corner.maxLeanAngle > 45) {
            corner.cornerType = 'sweeper';
        } else if (corner.severity === 'chicane_element') {
            corner.cornerType = 'chicane';
        } else {
            corner.cornerType = 'medium';
        }

        // Generate Quiet Eye coaching cue based on corner type
        const gazeTemplates = {
            hairpin: 'Settle your eyes on the inside kerb early — let the machine arrive at the apex.',
            sweeper: 'Eyes flow with the curve — lock onto the apex kerb, let peripheral vision find the exit.',
            kink: 'Brief fixation on the kink apex — commit and release, back to the vanishing point.',
            chicane: 'Eyes jump: first apex → second apex. Each gets one calm fixation.',
            medium: 'Eyes on the braking reference, then transfer early to the apex kerb.',
        };
        corner.quietEyeCue = gazeTemplates[corner.cornerType] || gazeTemplates.medium;
    },


    // ==========================================================
    //  THUMBNAIL CAPTURE
    // ==========================================================

    async captureCornerThumbnails(video, corners, report = () => { }) {
        const thumbnails = [];

        for (let i = 0; i < corners.length; i++) {
            report(i / corners.length, `Capturing corner ${i + 1}/${corners.length}`);

            const corner = corners[i];
            const thumbs = {};

            for (const markerType of ['firstSight', 'brake', 'apex', 'exit']) {
                if (corner[markerType]) {
                    thumbs[markerType] = await this._captureFrame(video, corner[markerType].time);
                }
            }

            thumbnails.push(thumbs);
        }

        return thumbnails;
    },

    async _captureFrame(video, time) {
        video.currentTime = time;
        await new Promise(resolve => {
            video.onseeked = resolve;
            setTimeout(resolve, 300);
        });

        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    },


    // ==========================================================
    //  UTILITY
    // ==========================================================

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toFixed(1);
        return `${m}:${s.padStart(4, '0')}`;
    },
};
