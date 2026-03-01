/* ============================================================
   LAP-ANALYZER.JS — AI Video Analysis Engine
   ============================================================
   
   Analyzes onboard racing lap video using computer vision to
   detect braking points, apexes, and corner exits from:
   
   1. Camera pitch changes (horizon line shift)
   2. Camera roll changes (horizon tilt)
   3. Optical flow divergence (speed/deceleration proxy)
   4. Track boundary analysis (curb proximity)
   
   Implements BIDIRECTIONAL processing:
   - Forward pass: chronological event detection
   - Reverse pass: backward validation & cross-referencing
   - Fusion: confident detections from both passes
   
   Based on: Manus AI Research — AI-Assisted Motorsport Lap
   Analysis: Reverse Processing, Marker Recognition, and
   Track Mastery (February 2026)
   ============================================================ */

const LapAnalyzer = {

    // ── Configuration ───────────────────────────────────────
    config: {
        sampleRate: 10,           // Frames per second to analyze
        horizonBand: [0.25, 0.55], // Vertical band to search for horizon (% of frame height)
        edgeThreshold: 30,        // Canny edge threshold for horizon detection
        pitchSmoothWindow: 5,     // Frames for smoothing pitch signal
        rollSmoothWindow: 5,      // Frames for smoothing roll signal
        flowBlockSize: 16,        // Block size for optical flow (px)
        flowSearchRadius: 8,      // Search radius for block matching (px)
        brakeThreshold: 0.025,    // Pitch rate threshold for braking detection (raised)
        apexRollThreshold: 0.6,   // Roll magnitude threshold for apex
        exitPitchRise: 0.008,     // Pitch rise rate for exit detection
        minCornerDuration: 1.0,   // Min seconds for a valid corner (raised from 0.8)
        minStraightDuration: 1.0, // Min seconds between corners (raised from 0.5)
        confidenceThreshold: 0.5, // Min confidence to accept a detection
        minSteeringMagnitude: 0.15, // Minimum absolute steering to trigger corner entry
        reverseWeight: 0.7,       // Weight of reverse pass (PRIMARY)
        forwardWeight: 0.3,       // Weight of forward pass (VALIDATION)
        firstSightLeadTime: 1.5,  // Seconds before brake that braking marker becomes visible
        speedSmoothWindow: 7,     // Frames for smoothing speed signal
    },

    // ── State ────────────────────────────────────────────────
    isAnalyzing: false,
    progress: 0,
    frameData: [],          // Per-frame: { time, horizonY, horizonAngle, flowMagnitude, lateralFlow, pitchRate, rollRate, speedProxy }
    reverseEvents: [],      // Events from reverse pass (PRIMARY)
    forwardEvents: [],      // Events from forward pass (VALIDATION)
    fusedEvents: [],        // Final fused detections
    cornerSequences: [],    // Grouped: { firstSight, brake, apex, exit, confidence, cornerType }
    trackMapImage: null,    // Optional uploaded track map
    _trackMapCorners: [],   // Corners extracted from track map analysis

    // ── Canvas for frame extraction ─────────────────────────
    _canvas: null,
    _ctx: null,
    _prevGray: null,

    // ==========================================================
    //  PUBLIC API
    // ==========================================================

    /**
     * Run full reverse-first analysis on a video element.
     * Methodology:
     *   1. Extract frames & compute signals
     *   2. REVERSE PASS (primary) — detect Exit → Apex → Brake → First Sight
     *   3. FORWARD PASS (validation) — confirm markers
     *   4. FUSION — bidirectional cross-reference
     *   5. GROUPING — organize into corner sequences
     *   6. TRACK MAP VALIDATION — check corner count vs map
     */
    async analyze(video, startTime, endTime, onProgress) {
        if (this.isAnalyzing) throw new Error('Analysis already running');
        this.isAnalyzing = true;
        this.progress = 0;
        this.frameData = [];
        this.forwardEvents = [];
        this.reverseEvents = [];
        this.fusedEvents = [];
        this.cornerSequences = [];
        this._prevGray = null;

        const report = (p, msg) => {
            this.progress = p;
            if (onProgress) onProgress(p, msg);
        };

        try {
            // ── Setup canvas ────────────────────────────────
            const w = Math.min(video.videoWidth, 640);  // Downsample for speed
            const h = Math.round(w * (video.videoHeight / video.videoWidth));
            this._canvas = document.createElement('canvas');
            this._canvas.width = w;
            this._canvas.height = h;
            this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

            const duration = endTime - startTime;
            const totalFrames = Math.floor(duration * this.config.sampleRate);
            const frameInterval = 1 / this.config.sampleRate;

            // ══════════════════════════════════════════════════
            //  PHASE 1: Frame Extraction & Signal Computation
            // ══════════════════════════════════════════════════
            report(0.01, `Phase 1/5 — Extracting ${totalFrames} frames...`);

            for (let i = 0; i < totalFrames; i++) {
                const time = startTime + (i * frameInterval);
                await this._seekVideo(video, time);

                // Draw frame to canvas
                this._ctx.drawImage(video, 0, 0, w, h);
                const imageData = this._ctx.getImageData(0, 0, w, h);
                const gray = this._toGrayscale(imageData);

                // Compute per-frame signals
                const horizon = this._detectHorizon(gray, w, h);
                const flow = this._prevGray ?
                    this._computeOpticalFlow(this._prevGray, gray, w, h) :
                    { magnitude: 0, angle: 0, divergence: 0 };

                // Compute lateral flow (left/right image movement = steering proxy)
                const lateralFlow = this._prevGray ?
                    this._computeLateralFlow(this._prevGray, gray, w, h) : 0;

                this.frameData.push({
                    index: i,
                    time: time,
                    relTime: time - startTime,
                    horizonY: horizon.y,
                    horizonAngle: horizon.angle,
                    horizonConfidence: horizon.confidence,
                    flowMagnitude: flow.magnitude,     // Speed proxy
                    flowDivergence: flow.divergence,
                    lateralFlow: lateralFlow,          // Steering proxy (+ = right, - = left)
                    pitchRate: 0,
                    rollRate: 0,
                    speedProxy: flow.magnitude,        // Will be smoothed
                    steeringProxy: 0,                  // Computed from roll + lateral flow
                });

                this._prevGray = gray;
                report(0.01 + (i / totalFrames) * 0.39, `Phase 1/5 — Frame ${i + 1}/${totalFrames}`);

                if (i % 5 === 0) await this._yieldThread();
            }

            // ══════════════════════════════════════════════════
            //  PHASE 2: Signal Processing & Enhancement
            // ══════════════════════════════════════════════════
            report(0.41, 'Phase 2/5 — Processing signals...');

            this._computeRates();
            this._smoothSignals();
            this._computeSteeringProxy();  // Combine roll + lateral flow
            this._smoothSpeed();            // Extra smoothing on speed signal

            // ══════════════════════════════════════════════════
            //  PHASE 2B: TRACK MAP ANALYSIS
            //  Extract corner positions from uploaded track map
            //  This acts as a SPATIAL PRIOR for the detection passes
            // ══════════════════════════════════════════════════
            if (this.trackMapImage) {
                report(0.43, 'Analyzing track map for corner positions...');
                await this._analyzeTrackMap();
                if (this._trackMapCorners.length > 0) {
                    report(0.44, `Track map: ${this._trackMapCorners.length} corners identified`);
                    console.log(`[LapAnalyzer] Track map spatial prior: expecting ~${this._trackMapCorners.length} corners`);
                }
            }

            // ══════════════════════════════════════════════════
            //  PHASE 3: REVERSE PASS (PRIMARY)
            //  Running the clip backwards to detect:
            //  Exit → Apex → Brake → First Sight
            // ══════════════════════════════════════════════════
            report(0.45, 'Phase 3/5 — Reverse pass (primary detection)...');

            const reversedFrames = [...this.frameData].reverse();
            this.reverseEvents = await this._detectEventsReverse(reversedFrames);
            // Sort back to chronological order
            this.reverseEvents.sort((a, b) => a.time - b.time);
            report(0.60, `Reverse pass: ${this.reverseEvents.length} events detected`);

            // ══════════════════════════════════════════════════
            //  PHASE 4: FORWARD PASS (VALIDATION)
            //  Confirm reverse-detected markers
            // ══════════════════════════════════════════════════
            report(0.62, 'Phase 4/5 — Forward pass validation...');

            this.forwardEvents = await this._detectEventsForward(this.frameData);
            report(0.75, `Forward pass: ${this.forwardEvents.length} events detected`);

            // ══════════════════════════════════════════════════
            //  FUSION: Bidirectional Cross-Reference
            //  Reverse pass is PRIMARY (0.7), forward VALIDATES (0.3)
            // ══════════════════════════════════════════════════
            report(0.77, 'Phase 5/5 — Fusing bidirectional results...');

            this.fusedEvents = this._fuseEvents(this.reverseEvents, this.forwardEvents, frameInterval);

            // ══════════════════════════════════════════════════
            //  GROUPING: Organize into Corner Sequences
            // ══════════════════════════════════════════════════
            report(0.88, 'Grouping corner sequences...');

            this.cornerSequences = this._groupCorners(this.fusedEvents);

            // ══════════════════════════════════════════════════
            //  TRACK MAP VALIDATION
            // ══════════════════════════════════════════════════
            if (this.trackMapImage) {
                report(0.93, 'Cross-referencing track map...');
                this._validateWithTrackMap();
            }

            report(1.0, `Analysis complete — ${this.cornerSequences.length} corners detected`);

            return {
                frameData: this.frameData,
                reverseEvents: this.reverseEvents,
                forwardEvents: this.forwardEvents,
                fusedEvents: this.fusedEvents,
                corners: this.cornerSequences,
                meta: {
                    totalFrames,
                    duration,
                    sampleRate: this.config.sampleRate,
                    videoWidth: w,
                    videoHeight: h,
                    methodology: 'reverse-first',
                    reverseWeight: this.config.reverseWeight,
                    forwardWeight: this.config.forwardWeight,
                }
            };
        } finally {
            this.isAnalyzing = false;
        }
    },


    // ==========================================================
    //  FRAME PROCESSING
    // ==========================================================

    /** Convert ImageData to flat grayscale Uint8Array */
    _toGrayscale(imageData) {
        const { data, width, height } = imageData;
        const gray = new Uint8Array(width * height);
        for (let i = 0; i < gray.length; i++) {
            const j = i * 4;
            gray[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;
        }
        return gray;
    },

    /**
     * Detect horizon line using horizontal edge detection.
     * The horizon is where the strongest horizontal edges cluster
     * in the configured vertical band.
     */
    _detectHorizon(gray, w, h) {
        const bandTop = Math.floor(h * this.config.horizonBand[0]);
        const bandBot = Math.floor(h * this.config.horizonBand[1]);
        const threshold = this.config.edgeThreshold;

        // Compute horizontal Sobel edges per row
        const rowStrength = new Float32Array(h);
        const rowWeightedX = new Float32Array(h); // For tilt estimation

        for (let y = bandTop; y < bandBot; y++) {
            let strength = 0;
            let weightedX = 0;
            let count = 0;

            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                // Vertical gradient (Sobel-y simplified)
                const gy = gray[(y + 1) * w + x] - gray[(y - 1) * w + x];
                const absGy = Math.abs(gy);
                if (absGy > threshold) {
                    strength += absGy;
                    weightedX += x * absGy;
                    count++;
                }
            }
            rowStrength[y] = strength;
            rowWeightedX[y] = count > 0 ? weightedX / count : w / 2;
        }

        // Find peak row = horizon
        let maxStrength = 0;
        let horizonRow = (bandTop + bandBot) / 2;
        let totalStrength = 0;
        let weightedRow = 0;

        for (let y = bandTop; y < bandBot; y++) {
            totalStrength += rowStrength[y];
            weightedRow += y * rowStrength[y];
            if (rowStrength[y] > maxStrength) {
                maxStrength = rowStrength[y];
                horizonRow = y;
            }
        }

        // Weighted centroid for sub-pixel horizon
        if (totalStrength > 0) {
            horizonRow = weightedRow / totalStrength;
        }

        // Estimate tilt angle from edge positions in left vs right halves
        let leftEdgeY = 0, leftCount = 0;
        let rightEdgeY = 0, rightCount = 0;

        for (let y = Math.max(bandTop, Math.floor(horizonRow) - 10);
            y < Math.min(bandBot, Math.floor(horizonRow) + 10); y++) {
            for (let x = 1; x < w - 1; x++) {
                const gy = Math.abs(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]);
                if (gy > threshold) {
                    if (x < w / 2) {
                        leftEdgeY += y;
                        leftCount++;
                    } else {
                        rightEdgeY += y;
                        rightCount++;
                    }
                }
            }
        }

        let angle = 0;
        if (leftCount > 10 && rightCount > 10) {
            const leftAvgY = leftEdgeY / leftCount;
            const rightAvgY = rightEdgeY / rightCount;
            angle = Math.atan2(rightAvgY - leftAvgY, w / 2);
        }

        return {
            y: horizonRow / h,           // Normalized 0-1
            angle: angle,                 // Radians
            confidence: Math.min(1, maxStrength / (w * 2))
        };
    },

    /**
     * Simplified block-matching optical flow.
     * Returns aggregate motion magnitude and divergence.
     */
    _computeOpticalFlow(prevGray, currGray, w, h) {
        const bs = this.config.flowBlockSize;
        const sr = this.config.flowSearchRadius;
        const cols = Math.floor(w / bs);
        const rows = Math.floor(h / bs);

        let totalMag = 0;
        let totalDx = 0;
        let totalDy = 0;
        let count = 0;

        // Only sample center region to avoid edge effects
        const startCol = Math.floor(cols * 0.15);
        const endCol = Math.floor(cols * 0.85);
        const startRow = Math.floor(rows * 0.3);
        const endRow = Math.floor(rows * 0.8);

        for (let br = startRow; br < endRow; br++) {
            for (let bc = startCol; bc < endCol; bc++) {
                const bx = bc * bs;
                const by = br * bs;

                let bestDx = 0, bestDy = 0;
                let bestSAD = Infinity;

                // Search in a neighborhood
                for (let dy = -sr; dy <= sr; dy += 2) {
                    for (let dx = -sr; dx <= sr; dx += 2) {
                        const sx = bx + dx;
                        const sy = by + dy;
                        if (sx < 0 || sy < 0 || sx + bs >= w || sy + bs >= h) continue;

                        let sad = 0;
                        for (let py = 0; py < bs; py += 2) {
                            for (let px = 0; px < bs; px += 2) {
                                sad += Math.abs(
                                    prevGray[(by + py) * w + (bx + px)] -
                                    currGray[(sy + py) * w + (sx + px)]
                                );
                            }
                        }
                        if (sad < bestSAD) {
                            bestSAD = sad;
                            bestDx = dx;
                            bestDy = dy;
                        }
                    }
                }

                const mag = Math.sqrt(bestDx * bestDx + bestDy * bestDy);
                totalMag += mag;
                totalDx += bestDx;
                totalDy += bestDy;
                count++;
            }
        }

        const avgMag = count > 0 ? totalMag / count : 0;

        // Divergence: expansion = approaching objects (accel), contraction = braking
        // Compute as spread of flow vectors from center
        const avgDx = count > 0 ? totalDx / count : 0;
        const avgDy = count > 0 ? totalDy / count : 0;
        const divergence = avgDy; // Positive = flow downward = deceleration/pitch forward

        return {
            magnitude: avgMag,
            angle: Math.atan2(avgDy, avgDx),
            divergence: divergence
        };
    },


    // ==========================================================
    //  SIGNAL PROCESSING
    // ==========================================================

    /** Compute first derivatives (rates of change) for pitch and roll */
    _computeRates() {
        for (let i = 1; i < this.frameData.length; i++) {
            const dt = this.frameData[i].time - this.frameData[i - 1].time;
            if (dt > 0) {
                this.frameData[i].pitchRate =
                    (this.frameData[i].horizonY - this.frameData[i - 1].horizonY) / dt;
                this.frameData[i].rollRate =
                    (this.frameData[i].horizonAngle - this.frameData[i - 1].horizonAngle) / dt;
            }
        }
        if (this.frameData.length > 1) {
            this.frameData[0].pitchRate = this.frameData[1].pitchRate;
            this.frameData[0].rollRate = this.frameData[1].rollRate;
        }
    },

    /** Apply moving-average smoothing to pitch, roll, and lateral flow signals */
    _smoothSignals() {
        const smooth = (arr, key, window) => {
            const half = Math.floor(window / 2);
            const orig = arr.map(f => f[key]);
            for (let i = 0; i < arr.length; i++) {
                let sum = 0, cnt = 0;
                for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
                    sum += orig[j];
                    cnt++;
                }
                arr[i][key] = sum / cnt;
            }
        };

        smooth(this.frameData, 'horizonY', this.config.pitchSmoothWindow);
        smooth(this.frameData, 'horizonAngle', this.config.rollSmoothWindow);
        smooth(this.frameData, 'pitchRate', this.config.pitchSmoothWindow);
        smooth(this.frameData, 'rollRate', this.config.rollSmoothWindow);
        smooth(this.frameData, 'flowMagnitude', 3);
        smooth(this.frameData, 'lateralFlow', this.config.rollSmoothWindow);
    },

    /** Compute a combined steering proxy from roll angle + lateral flow */
    _computeSteeringProxy() {
        let rollMax = 0.001, latMax = 0.001;
        for (const f of this.frameData) {
            const ar = Math.abs(f.horizonAngle);
            const al = Math.abs(f.lateralFlow);
            if (ar > rollMax) rollMax = ar;
            if (al > latMax) latMax = al;
        }

        for (const f of this.frameData) {
            const normRoll = f.horizonAngle / rollMax;
            const normLat = f.lateralFlow / latMax;
            f.steeringProxy = normRoll * 0.6 + normLat * 0.4;
        }
    },

    /** Extra smoothing pass on speed signal for better min/max detection */
    _smoothSpeed() {
        const half = Math.floor(this.config.speedSmoothWindow / 2);
        const orig = this.frameData.map(f => f.flowMagnitude);
        for (let i = 0; i < this.frameData.length; i++) {
            let sum = 0, cnt = 0;
            for (let j = Math.max(0, i - half); j <= Math.min(orig.length - 1, i + half); j++) {
                sum += orig[j]; cnt++;
            }
            this.frameData[i].speedProxy = sum / cnt;
        }
    },

    /**
     * Compute lateral (horizontal) optical flow bias.
     * Positive = image moving right = car turning.
     * This is a proxy for steering input.
     */
    _computeLateralFlow(prevGray, currGray, w, h) {
        const bs = this.config.flowBlockSize;
        const sr = this.config.flowSearchRadius;
        const cols = Math.floor(w / bs);
        const rows = Math.floor(h / bs);
        const startCol = Math.floor(cols * 0.2);
        const endCol = Math.floor(cols * 0.8);
        const startRow = Math.floor(rows * 0.4);
        const endRow = Math.floor(rows * 0.7);

        let totalDx = 0, count = 0;

        for (let br = startRow; br < endRow; br++) {
            for (let bc = startCol; bc < endCol; bc++) {
                const bx = bc * bs;
                const by = br * bs;
                let bestDx = 0, bestSAD = Infinity;

                for (let dx = -sr; dx <= sr; dx += 2) {
                    const sx = bx + dx;
                    if (sx < 0 || sx + bs >= w) continue;
                    let sad = 0;
                    for (let py = 0; py < bs; py += 2) {
                        for (let px = 0; px < bs; px += 2) {
                            sad += Math.abs(
                                prevGray[(by + py) * w + (bx + px)] -
                                currGray[(by + py) * w + (sx + px)]
                            );
                        }
                    }
                    if (sad < bestSAD) { bestSAD = sad; bestDx = dx; }
                }
                totalDx += bestDx;
                count++;
            }
        }
        return count > 0 ? totalDx / count : 0;
    },


    // ==========================================================
    //  REVERSE PASS — PRIMARY DETECTION
    //  State machine: SEEKING_EXIT → SEEKING_APEX → SEEKING_BRAKE → SEEKING_FIRST_SIGHT
    //  (Running backwards through the video)
    // ==========================================================

    async _detectEventsReverse(reversedFrames) {
        const events = [];
        const cfg = this.config;

        // Compute adaptive thresholds
        const speeds = reversedFrames.map(f => f.speedProxy);
        const steerings = reversedFrames.map(f => Math.abs(f.steeringProxy));
        const pitchRates = reversedFrames.map(f => f.pitchRate);

        const speedMean = this._mean(speeds);
        const speedStd = this._stdDev(speeds);
        const steeringMean = this._mean(steerings);
        const steeringStd = this._stdDev(steerings);
        const pitchStd = this._stdDev(pitchRates);

        const straightSpeedThresh = speedMean - speedStd * 0.1;
        const lowSpeedThresh = speedMean - speedStd * 0.8;
        const highSteeringThresh = steeringMean + steeringStd * 1.5;
        const lowSteeringThresh = Math.max(
            steeringMean + steeringStd * 1.0,  // Must be 1σ above mean
            cfg.minSteeringMagnitude            // Absolute minimum
        );
        const brakeThresh = Math.max(cfg.brakeThreshold, pitchStd * 1.8);

        console.log('[LapAnalyzer] Adaptive thresholds:', {
            steeringMean: steeringMean.toFixed(4),
            steeringStd: steeringStd.toFixed(4),
            lowSteeringThresh: lowSteeringThresh.toFixed(4),
            highSteeringThresh: highSteeringThresh.toFixed(4),
            speedMean: speedMean.toFixed(4),
            straightSpeedThresh: straightSpeedThresh.toFixed(4),
            brakeThresh: brakeThresh.toFixed(4),
        });

        let state = 'SEEKING_EXIT';
        let cornerData = {};
        let peakSteering = 0;
        let peakSteeringFrame = null;
        let peakSteeringIdx = -1;
        let minSpeed = Infinity;
        let minSpeedFrame = null;

        for (let i = 2; i < reversedFrames.length - 2; i++) {
            const f = reversedFrames[i];
            const absSteering = Math.abs(f.steeringProxy);
            const speed = f.speedProxy;

            switch (state) {
                case 'SEEKING_EXIT':
                    // EXIT = steering straightest + car on opposite side of track from apex
                    // In reverse: transition from straight INTO corner region
                    if (absSteering > lowSteeringThresh && absSteering > cfg.minSteeringMagnitude && speed < straightSpeedThresh) {
                        let exitIdx = i;
                        for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
                            if (Math.abs(reversedFrames[j].steeringProxy) < lowSteeringThresh * 0.5) {
                                exitIdx = j;
                                break;
                            }
                        }

                        const exitFrame = reversedFrames[exitIdx];
                        const conf = Math.min(1,
                            (1 - absSteering / (highSteeringThresh || 1)) * 0.4 +
                            (speed / (straightSpeedThresh || 1)) * 0.3 +
                            (exitFrame.horizonConfidence || 0.5) * 0.3
                        );

                        events.push({
                            type: 'exit',
                            time: exitFrame.time,
                            relTime: exitFrame.relTime,
                            frameIndex: exitFrame.index,
                            confidence: Math.max(0.3, conf),
                            signal: { steering: exitFrame.steeringProxy, speed: speed },
                            direction: 'reverse'
                        });

                        cornerData.exit = exitFrame;
                        peakSteering = absSteering;
                        peakSteeringFrame = f;
                        peakSteeringIdx = i;
                        minSpeed = speed;
                        minSpeedFrame = f;
                        state = 'SEEKING_APEX';
                    }
                    break;

                case 'SEEKING_APEX':
                    // APEX = slowest point + maximum steering
                    if (absSteering > peakSteering) {
                        peakSteering = absSteering;
                        peakSteeringFrame = f;
                        peakSteeringIdx = i;
                    }
                    if (speed < minSpeed) {
                        minSpeed = speed;
                        minSpeedFrame = f;
                    }

                    // Apex detected when steering starts decreasing past the peak
                    const pastApex = (
                        absSteering < peakSteering * 0.65 &&
                        peakSteeringFrame &&
                        i > peakSteeringIdx + 3
                    );

                    if (pastApex) {
                        const apexFrame = peakSteeringFrame;
                        const conf = Math.min(1,
                            (peakSteering / (highSteeringThresh || 1)) * 0.5 +
                            (1 - minSpeed / (speedMean || 1)) * 0.3 +
                            (apexFrame.horizonConfidence || 0.5) * 0.2
                        );

                        events.push({
                            type: 'apex',
                            time: apexFrame.time,
                            relTime: apexFrame.relTime,
                            frameIndex: apexFrame.index,
                            confidence: Math.max(0.4, conf),
                            signal: {
                                peakSteering: peakSteering,
                                minSpeed: minSpeed,
                                horizonAngle: apexFrame.horizonAngle
                            },
                            direction: 'reverse'
                        });

                        cornerData.apex = apexFrame;
                        state = 'SEEKING_BRAKE';
                    }

                    // Timeout
                    if (cornerData.exit && f.time < cornerData.exit.time - 8) {
                        state = 'SEEKING_EXIT';
                        cornerData = {};
                        peakSteering = 0;
                    }
                    break;

                case 'SEEKING_BRAKE':
                    // BRAKE = pitch spike (nose dive) + speed dropping
                    if (f.pitchRate > brakeThresh && f.horizonConfidence > 0.15) {
                        let brakeStart = i;
                        for (let j = i + 1; j < Math.min(reversedFrames.length, i + 15); j++) {
                            if (reversedFrames[j].pitchRate > brakeThresh * 0.3) {
                                brakeStart = j;
                            } else break;
                        }

                        const brakeFrame = reversedFrames[brakeStart];
                        const flowDrop = i > 0 ?
                            reversedFrames[i - 1].flowMagnitude - f.flowMagnitude : 0;
                        const conf = Math.min(1,
                            (f.pitchRate / brakeThresh) * 0.4 +
                            (flowDrop > 0 ? 0.3 : 0.1) +
                            (f.horizonConfidence || 0.5) * 0.2 + 0.1
                        );

                        events.push({
                            type: 'brake',
                            time: brakeFrame.time,
                            relTime: brakeFrame.relTime,
                            frameIndex: brakeFrame.index,
                            confidence: Math.max(0.4, conf),
                            signal: { pitchRate: f.pitchRate, flowDrop, speed: f.speedProxy },
                            direction: 'reverse'
                        });

                        cornerData.brake = brakeFrame;
                        state = 'SEEKING_FIRST_SIGHT';
                    }

                    // Timeout
                    if (cornerData.apex && f.time < cornerData.apex.time - 5) {
                        state = 'SEEKING_EXIT';
                        cornerData = {};
                        peakSteering = 0;
                    }
                    break;

                case 'SEEKING_FIRST_SIGHT':
                    // FIRST SIGHT = where braking marker first becomes visible
                    // Continue backwards until we hit the previous straight
                    {
                        const onStraight = (
                            absSteering < lowSteeringThresh * 0.3 &&
                            speed > speedMean
                        );

                        const minLeadTime = cfg.firstSightLeadTime;
                        const timeDiff = cornerData.brake ?
                            cornerData.brake.time - f.time : 0;

                        if (onStraight && timeDiff > minLeadTime * 0.5) {
                            const conf = Math.min(1,
                                (timeDiff / minLeadTime) * 0.4 +
                                (speed / (straightSpeedThresh || 1)) * 0.3 +
                                (1 - absSteering / (lowSteeringThresh || 1)) * 0.3
                            );

                            events.push({
                                type: 'firstSight',
                                time: f.time,
                                relTime: f.relTime,
                                frameIndex: f.index,
                                confidence: Math.max(0.3, conf),
                                signal: { speed, steering: f.steeringProxy, leadTime: timeDiff },
                                direction: 'reverse'
                            });

                            // Reset for next corner
                            state = 'SEEKING_EXIT';
                            cornerData = {};
                            peakSteering = 0;
                            peakSteeringFrame = null;
                            minSpeed = Infinity;
                            minSpeedFrame = null;
                        }

                        // Max lead time — force at reasonable position
                        if (cornerData.brake && f.time < cornerData.brake.time - 6) {
                            const fsTime = cornerData.brake.time - cfg.firstSightLeadTime;
                            const fsFrame = reversedFrames.reduce((best, fr) =>
                                Math.abs(fr.time - fsTime) < Math.abs(best.time - fsTime) ? fr : best
                            );
                            events.push({
                                type: 'firstSight',
                                time: fsFrame.time,
                                relTime: fsFrame.relTime,
                                frameIndex: fsFrame.index,
                                confidence: 0.3,
                                signal: { speed: fsFrame.speedProxy, estimated: true },
                                direction: 'reverse'
                            });
                            state = 'SEEKING_EXIT';
                            cornerData = {};
                            peakSteering = 0;
                        }
                    }
                    break;
            }

            // Yield to UI thread periodically
            if (i % 50 === 0) await this._yieldThread();
        }

        return events;
    },


    // ==========================================================
    //  FORWARD PASS — VALIDATION
    //  Chronological detection to confirm reverse markers
    // ==========================================================

    async _detectEventsForward(frames) {
        const events = [];
        const cfg = this.config;

        const pitchRates = frames.map(f => f.pitchRate);
        const steerings = frames.map(f => Math.abs(f.steeringProxy));
        const speeds = frames.map(f => f.speedProxy);

        const pitchStd = this._stdDev(pitchRates);
        const steeringMean = this._mean(steerings);
        const steeringStd = this._stdDev(steerings);
        const speedMean = this._mean(speeds);
        const highSteeringThresh = Math.max(
            steeringMean + steeringStd * 1.5,
            cfg.minSteeringMagnitude
        );

        const brakeThresh = Math.max(cfg.brakeThreshold, pitchStd * 1.8);

        let state = 'straight';
        let peakSteering = 0;
        let peakSteeringFrame = null;
        let cornerStart = null;

        for (let i = 2; i < frames.length - 2; i++) {
            const f = frames[i];
            const absSteering = Math.abs(f.steeringProxy);

            // Yield to UI thread periodically
            if (i % 50 === 0) await this._yieldThread();

            switch (state) {
                case 'straight':
                    if (f.pitchRate > brakeThresh && f.horizonConfidence > 0.15) {
                        let brakeStart = i;
                        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                            if (frames[j].pitchRate > brakeThresh * 0.3) brakeStart = j;
                            else break;
                        }

                        events.push({
                            type: 'brake',
                            time: frames[brakeStart].time,
                            relTime: frames[brakeStart].relTime,
                            frameIndex: frames[brakeStart].index,
                            confidence: Math.min(1, (f.pitchRate / brakeThresh) * 0.5 + f.horizonConfidence * 0.3 + 0.2),
                            signal: { pitchRate: f.pitchRate },
                            direction: 'forward'
                        });

                        state = 'turning';
                        cornerStart = frames[brakeStart].time;
                        peakSteering = 0;
                        peakSteeringFrame = null;
                    }
                    break;

                case 'turning':
                    if (absSteering > peakSteering) {
                        peakSteering = absSteering;
                        peakSteeringFrame = f;
                    }

                    if (absSteering < peakSteering * 0.6 && peakSteeringFrame) {
                        events.push({
                            type: 'apex',
                            time: peakSteeringFrame.time,
                            relTime: peakSteeringFrame.relTime,
                            frameIndex: peakSteeringFrame.index,
                            confidence: Math.min(1, peakSteering / (highSteeringThresh || 1)),
                            signal: { peakSteering },
                            direction: 'forward'
                        });

                        events.push({
                            type: 'exit',
                            time: f.time,
                            relTime: f.relTime,
                            frameIndex: f.index,
                            confidence: Math.min(1, (1 - absSteering / (highSteeringThresh || 1)) * 0.5 + (f.speedProxy / (speedMean || 1)) * 0.3 + 0.2),
                            signal: { steering: f.steeringProxy, speed: f.speedProxy },
                            direction: 'forward'
                        });

                        state = 'straight';
                    }

                    if (cornerStart && f.time - cornerStart > 8) state = 'straight';
                    break;
            }
        }

        return events;
    },


    // ==========================================================
    //  BIDIRECTIONAL FUSION
    //  Reverse = PRIMARY (0.7), Forward = VALIDATION (0.3)
    // ==========================================================

    _fuseEvents(primaryEvents, validationEvents, frameInterval) {
        const fused = [];
        const matchWindow = frameInterval * 10;

        // Start with PRIMARY (reverse) events
        for (const pri of primaryEvents) {
            const match = validationEvents.find(val =>
                val.type === pri.type &&
                Math.abs(val.time - pri.time) < matchWindow
            );

            if (match) {
                const fusedConfidence = Math.min(1,
                    pri.confidence * this.config.reverseWeight +
                    match.confidence * this.config.forwardWeight +
                    0.15
                );
                fused.push({
                    ...pri,
                    confidence: fusedConfidence,
                    time: pri.time * this.config.reverseWeight + match.time * this.config.forwardWeight,
                    bidirectional: true,
                    reverseConfidence: pri.confidence,
                    forwardConfidence: match.confidence,
                    adjustment: Math.abs(pri.time - match.time).toFixed(3) + 's',
                });
            } else {
                fused.push({
                    ...pri,
                    confidence: pri.confidence * 0.85,
                    bidirectional: false,
                    reverseConfidence: pri.confidence,
                    forwardConfidence: 0,
                });
            }
        }

        // Forward-only detections
        for (const val of validationEvents) {
            const alreadyFused = fused.some(f =>
                f.type === val.type &&
                Math.abs(f.time - val.time) < matchWindow
            );
            if (!alreadyFused && val.confidence > this.config.confidenceThreshold) {
                fused.push({
                    ...val,
                    confidence: val.confidence * 0.45,
                    bidirectional: false,
                    reverseConfidence: 0,
                    forwardConfidence: val.confidence,
                });
            }
        }

        return fused
            .filter(e => e.confidence >= this.config.confidenceThreshold)
            .sort((a, b) => a.time - b.time);
    },


    // ==========================================================
    //  CORNER GROUPING (includes firstSight marker)
    // ==========================================================

    _groupCorners(events) {
        const corners = [];
        let current = null;

        for (const evt of events) {
            switch (evt.type) {
                case 'firstSight':
                    if (current && (current.apex || current.brake)) {
                        corners.push(this._finalizeCorner(current));
                    }
                    current = { firstSight: evt, brake: null, apex: null, exit: null };
                    break;

                case 'brake':
                    if (current && !current.brake) {
                        current.brake = evt;
                    } else {
                        if (current && current.apex) {
                            corners.push(this._finalizeCorner(current));
                        }
                        current = { firstSight: null, brake: evt, apex: null, exit: null };
                    }
                    break;

                case 'apex':
                    if (current) {
                        current.apex = evt;
                    } else {
                        current = { firstSight: null, brake: null, apex: evt, exit: null };
                    }
                    break;

                case 'exit':
                    if (current && current.apex) {
                        current.exit = evt;
                        corners.push(this._finalizeCorner(current));
                        current = null;
                    }
                    break;
            }
        }

        if (current && (current.apex || current.brake)) {
            corners.push(this._finalizeCorner(current));
        }

        return corners.filter(Boolean);
    },

    /** Finalize a corner with metadata */
    _finalizeCorner(corner) {
        const events = [corner.firstSight, corner.brake, corner.apex, corner.exit].filter(Boolean);
        const avgConfidence = this._mean(events.map(e => e.confidence));

        let cornerType = 'right';
        if (corner.apex) {
            const apexFrame = this.frameData.find(f => f.index === corner.apex.frameIndex);
            if (apexFrame) {
                cornerType = apexFrame.steeringProxy > 0 ? 'right' : 'left';
            }
            if (corner.apex.signal?.horizonAngle !== undefined) {
                cornerType = corner.apex.signal.horizonAngle > 0 ? 'right' : 'left';
            }
        }

        const startEvt = corner.firstSight || corner.brake || corner.apex || corner.exit;
        const endEvt = corner.exit || corner.apex || corner.brake || corner.firstSight;
        if (!startEvt || !endEvt) return null;

        const startTime = startEvt.time;
        const endTime = endEvt.time;
        const duration = endTime - startTime;

        // Reject corners that are too short or have too few markers
        if (duration < this.config.minCornerDuration && events.length < 3) return null;
        if (events.length < 2) return null;  // Need at least 2 markers for a real corner
        if (avgConfidence < this.config.confidenceThreshold) return null;

        if (duration > 5) cornerType = 'hairpin';
        if (corner.apex && corner.exit && (corner.exit.time - corner.apex.time) < 0.3) {
            cornerType = 'kink';
        }

        return {
            firstSight: corner.firstSight ? {
                time: corner.firstSight.time,
                confidence: corner.firstSight.confidence,
                bidirectional: corner.firstSight.bidirectional
            } : null,
            brake: corner.brake ? {
                time: corner.brake.time,
                confidence: corner.brake.confidence,
                bidirectional: corner.brake.bidirectional
            } : null,
            apex: corner.apex ? {
                time: corner.apex.time,
                confidence: corner.apex.confidence,
                bidirectional: corner.apex.bidirectional
            } : null,
            exit: corner.exit ? {
                time: corner.exit.time,
                confidence: corner.exit.confidence,
                bidirectional: corner.exit.bidirectional
            } : null,
            confidence: avgConfidence,
            cornerType: cornerType,
            duration: duration,
            bidirectionalCount: events.filter(e => e.bidirectional).length,
            markerCount: events.length,
        };
    },


    // ==========================================================
    //  TRACK MAP VALIDATION
    // ==========================================================

    /**
     * Analyze the track map image to extract the track path and identify corners.
     * Uses edge detection + contour tracing to find the track outline,
     * then measures curvature along the path to locate corners.
     * @returns {Array} Array of { position: 0-1, direction: 'left'|'right', severity: 0-1 }
     */
    async _analyzeTrackMap() {
        if (!this.trackMapImage) return [];

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Resize to manageable dimensions
                const maxDim = 400;
                const scale = Math.min(maxDim / img.width, maxDim / img.height);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                // Convert to grayscale + edge detect (Sobel)
                const gray = new Float32Array(w * h);
                for (let i = 0; i < w * h; i++) {
                    const p = i * 4;
                    gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                }

                const edges = new Float32Array(w * h);
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        const gx = -gray[(y - 1) * w + x - 1] + gray[(y - 1) * w + x + 1]
                            - 2 * gray[y * w + x - 1] + 2 * gray[y * w + x + 1]
                            - gray[(y + 1) * w + x - 1] + gray[(y + 1) * w + x + 1];
                        const gy = -gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1]
                            + gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
                        edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
                    }
                }

                // Threshold to binary — find the strongest line (the track)
                const edgeValues = Array.from(edges).filter(v => v > 0).sort((a, b) => b - a);
                const threshold = edgeValues[Math.floor(edgeValues.length * 0.15)] || 50;

                // Collect edge points along the track
                const trackPoints = [];
                for (let y = 1; y < h - 1; y++) {
                    for (let x = 1; x < w - 1; x++) {
                        if (edges[y * w + x] > threshold) {
                            trackPoints.push({ x, y });
                        }
                    }
                }

                if (trackPoints.length < 20) {
                    console.warn('[TrackMap] Not enough edge points found:', trackPoints.length);
                    resolve([]);
                    return;
                }

                // Order points by nearest-neighbor to form the track path
                const orderedPath = this._orderTrackPoints(trackPoints, w, h);

                if (orderedPath.length < 30) {
                    console.warn('[TrackMap] Track path too short:', orderedPath.length);
                    resolve([]);
                    return;
                }

                // Downsample path uniformly
                const step = Math.max(1, Math.floor(orderedPath.length / 200));
                const sampledPath = orderedPath.filter((_, i) => i % step === 0);

                // Compute curvature at each point
                const curvatures = [];
                const lookAhead = Math.max(3, Math.floor(sampledPath.length / 30));

                for (let i = lookAhead; i < sampledPath.length - lookAhead; i++) {
                    const prev = sampledPath[i - lookAhead];
                    const curr = sampledPath[i];
                    const next = sampledPath[i + lookAhead];

                    const dx1 = curr.x - prev.x;
                    const dy1 = curr.y - prev.y;
                    const dx2 = next.x - curr.x;
                    const dy2 = next.y - curr.y;

                    const angle1 = Math.atan2(dy1, dx1);
                    const angle2 = Math.atan2(dy2, dx2);
                    let angleDiff = angle2 - angle1;
                    // Normalize to [-π, π]
                    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                    curvatures.push({
                        position: i / sampledPath.length,
                        curvature: Math.abs(angleDiff),
                        direction: angleDiff > 0 ? 'right' : 'left',
                        x: curr.x,
                        y: curr.y,
                    });
                }

                // Find corners = peaks in curvature
                const curvMean = curvatures.reduce((s, c) => s + c.curvature, 0) / curvatures.length;
                const curvStd = Math.sqrt(curvatures.reduce((s, c) => s + (c.curvature - curvMean) ** 2, 0) / curvatures.length);
                const cornerThreshold = curvMean + curvStd * 1.5;

                const corners = [];
                let inCorner = false;
                let peakCurv = 0;
                let peakPoint = null;

                for (const c of curvatures) {
                    if (c.curvature > cornerThreshold) {
                        if (!inCorner) {
                            inCorner = true;
                            peakCurv = c.curvature;
                            peakPoint = c;
                        } else if (c.curvature > peakCurv) {
                            peakCurv = c.curvature;
                            peakPoint = c;
                        }
                    } else {
                        if (inCorner && peakPoint) {
                            // Check minimum distance from last corner
                            const lastCorner = corners[corners.length - 1];
                            if (!lastCorner || Math.abs(peakPoint.position - lastCorner.position) > 0.04) {
                                corners.push({
                                    position: peakPoint.position,
                                    direction: peakPoint.direction,
                                    severity: Math.min(1, (peakCurv - curvMean) / (curvStd * 3)),
                                    x: peakPoint.x / w,  // Normalized
                                    y: peakPoint.y / h,
                                });
                            }
                        }
                        inCorner = false;
                        peakCurv = 0;
                        peakPoint = null;
                    }
                }

                console.log(`[TrackMap] Analyzed: ${trackPoints.length} edge points → ${orderedPath.length} track path → ${corners.length} corners detected`);
                corners.forEach((c, i) => {
                    console.log(`  Corner ${i + 1}: pos=${(c.position * 100).toFixed(1)}% ${c.direction} (severity=${c.severity.toFixed(2)})`);
                });

                this._trackMapCorners = corners;
                resolve(corners);
            };
            img.onerror = () => {
                console.warn('[TrackMap] Could not load track map image');
                resolve([]);
            };
            img.src = this.trackMapImage;
        });
    },

    /**
     * Order scattered edge points into a connected track path using nearest-neighbor.
     */
    _orderTrackPoints(points, w, h) {
        if (points.length === 0) return [];

        // Start from a point near the expected start/finish (bottom of image)
        let startIdx = 0;
        let bestY = -1;
        for (let i = 0; i < points.length; i++) {
            if (points[i].y > bestY) {
                bestY = points[i].y;
                startIdx = i;
            }
        }

        const used = new Set();
        const path = [points[startIdx]];
        used.add(startIdx);

        const maxDist = Math.max(w, h) * 0.08;  // Max gap between consecutive points

        for (let step = 0; step < Math.min(points.length, 500); step++) {
            const curr = path[path.length - 1];
            let bestDist = Infinity;
            let bestIdx = -1;

            for (let i = 0; i < points.length; i++) {
                if (used.has(i)) continue;
                const dx = points[i].x - curr.x;
                const dy = points[i].y - curr.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist && dist < maxDist) {
                    bestDist = dist;
                    bestIdx = i;
                }
            }

            if (bestIdx === -1) break;
            path.push(points[bestIdx]);
            used.add(bestIdx);
        }

        return path;
    },

    /** Cross-reference detected video corners with track map corners */
    _validateWithTrackMap() {
        if (!this._trackMapCorners || !this._trackMapCorners.length || !this.cornerSequences.length) return;

        const totalDuration = this.frameData[this.frameData.length - 1].time - this.frameData[0].time;
        const mapCorners = this._trackMapCorners;

        // Assign track position to each detected corner (0-1 = proportion of lap)
        for (const corner of this.cornerSequences) {
            const cornerTime = (corner.apex || corner.brake || corner.exit || corner.firstSight).time;
            corner.trackPosition = (cornerTime - this.frameData[0].time) / totalDuration;
        }

        // Match detected corners to map corners
        const matchWindow = 0.10;  // 10% of track tolerance
        let matched = 0;

        for (const mapCorner of mapCorners) {
            const best = this.cornerSequences.reduce((bestMatch, detCorner) => {
                const gap = Math.abs(detCorner.trackPosition - mapCorner.position);
                if (gap < matchWindow && (!bestMatch || gap < bestMatch.gap)) {
                    return { corner: detCorner, gap };
                }
                return bestMatch;
            }, null);

            if (best) {
                // Boost confidence of corners that match the track map
                best.corner.confidence = Math.min(1, best.corner.confidence * 1.2 + 0.1);
                best.corner.trackMapMatch = true;
                best.corner.mapDirection = mapCorner.direction;
                best.corner.mapSeverity = mapCorner.severity;
                matched++;
            }
        }

        // Flag corners that DON'T match the track map — lower confidence
        for (const corner of this.cornerSequences) {
            if (!corner.trackMapMatch) {
                corner.confidence *= 0.7;
                corner.trackMapMatch = false;
            }
        }

        // Remove low-confidence unmatched corners
        this.cornerSequences = this.cornerSequences.filter(c =>
            c.trackMapMatch || c.confidence >= this.config.confidenceThreshold
        );

        console.log(`[TrackMap Validation] ${matched}/${mapCorners.length} map corners matched, ` +
            `${this.cornerSequences.length} corners retained`);
    },


    // ==========================================================
    //  TRACK MAP INTEGRATION
    // ==========================================================

    /**
     * Set a track map image for spatial reference.
     * @param {string} imageUrl — blob URL or data URL of the track map
     */
    setTrackMap(imageUrl) {
        this.trackMapImage = imageUrl;
    },

    /**
     * Capture a thumbnail image from the video at a given time.
     * @param {HTMLVideoElement} video
     * @param {number} time — seconds
     * @param {number} [width=240] — thumbnail width
     * @returns {Promise<string>} data URL (image/jpeg)
     */
    async captureFrameThumbnail(video, time, width = 240) {
        const canvas = document.createElement('canvas');
        const aspect = video.videoHeight / video.videoWidth;
        canvas.width = width;
        canvas.height = Math.round(width * aspect);
        const ctx = canvas.getContext('2d');

        await this._seekVideo(video, time);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7);
    },

    /**
     * Capture thumbnails for all corners in a result set.
     * Returns array of { firstSight, brake, apex, exit } thumbnail data URLs.
     */
    async captureCornerThumbnails(video, corners, onProgress) {
        const thumbs = [];
        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];
            const ct = {};
            if (c.firstSight) ct.firstSight = await this.captureFrameThumbnail(video, c.firstSight.time);
            if (c.brake) ct.brake = await this.captureFrameThumbnail(video, c.brake.time);
            if (c.apex) ct.apex = await this.captureFrameThumbnail(video, c.apex.time);
            if (c.exit) ct.exit = await this.captureFrameThumbnail(video, c.exit.time);
            thumbs.push(ct);
            if (onProgress) onProgress((i + 1) / corners.length, `Capturing corner ${i + 1}/${corners.length}`);
        }
        return thumbs;
    },


    // ==========================================================
    //  UTILITIES
    // ==========================================================

    _mean(arr) {
        if (!arr.length) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    _stdDev(arr) {
        const m = this._mean(arr);
        return Math.sqrt(this._mean(arr.map(x => (x - m) ** 2)));
    },

    _seekVideo(video, time) {
        return new Promise((resolve) => {
            if (Math.abs(video.currentTime - time) < 0.02) {
                resolve();
                return;
            }
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                resolve();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = time;
        });
    },

    _yieldThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    },

    /**
     * Generate a visualization of the analysis signals.
     * Returns a canvas element with the waveforms.
     */
    renderSignalChart(width = 800, height = 200) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!this.frameData.length) return canvas;

        const frames = this.frameData;
        const xScale = width / frames.length;

        // Background
        ctx.fillStyle = '#08080f';
        ctx.fillRect(0, 0, width, height);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < height; y += height / 4) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Center line
        const cy = height / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();

        // Draw signals
        const drawSignal = (key, color, scale, offset = 0) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < frames.length; i++) {
                const x = i * xScale;
                const val = frames[i][key] || 0;
                const y = cy - (val * scale) + offset;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        // Pitch (horizon Y) — cyan
        const horizonScale = height * 2;
        drawSignal('horizonY', 'rgba(0, 240, 255, 0.7)', -horizonScale, -cy * 0.3);

        // Safe max helper (Math.max(...array) can stack overflow)
        const safeMax = (arr, fn, floor = 0.01) => {
            let mx = floor;
            for (const item of arr) {
                const v = fn(item);
                if (v > mx) mx = v;
            }
            return mx;
        };

        // Pitch Rate — orange (braking indicator)
        const pitchRateMax = safeMax(frames, f => Math.abs(f.pitchRate));
        drawSignal('pitchRate', 'rgba(255, 107, 53, 0.8)', cy * 0.8 / pitchRateMax);

        // Steering proxy — purple
        const steeringMax = safeMax(frames, f => Math.abs(f.steeringProxy || f.horizonAngle));
        drawSignal('steeringProxy', 'rgba(124, 58, 237, 0.7)', cy * 0.6 / steeringMax);

        // Speed proxy — green
        const speedMax = safeMax(frames, f => f.speedProxy || f.flowMagnitude);
        drawSignal('speedProxy', 'rgba(16, 185, 129, 0.5)', cy * 0.4 / speedMax);

        // Lateral flow — magenta
        const latMax = safeMax(frames, f => Math.abs(f.lateralFlow || 0));
        drawSignal('lateralFlow', 'rgba(236, 72, 153, 0.4)', cy * 0.3 / latMax);

        // Draw detected events
        for (const evt of this.fusedEvents) {
            const frameIdx = frames.findIndex(f => Math.abs(f.time - evt.time) < 0.15);
            if (frameIdx < 0) continue;
            const x = frameIdx * xScale;

            const colors = {
                firstSight: '#fbbf24',
                brake: '#ff6b35',
                apex: '#7c3aed',
                exit: '#10b981'
            };

            ctx.strokeStyle = colors[evt.type] || '#fff';
            ctx.lineWidth = evt.bidirectional ? 2.5 : 1.5;
            ctx.globalAlpha = evt.confidence;
            ctx.setLineDash(evt.bidirectional ? [] : [4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;

            // Label
            ctx.fillStyle = colors[evt.type] || '#fff';
            ctx.font = '9px monospace';
            const label = evt.type === 'firstSight' ? '👁 SIGHT' : evt.type.toUpperCase();
            ctx.fillText(label, x + 3, 12);
            if (evt.bidirectional) {
                ctx.fillText('✓✓', x + 3, 22);
            }
        }

        // Legend
        ctx.font = '10px monospace';
        const legend = [
            { label: 'Pitch (Horizon)', color: 'rgba(0, 240, 255, 0.7)' },
            { label: 'Pitch Rate (Brake)', color: 'rgba(255, 107, 53, 0.8)' },
            { label: 'Steering (Corner)', color: 'rgba(124, 58, 237, 0.7)' },
            { label: 'Speed (Flow)', color: 'rgba(16, 185, 129, 0.5)' },
            { label: 'Lateral Flow', color: 'rgba(236, 72, 153, 0.4)' },
        ];
        legend.forEach((l, i) => {
            const lx = width - 160;
            const ly = 14 + i * 14;
            ctx.fillStyle = l.color;
            ctx.fillRect(lx, ly - 6, 10, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(l.label, lx + 14, ly);
        });

        return canvas;
    }
};

