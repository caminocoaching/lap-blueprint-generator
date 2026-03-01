/* ============================================================
   CORNER-WIZARD.JS — AI-Guided Interactive Corner Marking
   ============================================================
   
   THE RIGHT WAY: AI proposes, human confirms.
   
   WORKFLOW:
   ─────────
   1. AI scans the video for the FIRST corner transition
   2. Video PAUSES at the proposed braking point
   3. User uses ◀ ▶ frame-step to fine-tune
   4. User clicks ✓ to confirm the brake marker
   5. AI seeks forward to the proposed apex, PAUSES again
   6. User confirms or adjusts → ✓
   7. AI seeks to proposed exit → user confirms
   8. Corner saved. AI moves to next corner.
   9. Repeat until the full lap is marked.
   
   DETECTION METHOD:
   ─────────────────
   Instead of classifying isolated frames, we send GPT-4o
   a SHORT VIDEO CLIP (5-10 frames spanning ~3-5 seconds)
   and ask: "Is a corner transition happening in this clip?
   If so, which frame is the braking/apex/exit point?"
   
   This gives the AI TEMPORAL CONTEXT — it can see the 
   progression from straight to corner.
   ============================================================ */

const CornerWizard = {

    // ── Configuration ────────────────────────────────────────
    config: {
        fps: 30,                   // Assumed video frame rate
        clipDurationSec: 4,        // Seconds per analysis clip
        clipFrameCount: 8,         // Frames to extract per clip
        scanStepSec: 2,            // How far to jump when scanning for next event
        imageSize: 640,            // Frame size for AI
        imageQuality: 0.7,
        model: 'gemini-2.5-flash',   // Now uses Gemini instead of GPT-4o
        cvEnabled: true,           // Enable CV signal computation
    },

    // ── State ────────────────────────────────────────────────
    _video: null,
    _canvas: null,
    _ctx: null,
    _overlay: null,              // The wizard UI overlay
    _startTime: 0,
    _endTime: 0,
    _currentTime: 0,

    // Corner building
    _corners: [],                // Completed corners
    _currentCorner: null,        // Corner being built { number, brake, apex, exit }
    _currentPhase: 'idle',       // idle, scanning, proposing_brake, proposing_apex, proposing_exit, done
    _cornerNumber: 0,

    // Track map
    _trackMapDataUrl: null,

    // Callbacks
    _onUpdate: null,             // (state) => {} — called on every state change
    _onComplete: null,           // (corners) => {} — called when all corners marked

    // Frame stepping
    _frameDuration: 1 / 30,      // Will be recalculated


    // ==========================================================
    //  PUBLIC API
    // ==========================================================

    /**
     * Initialize the corner wizard.
     * @param {HTMLVideoElement} video
     * @param {HTMLCanvasElement} previewCanvas — for showing the current frame
     * @param {number} startTime — lap start
     * @param {number} endTime — lap end
     * @param {string|null} trackMapUrl — optional track map
     * @param {Function} onUpdate — (state) => {} called on state changes
     * @param {Function} onComplete — (corners) => {} when done
     */
    async init(video, previewCanvas, startTime, endTime, trackMapUrl, onUpdate, onComplete) {
        this._video = video;
        this._canvas = previewCanvas;
        this._ctx = previewCanvas.getContext('2d');
        this._startTime = startTime;
        this._endTime = endTime;
        this._currentTime = startTime;
        this._corners = [];
        this._currentCorner = null;
        this._cornerNumber = 0;
        this._currentPhase = 'idle';
        this._onUpdate = onUpdate || (() => { });
        this._onComplete = onComplete || (() => { });

        // Calculate frame duration from video if possible
        this._frameDuration = 1 / this.config.fps;

        // Size canvas
        previewCanvas.width = video.videoWidth || 1280;
        previewCanvas.height = video.videoHeight || 720;

        // Load track map
        if (trackMapUrl) {
            await this._loadTrackMap(trackMapUrl);
        }

        this._seekAndDraw(startTime);
        this._emitState('Ready — Press "Scan for Corners" to begin');
    },

    /**
     * Start scanning for the next corner.
     */
    async scanForNextCorner() {
        if (!AIEngine.isConfigured()) {
            this._emitState('⚠ Set OpenAI API key in Settings first');
            return;
        }

        this._currentPhase = 'scanning';
        this._cornerNumber++;
        this._currentCorner = {
            number: this._cornerNumber,
            brake: null,
            apex: null,
            exit: null,
            direction: null,
            severity: null,
            name: `Corner ${this._cornerNumber}`,
        };

        this._emitState(`Scanning for Corner ${this._cornerNumber}...`);

        // Scan forward from current position looking for a corner transition
        let scanTime = this._currentTime;
        let found = false;

        while (scanTime < this._endTime - 2) {
            this._emitState(`Scanning at ${this._formatTime(scanTime)}...`);

            // Extract a clip of frames around this time
            const clip = await this._extractClip(scanTime, this.config.clipDurationSec);

            // Ask AI: "Is there a corner transition in this clip?"
            const result = await this._analyzeClipForTransition(clip, 'braking');

            if (result.found) {
                // AI found a braking zone! Seek to the proposed time
                const proposedTime = scanTime + (result.frameIndex / this.config.clipFrameCount) * this.config.clipDurationSec;
                this._currentTime = proposedTime;
                this._currentPhase = 'proposing_brake';
                this._currentCorner.direction = result.direction || null;
                this._currentCorner.severity = result.severity || null;
                await this._seekAndDraw(proposedTime);

                this._emitState(`🎯 AI proposes BRAKE POINT at ${this._formatTime(proposedTime)} — ${result.direction || ''} ${result.severity || ''}\n"${result.notes}"\n\nUse ◀ ▶ to fine-tune, then click ✓ Confirm`);
                found = true;
                break;
            }

            // Not found — advance and try again
            scanTime += this.config.scanStepSec;
        }

        if (!found) {
            this._currentPhase = 'done';
            this._cornerNumber--;
            this._emitState(`✅ No more corners found — ${this._corners.length} total corners marked`);
            this._onComplete(this._corners);
        }
    },

    /**
     * Confirm the current proposed marker (brake, apex, or exit).
     */
    async confirmMarker() {
        const time = this._video.currentTime;

        if (this._currentPhase === 'proposing_brake') {
            this._currentCorner.brake = {
                time: time,
                confirmed: true,
            };
            this._emitState(`✓ Brake point CONFIRMED at ${this._formatTime(time)}\nScanning for apex...`);

            // Now scan for apex (starting from brake time)
            this._currentPhase = 'scanning';
            await this._scanForPhase('apex', time + 0.5);

        } else if (this._currentPhase === 'proposing_apex') {
            this._currentCorner.apex = {
                time: time,
                confirmed: true,
            };
            this._emitState(`✓ Apex CONFIRMED at ${this._formatTime(time)}\nScanning for exit...`);

            // Now scan for exit
            this._currentPhase = 'scanning';
            await this._scanForPhase('exit', time + 0.3);

        } else if (this._currentPhase === 'proposing_exit') {
            this._currentCorner.exit = {
                time: time,
                confirmed: true,
            };

            // Corner complete!
            this._corners.push({ ...this._currentCorner });
            this._currentTime = time + 0.5;
            this._currentPhase = 'idle';

            this._emitState(`✅ Corner ${this._currentCorner.number} complete! (${this._currentCorner.direction || ''} ${this._currentCorner.severity || ''})\n${this._corners.length} corners marked total.\n\nClick "Scan for Next Corner" to continue, or "Finish" if done.`);
        }
    },

    /**
     * Skip this marker (can't find it or doesn't apply).
     */
    async skipMarker() {
        if (this._currentPhase === 'proposing_brake') {
            // Skip this detection — advance past it
            this._currentTime += this.config.scanStepSec;
            this._currentPhase = 'idle';
            this._cornerNumber--;
            this._emitState(`Skipped — will continue scanning from ${this._formatTime(this._currentTime)}`);

        } else if (this._currentPhase === 'proposing_apex') {
            // No clear apex — mark it as the midpoint between brake and current time
            this._currentCorner.apex = {
                time: (this._currentCorner.brake.time + this._video.currentTime) / 2,
                confirmed: false,
            };
            this._emitState('Apex skipped — scanning for exit...');
            this._currentPhase = 'scanning';
            await this._scanForPhase('exit', this._video.currentTime);

        } else if (this._currentPhase === 'proposing_exit') {
            // No clear exit — use current time
            this._currentCorner.exit = {
                time: this._video.currentTime,
                confirmed: false,
            };
            this._corners.push({ ...this._currentCorner });
            this._currentTime = this._video.currentTime + 0.5;
            this._currentPhase = 'idle';
            this._emitState(`Corner ${this._currentCorner.number} saved (exit estimated).\nClick "Scan for Next Corner" to continue.`);
        }
    },

    /**
     * Manually mark the current frame as a specific marker type.
     * This bypasses AI — the user just clicks when THEY see it.
     */
    async manualMark(markerType) {
        const time = this._video.currentTime;

        if (!this._currentCorner) {
            this._cornerNumber++;
            this._currentCorner = {
                number: this._cornerNumber,
                brake: null, apex: null, exit: null,
                direction: null, severity: null,
                name: `Corner ${this._cornerNumber}`,
            };
        }

        if (markerType === 'brake') {
            this._currentCorner.brake = { time, confirmed: true };
            this._currentPhase = 'proposing_apex';
            this._emitState(`Brake marked at ${this._formatTime(time)}. Now seek to APEX and click ✓ or use AI scan.`);

        } else if (markerType === 'apex') {
            this._currentCorner.apex = { time, confirmed: true };
            this._currentPhase = 'proposing_exit';
            this._emitState(`Apex marked at ${this._formatTime(time)}. Now seek to EXIT and click ✓.`);

        } else if (markerType === 'exit') {
            this._currentCorner.exit = { time, confirmed: true };
            this._corners.push({ ...this._currentCorner });
            this._currentTime = time + 0.5;
            this._currentCorner = null;
            this._currentPhase = 'idle';
            this._emitState(`✅ Corner ${this._corners.length} complete!\nClick "Scan" or manually mark the next corner.`);
        }
    },

    /**
     * Step one frame forward.
     */
    stepForward() {
        const newTime = Math.min(this._video.currentTime + this._frameDuration, this._endTime);
        this._seekAndDraw(newTime);
    },

    /**
     * Step one frame backward.
     */
    stepBackward() {
        const newTime = Math.max(this._video.currentTime - this._frameDuration, this._startTime);
        this._seekAndDraw(newTime);
    },

    /**
     * Step multiple frames forward.
     */
    stepForwardMulti(frames = 5) {
        const newTime = Math.min(this._video.currentTime + this._frameDuration * frames, this._endTime);
        this._seekAndDraw(newTime);
    },

    /**
     * Step multiple frames backward.
     */
    stepBackwardMulti(frames = 5) {
        const newTime = Math.max(this._video.currentTime - this._frameDuration * frames, this._startTime);
        this._seekAndDraw(newTime);
    },

    /**
     * Play the video at slow speed from current position.
     */
    playSlowFromHere() {
        this._video.playbackRate = 0.25;
        this._video.play();
        this._drawLoop();
    },

    /**
     * Pause the video.
     */
    pause() {
        this._video.pause();
    },

    /**
     * Get the current state for UI rendering.
     */
    getState() {
        return {
            phase: this._currentPhase,
            currentTime: this._video ? this._video.currentTime : 0,
            cornerNumber: this._cornerNumber,
            currentCorner: this._currentCorner,
            completedCorners: [...this._corners],
            totalCorners: this._corners.length,
            lapProgress: this._video ?
                (this._video.currentTime - this._startTime) / (this._endTime - this._startTime) : 0,
        };
    },

    /**
     * Get all completed corners.
     */
    getCorners() {
        return [...this._corners];
    },

    /**
     * Finish marking — finalize and return all corners.
     */
    finish() {
        // If there's a partial corner in progress, save it
        if (this._currentCorner && (this._currentCorner.brake || this._currentCorner.apex)) {
            if (!this._currentCorner.exit) {
                this._currentCorner.exit = {
                    time: this._currentCorner.apex ? this._currentCorner.apex.time + 1 : this._video.currentTime,
                    confirmed: false,
                };
            }
            this._corners.push(this._currentCorner);
        }

        this._currentPhase = 'done';
        this._emitState(`✅ Marking complete — ${this._corners.length} corners`);
        this._onComplete(this._corners);
        return this._corners;
    },


    // ==========================================================
    //  INTERNAL: SCAN FOR A SPECIFIC PHASE
    // ==========================================================

    async _scanForPhase(phase, fromTime) {
        let scanTime = fromTime;
        const maxScanTime = phase === 'apex' ? fromTime + 8 : fromTime + 12; // Don't look too far

        while (scanTime < Math.min(maxScanTime, this._endTime)) {
            const clip = await this._extractClip(scanTime, phase === 'exit' ? 3 : 2.5);
            const result = await this._analyzeClipForTransition(clip, phase);

            if (result.found) {
                const proposedTime = scanTime + (result.frameIndex / this.config.clipFrameCount) * (phase === 'exit' ? 3 : 2.5);
                await this._seekAndDraw(proposedTime);

                const phaseLabel = phase === 'apex' ? '◎ APEX' : '➡ EXIT';
                this._currentPhase = `proposing_${phase}`;
                this._emitState(`${phaseLabel} proposed at ${this._formatTime(proposedTime)}\n"${result.notes}"\n\nUse ◀ ▶ to adjust, then ✓ Confirm`);
                return;
            }

            scanTime += 1.0; // Smaller steps when looking for apex/exit
        }

        // Not found — propose the current position
        await this._seekAndDraw(scanTime);
        this._currentPhase = `proposing_${phase}`;
        const phaseLabel = phase === 'apex' ? '◎ APEX' : '➡ EXIT';
        this._emitState(`${phaseLabel} — AI couldn't pinpoint it. Review the video and position manually.\nUse ◀ ▶, then ✓ Confirm`);
    },


    // ==========================================================
    //  FRAME EXTRACTION (SHORT CLIP)
    // ==========================================================

    async _extractClip(startTime, durationSec) {
        const tempCanvas = document.createElement('canvas');
        const aspectRatio = this._video.videoHeight / this._video.videoWidth;
        tempCanvas.width = this.config.imageSize;
        tempCanvas.height = Math.round(this.config.imageSize * aspectRatio);
        const tempCtx = tempCanvas.getContext('2d');
        const w = tempCanvas.width, h = tempCanvas.height;

        const frames = [];
        const interval = durationSec / this.config.clipFrameCount;
        let prevPixels = null;

        for (let i = 0; i < this.config.clipFrameCount; i++) {
            const time = startTime + i * interval;
            if (time > this._endTime) break;

            this._video.currentTime = time;
            await new Promise(res => {
                this._video.onseeked = res;
                setTimeout(res, 200);
            });

            tempCtx.drawImage(this._video, 0, 0, w, h);
            const dataUrl = tempCanvas.toDataURL('image/jpeg', this.config.imageQuality);

            // ── CV Signal Computation ──────────────────────
            let motionScore = 0, horizonPos = 0.5, kerbScore = 0;
            if (this.config.cvEnabled) {
                const imgData = tempCtx.getImageData(0, 0, w, h);
                const pixels = imgData.data;

                // Motion Score: pixel difference from previous frame
                if (prevPixels) {
                    motionScore = this._cvMotionScore(prevPixels, pixels, w, h);
                }

                // Horizon Position: brightness gradient to detect nose pitch
                horizonPos = this._cvHorizonPosition(pixels, w, h);

                // Kerb Detection: red/white pattern near frame edges
                kerbScore = this._cvKerbDetection(pixels, w, h);

                // Store current pixels for next frame's diff
                prevPixels = new Uint8ClampedArray(pixels);
            }

            frames.push({
                index: i,
                time: time,
                dataUrl: dataUrl,
                cv: { motionScore: Math.round(motionScore * 10) / 10, horizonPos: Math.round(horizonPos * 1000) / 1000, kerbScore: Math.round(kerbScore * 1000) / 1000 },
            });
        }

        // Log CV data for debugging
        if (this.config.cvEnabled && frames.length > 0) {
            const motions = frames.map(f => f.cv.motionScore);
            const horizons = frames.map(f => f.cv.horizonPos);
            const kerbs = frames.map(f => f.cv.kerbScore);
            console.log(`[CV] Motion: [${motions.join(', ')}]  Horizon: [${horizons.join(', ')}]  Kerb: [${kerbs.join(', ')}]`);
        }

        return frames;
    },


    // ==========================================================
    //  AI ANALYSIS: CLIP-BASED TRANSITION DETECTION
    // ==========================================================

    async _analyzeClipForTransition(clipFrames, lookingFor) {
        if (clipFrames.length === 0) return { found: false };

        const timeRange = `${this._formatTime(clipFrames[0].time)} to ${this._formatTime(clipFrames[clipFrames.length - 1].time)}`;

        // ── Build CV signal summary for prompt ──────────────
        let cvContext = '';
        if (this.config.cvEnabled && clipFrames[0].cv) {
            const motions = clipFrames.map(f => f.cv.motionScore);
            const horizons = clipFrames.map(f => f.cv.horizonPos);
            const kerbs = clipFrames.map(f => f.cv.kerbScore);

            // Compute trends
            const motionTrend = motions.length > 1 ? motions[motions.length - 1] - motions[0] : 0;
            const horizonTrend = horizons.length > 1 ? horizons[horizons.length - 1] - horizons[0] : 0;
            const peakKerb = Math.max(...kerbs);
            const peakKerbIdx = kerbs.indexOf(peakKerb);

            cvContext = `\n\nCOMPUTER VISION SIGNAL DATA (measured from pixels):
- Motion Score per frame (0=still, higher=faster): [${motions.join(', ')}]
  Trend: ${motionTrend < -1 ? 'DECREASING (vehicle decelerating/braking)' : motionTrend > 1 ? 'INCREASING (vehicle accelerating)' : 'STABLE'}
- Horizon Position per frame (0=top, 0.5=middle, 1=bottom): [${horizons.join(', ')}]
  Trend: ${horizonTrend < -0.01 ? 'RISING (nose dipping = braking)' : horizonTrend > 0.01 ? 'DROPPING (nose lifting = acceleration)' : 'STABLE'}
- Kerb Detection per frame (0=none, >0.1=kerb visible at edge): [${kerbs.join(', ')}]
  Peak: ${peakKerb.toFixed(3)} at frame ${peakKerbIdx}${peakKerb > 0.08 ? ' — KERB DETECTED (possible apex zone)' : ''}

Use these signals to CONFIRM or REJECT what you see in the images. The motion score is the most reliable indicator of braking (sharp decrease) and acceleration (sharp increase).`;
        }

        const phaseDescriptions = {
            braking: `You are looking for the moment the vehicle BEGINS BRAKING for a corner.
Signs: track starts curving ahead, braking marker boards (200m/100m), horizon begins to drop (nose dive), 
the vehicle is decelerating. The scenery ahead transitions from straight to a visible curve.
If the entire clip shows a straight road with no upcoming corner, respond with found: false.

CV SIGNAL HINT: A motion score that drops by 30%+ across frames confirms braking. A rising horizon confirms nose-dip. Use these signals.`,

            apex: `You are looking for the APEX — the tightest point of the corner.
Signs: maximum steering angle or lean, vehicle is closest to the inside kerb/curb,
the horizon is most tilted (for bikes), track is at its tightest curvature.
The inside kerb should be right next to the camera.

CV SIGNAL HINT: A peak in kerb detection score confirms the inside kerb is visible. The apex is at the frame with highest kerb score AND lowest motion score. Use these signals.`,

            exit: `You are looking for the CORNER EXIT — where the vehicle straightens up.
Signs: steering returning to center, horizon leveling, inside kerb receding behind,
track opens up ahead, vehicle beginning to accelerate. The road ahead looks straighter.

CV SIGNAL HINT: An increasing motion score confirms acceleration. A dropping horizon confirms the nose is lifting. Kerb score should be decreasing as the kerb recedes. Use these signals.`,
        };

        const content = [];
        content.push({
            type: 'text',
            text: `You are analyzing a sequence of ${clipFrames.length} frames from a racing onboard video, 
spanning ${timeRange}.${cvContext}

${phaseDescriptions[lookingFor]}

These ${clipFrames.length} frames are in chronological order, evenly spaced across the clip.

Respond with ONLY valid JSON:
{
  "found": true/false,
  "frameIndex": 0-${clipFrames.length - 1} (which frame best matches the ${lookingFor} point),
  "confidence": 0.0-1.0,
  "direction": "left" | "right" | "unknown",
  "severity": "hairpin" | "medium" | "fast_sweeper" | "kink",
  "notes": "brief description of what you see AND how the CV signals confirm it"
}`
        });

        // Add track map context if available
        if (this._trackMapDataUrl) {
            content.push({
                type: 'text',
                text: 'Track map for reference:'
            });
            content.push({
                type: 'image_url',
                image_url: { url: this._trackMapDataUrl, detail: 'low' }
            });
        }

        // Add clip frames
        for (const frame of clipFrames) {
            content.push({
                type: 'image_url',
                image_url: { url: frame.dataUrl, detail: 'low' }
            });
        }

        try {
            // Build Gemini-compatible parts from the content array
            const parts = [];
            for (const item of content) {
                if (item.type === 'text') {
                    parts.push({ text: item.text });
                } else if (item.type === 'image_url' && item.image_url?.url) {
                    // Convert data URL to Gemini inlineData format
                    const dataUrl = item.image_url.url;
                    if (dataUrl.startsWith('data:')) {
                        const base64 = dataUrl.split(',')[1];
                        const mimeType = dataUrl.split(';')[0].split(':')[1];
                        parts.push({
                            inlineData: { mimeType, data: base64 }
                        });
                    }
                }
            }

            const geminiModel = AIEngine.geminiModel || this.config.model;
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${AIEngine.geminiApiKey || AIEngine.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 512,
                        responseMimeType: 'application/json'
                    }
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('[CornerWizard] Gemini API error:', err);
                return { found: false, notes: err.error?.message || 'API error' };
            }

            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return { found: false, notes: 'Empty response' };
            return JSON.parse(text);
        } catch (err) {
            console.error('[CornerWizard] Analysis error:', err);
            return { found: false, notes: err.message };
        }
    },


    // ==========================================================
    //  TRACK MAP
    // ==========================================================

    async _loadTrackMap(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                const scale = Math.min(400 / img.width, 400 / img.height);
                c.width = Math.round(img.width * scale);
                c.height = Math.round(img.height * scale);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                this._trackMapDataUrl = c.toDataURL('image/jpeg', 0.7);
                resolve();
            };
            img.onerror = () => { this._trackMapDataUrl = null; resolve(); };
            img.src = url;
        });
    },


    // ==========================================================
    //  VIDEO DISPLAY
    // ==========================================================

    async _seekAndDraw(time) {
        this._video.currentTime = time;
        await new Promise(res => {
            this._video.onseeked = res;
            setTimeout(res, 300);
        });
        this._drawCurrentFrame();
    },

    _drawCurrentFrame() {
        if (!this._video || !this._ctx) return;
        this._ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);

        // Draw time indicator
        const time = this._video.currentTime;
        const w = this._canvas.width;

        this._ctx.font = 'bold 20px monospace';
        this._ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this._ctx.fillRect(w - 130, 8, 122, 30);
        this._ctx.fillStyle = '#00f0ff';
        this._ctx.textAlign = 'right';
        this._ctx.textBaseline = 'top';
        this._ctx.fillText(this._formatTime(time), w - 16, 14);
        this._ctx.textAlign = 'left';

        // Draw lap progress bar
        const progress = (time - this._startTime) / (this._endTime - this._startTime);
        this._ctx.fillStyle = 'rgba(0,0,0,0.4)';
        this._ctx.fillRect(0, this._canvas.height - 6, w, 6);
        this._ctx.fillStyle = '#00f0ff';
        this._ctx.fillRect(0, this._canvas.height - 6, w * progress, 6);

        // Draw markers for completed corners on progress bar
        for (const corner of this._corners) {
            const markers = [corner.brake, corner.apex, corner.exit].filter(Boolean);
            for (const m of markers) {
                const x = ((m.time - this._startTime) / (this._endTime - this._startTime)) * w;
                this._ctx.fillStyle = m === corner.brake ? '#ff6b35' : m === corner.apex ? '#00f0ff' : '#10b981';
                this._ctx.fillRect(x - 2, this._canvas.height - 10, 4, 10);
            }
        }

        // Draw current corner markers if in progress
        if (this._currentCorner) {
            const markers = [
                { m: this._currentCorner.brake, color: '#ff6b35', label: 'BRK' },
                { m: this._currentCorner.apex, color: '#00f0ff', label: 'APX' },
                { m: this._currentCorner.exit, color: '#10b981', label: 'EXT' },
            ];
            for (const { m, color, label } of markers) {
                if (m) {
                    const x = ((m.time - this._startTime) / (this._endTime - this._startTime)) * w;
                    this._ctx.fillStyle = color;
                    this._ctx.fillRect(x - 2, this._canvas.height - 14, 4, 14);
                    this._ctx.font = 'bold 11px sans-serif';
                    this._ctx.textAlign = 'center';
                    this._ctx.fillText(label, x, this._canvas.height - 18);
                    this._ctx.textAlign = 'left';
                }
            }
        }
    },

    _drawLoop() {
        if (this._video.paused) return;
        this._drawCurrentFrame();
        requestAnimationFrame(() => this._drawLoop());
    },


    // ==========================================================
    //  STATE EMISSION
    // ==========================================================

    _emitState(message) {
        const state = this.getState();
        state.message = message;
        this._onUpdate(state);
        console.log(`[CornerWizard] ${message.split('\n')[0]}`);
    },


    // ==========================================================
    //  UTILITY
    // ==========================================================

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toFixed(2);
        return `${m}:${s.padStart(5, '0')}`;
    },


    // ==========================================================
    //  COMPUTER VISION SIGNAL ENGINE
    //  3 lightweight detectors — zero dependencies
    // ==========================================================

    /**
     * CV Detector 1: Pixel Motion Score
     * Compares two consecutive frames to estimate relative speed.
     * High score = fast motion (straight), low/dropping = braking.
     * @returns {number} 0-100 normalised motion magnitude
     */
    _cvMotionScore(prevPixels, currPixels, width, height) {
        let totalDiff = 0;
        let sampledPixels = 0;
        const step = 16; // Sample every 4th pixel (RGBA = 4 channels × 4 skip)
        const len = Math.min(prevPixels.length, currPixels.length);

        for (let i = 0; i < len; i += step) {
            const dr = Math.abs(currPixels[i] - prevPixels[i]);
            const dg = Math.abs(currPixels[i + 1] - prevPixels[i + 1]);
            const db = Math.abs(currPixels[i + 2] - prevPixels[i + 2]);
            totalDiff += dr + dg + db;
            sampledPixels++;
        }

        if (sampledPixels === 0) return 0;
        // Normalise: max possible diff per sample = 765 (255×3)
        return (totalDiff / (sampledPixels * 765)) * 100;
    },

    /**
     * CV Detector 2: Horizon Position
     * Samples vertical brightness gradient at centre of frame.
     * When car brakes: nose dips → horizon rises in frame (lower Y value).
     * When car accelerates: nose lifts → horizon drops (higher Y value).
     * @returns {number} 0-1 where 0=top of frame, 1=bottom
     */
    _cvHorizonPosition(pixels, width, height) {
        // Sample 5 vertical columns across the mid-section of the frame
        const columns = [0.3, 0.4, 0.5, 0.6, 0.7].map(pct => Math.floor(width * pct));
        let bestY = height / 2;
        let maxGradient = 0;

        for (const cx of columns) {
            let prevLum = 0;
            for (let y = Math.floor(height * 0.15); y < Math.floor(height * 0.75); y += 2) {
                const idx = (y * width + cx) * 4;
                const lum = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
                const gradient = Math.abs(lum - prevLum);
                if (gradient > maxGradient) {
                    maxGradient = gradient;
                    bestY = y;
                }
                prevLum = lum;
            }
        }

        return bestY / height;
    },

    /**
     * CV Detector 3: Kerb Colour Detection
     * Scans bottom-left and bottom-right edges for red/white or blue/yellow kerb patterns.
     * High score near frame edges = vehicle is close to the inside kerb = near apex.
     * @returns {number} 0-1 confidence that kerb is visible
     */
    _cvKerbDetection(pixels, width, height) {
        let kerbPixels = 0, totalSampled = 0;

        // Scan 4 edge zones: bottom-left, bottom-right, mid-left, mid-right
        const zones = [
            { x0: 0, x1: width * 0.12, y0: height * 0.65, y1: height * 0.95 },      // bottom-left
            { x0: width * 0.88, x1: width, y0: height * 0.65, y1: height * 0.95 },   // bottom-right
            { x0: 0, x1: width * 0.08, y0: height * 0.4, y1: height * 0.65 },        // mid-left
            { x0: width * 0.92, x1: width, y0: height * 0.4, y1: height * 0.65 },    // mid-right
        ];

        for (const z of zones) {
            for (let y = Math.floor(z.y0); y < Math.floor(z.y1); y += 4) {
                for (let x = Math.floor(z.x0); x < Math.floor(z.x1); x += 4) {
                    const idx = (y * width + x) * 4;
                    const r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];

                    // Red kerb: high R, low G, low B
                    const isRed = r > 140 && g < 90 && b < 90;
                    // White stripe: all channels high
                    const isWhite = r > 190 && g > 190 && b > 190;
                    // Blue kerb: low R, low G, high B
                    const isBlue = r < 100 && g < 100 && b > 140;
                    // Yellow kerb: high R, high G, low B
                    const isYellow = r > 160 && g > 140 && b < 80;

                    if (isRed || isWhite || isBlue || isYellow) kerbPixels++;
                    totalSampled++;
                }
            }
        }

        return totalSampled > 0 ? kerbPixels / totalSampled : 0;
    },
};
