/* ============================================================
   CONDITIONING-ENGINE.JS — Programmable Video Rendering Engine
   ============================================================
   
   THE PRODUCT: A 5-lap progressive conditioning video that trains
   the rider/driver's Quiet Eye system through repetition and 
   progressive overlay reduction.
   
   LAP STRUCTURE:
   ─────────────
   L1-L2  FULL PAUSE     — Slow speed, 5s pause at each gaze point,
                           full "Eyes [X] — Aware [Y]" overlays
   L3     SLOW (-10%)    — No pauses, full text cues  
   L4     NORMAL PACE    — Normal speed, "Aware [Y]" only
   L5     FAST (+10%)    — Marker icon only — subconscious mode
   
   SPEED RAMPING PER ZONE:
   ───────────────────────
   Straight       → 1.5x speed (cognitive efficiency)
   Approach       → 0.8x (awareness builds)
   Braking Zone   → 0.4x (decision point — slow it down)
   Apex           → 0.3x or PAUSE (critical fixation moment)
   Exit           → 0.5x (gaze transfer moment)
   
   VEHICLE-SPECIFIC (CAR):
   ───────────────────────
   • Trail braking duration highlighted
   • Throttle progression noted at exit
   • Steering smoothness cue at apex
   • Lane deviation reference at exit marker
   
   ============================================================ */

const ConditioningEngine = {

    // ── Configuration ────────────────────────────────────────
    config: {
        // Speed multipliers per zone
        speeds: {
            straight: 1.5,
            approach: 0.8,
            braking: 0.4,
            apex: 0.3,
            exit: 0.5,
        },
        // Lap-specific overrides
        lapConfigs: [
            // Lap 1
            {
                label: 'FULL PAUSE', speedMultiplier: 0.85, pauseAtGaze: true, pauseDuration: 5,
                showEyes: true, showAware: true, showMarker: true, countdown: true
            },
            // Lap 2
            {
                label: 'FULL PAUSE', speedMultiplier: 0.85, pauseAtGaze: true, pauseDuration: 5,
                showEyes: true, showAware: true, showMarker: true, countdown: true
            },
            // Lap 3
            {
                label: 'SLOW LAP', speedMultiplier: 0.90, pauseAtGaze: false, pauseDuration: 0,
                showEyes: true, showAware: true, showMarker: true, countdown: false
            },
            // Lap 4
            {
                label: 'NORMAL PACE', speedMultiplier: 1.0, pauseAtGaze: false, pauseDuration: 0,
                showEyes: false, showAware: true, showMarker: true, countdown: false
            },
            // Lap 5
            {
                label: 'FAST LAP', speedMultiplier: 1.10, pauseAtGaze: false, pauseDuration: 0,
                showEyes: false, showAware: false, showMarker: true, countdown: false
            },
        ],
        // Visual settings
        overlayFont: '600 28px "Inter", "SF Pro", system-ui, sans-serif',
        overlayFontSmall: '500 20px "Inter", "SF Pro", system-ui, sans-serif',
        overlayFontTiny: '400 16px "Inter", "SF Pro", system-ui, sans-serif',
        cornerLabelFont: 'bold 22px "Inter", system-ui, sans-serif',
        countdownFont: 'bold 72px "Inter", system-ui, sans-serif',
        eyesColor: '#00f0ff',       // Cyan for "Eyes"
        awareColor: '#ff9f1c',      // Amber for "Aware"
        markerColor: '#ffffff',     // White for markers
        bgOverlay: 'rgba(0,0,0,0.55)',
        cornerBg: 'rgba(0,200,255,0.15)',
        // Transition zone (seconds before/after a marker)
        approachWindow: 2.0,        // Start showing cue 2s before marker
        holdWindow: 1.5,            // Keep cue visible 1.5s after marker
        // Break between laps
        lapBreakDuration: 3,        // 3s "Take a Breath" screen between laps
    },

    // ── State ────────────────────────────────────────────────
    _video: null,
    _canvas: null,
    _ctx: null,
    _corners: [],
    _blueprint: null,          // Full Quiet Eye coaching data
    _voiceCues: {},            // { brake: AudioBuffer, apex: AudioBuffer, etc. }
    _audioCtx: null,

    _isPlaying: false,
    _isPaused: false,
    _currentLap: 0,            // 0-indexed (0-4)
    _startTime: 0,
    _endTime: 0,
    _animFrameId: null,

    // For recording
    _isRecording: false,
    _mediaRecorder: null,
    _recordedChunks: [],

    // Timeline segments: computed zones for speed control
    _segments: [],


    // ==========================================================
    //  PUBLIC API
    // ==========================================================

    /**
     * Initialize the conditioning engine.
     * @param {HTMLVideoElement} video — source video
     * @param {HTMLCanvasElement} canvas — output canvas (visible to user)
     * @param {Array} corners — detected corner sequences from VisionAnalyzer
     * @param {Object} blueprint — optional AI-generated coaching data
     * @param {number} startTime — lap start time
     * @param {number} endTime — lap end time
     */
    init(video, canvas, corners, blueprint, startTime, endTime) {
        this._video = video;
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._corners = corners;
        this._blueprint = blueprint;
        this._startTime = startTime;
        this._endTime = endTime;

        // Size canvas to video dimensions
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        // Build the timeline segments
        this._segments = this._buildSegments();

        // Initialize audio
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this._loadVoiceCues();

        console.log(`[ConditioningEngine] Initialized: ${corners.length} corners, ` +
            `${this._segments.length} segments, ${(endTime - startTime).toFixed(1)}s lap`);
    },

    /**
     * Play the full 5-lap conditioning video.
     * @param {Function} onProgress — (lap, progress, message)
     * @param {Function} onComplete — called when all 5 laps finish
     */
    async play(onProgress = () => { }, onComplete = () => { }) {
        this._isPlaying = true;
        this._isPaused = false;

        for (let lap = 0; lap < 5; lap++) {
            if (!this._isPlaying) break;

            this._currentLap = lap;
            const lapConfig = this.config.lapConfigs[lap];

            onProgress(lap + 1, 0, `Lap ${lap + 1}/5 — ${lapConfig.label}`);

            // Lap break screen (except before first lap)
            if (lap > 0) {
                await this._showLapBreak(lap + 1, lapConfig.label);
            }

            // Play the lap
            await this._playLap(lap, (progress) => {
                onProgress(lap + 1, progress, `Lap ${lap + 1}/5 — ${lapConfig.label}`);
            });
        }

        this._isPlaying = false;
        onComplete();
    },

    /**
     * Stop playback.
     */
    stop() {
        this._isPlaying = false;
        this._isPaused = false;
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = null;
        }
    },

    /**
     * Start recording the output to a downloadable video file.
     */
    startRecording() {
        const stream = this._canvas.captureStream(30);

        // Add audio if available
        if (this._audioCtx && this._audioCtx.destination) {
            try {
                const audioStream = this._audioCtx.createMediaStreamDestination();
                stream.addTrack(audioStream.stream.getAudioTracks()[0]);
            } catch (e) {
                console.warn('[ConditioningEngine] Could not add audio to recording');
            }
        }

        this._recordedChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        this._mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 5000000, // 5 Mbps
        });

        this._mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this._recordedChunks.push(e.data);
        };

        this._mediaRecorder.start(100); // Collect data every 100ms
        this._isRecording = true;
        console.log('[ConditioningEngine] Recording started');
    },

    /**
     * Stop recording and return the video as a downloadable Blob.
     * @returns {Blob}
     */
    stopRecording() {
        return new Promise((resolve) => {
            this._mediaRecorder.onstop = () => {
                const blob = new Blob(this._recordedChunks, { type: 'video/webm' });
                this._isRecording = false;
                console.log(`[ConditioningEngine] Recording complete: ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
                resolve(blob);
            };
            this._mediaRecorder.stop();
        });
    },


    // ==========================================================
    //  SEGMENT BUILDER — divides the lap into speed zones
    // ==========================================================

    _buildSegments() {
        const segments = [];
        const lapStart = this._startTime;
        const lapEnd = this._endTime;

        // Sort corners by time
        const corners = [...this._corners].sort((a, b) => {
            const tA = (a.firstSight || a.brake || a.apex).time;
            const tB = (b.firstSight || b.brake || b.apex).time;
            return tA - tB;
        });

        let lastEnd = lapStart;

        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];
            const brake = c.brake || c.firstSight || c.apex;
            const apex = c.apex || c.brake;
            const exit = c.exit || c.apex || c.brake;

            const approachStart = Math.max(lastEnd, brake.time - this.config.approachWindow);

            // Straight before this corner
            if (approachStart > lastEnd + 0.3) {
                segments.push({
                    type: 'straight',
                    start: lastEnd,
                    end: approachStart,
                    cornerIndex: -1,
                });
            }

            // Approach zone
            if (approachStart < brake.time) {
                segments.push({
                    type: 'approach',
                    start: approachStart,
                    end: brake.time,
                    cornerIndex: i,
                    gazePhase: 'firstSight',
                    eyes: c.gazeTargets?.brake || 'braking reference',
                    aware: c.gazeTargets?.apex || 'apex zone',
                });
            }

            // Braking zone
            segments.push({
                type: 'braking',
                start: brake.time,
                end: apex.time,
                cornerIndex: i,
                gazePhase: 'brake',
                eyes: c.gazeTargets?.brake || 'braking marker',
                aware: c.gazeTargets?.apex || 'inside kerb',
                cornerName: c.name || `Corner ${c.number}`,
                cornerType: c.cornerType,
                direction: c.direction,
                quietEyeCue: c.quietEyeCue,
            });

            // Apex zone
            segments.push({
                type: 'apex',
                start: apex.time,
                end: exit.time,
                cornerIndex: i,
                gazePhase: 'apex',
                eyes: c.gazeTargets?.apex || 'inside kerb apex',
                aware: c.gazeTargets?.exit || 'exit kerb',
                cornerName: c.name || `Corner ${c.number}`,
                cornerType: c.cornerType,
                direction: c.direction,
                quietEyeCue: c.quietEyeCue,
            });

            // Exit zone
            const exitEnd = exit.time + this.config.holdWindow;
            segments.push({
                type: 'exit',
                start: exit.time,
                end: Math.min(exitEnd, lapEnd),
                cornerIndex: i,
                gazePhase: 'exit',
                eyes: c.gazeTargets?.exit || 'exit kerb',
                aware: 'next straight / braking zone',
                cornerName: c.name || `Corner ${c.number}`,
            });

            lastEnd = Math.min(exitEnd, lapEnd);
        }

        // Final straight
        if (lastEnd < lapEnd - 0.3) {
            segments.push({
                type: 'straight',
                start: lastEnd,
                end: lapEnd,
                cornerIndex: -1,
            });
        }

        console.log(`[ConditioningEngine] Built ${segments.length} timeline segments`);
        return segments;
    },


    // ==========================================================
    //  LAP PLAYBACK ENGINE
    // ==========================================================

    async _playLap(lapIndex, onProgress) {
        const lapConfig = this.config.lapConfigs[lapIndex];
        const lapDuration = this._endTime - this._startTime;

        return new Promise(async (resolve) => {
            let videoTime = this._startTime;
            let lastWallTime = performance.now();

            const tick = async () => {
                if (!this._isPlaying) { resolve(); return; }

                const now = performance.now();
                const wallDelta = (now - lastWallTime) / 1000;
                lastWallTime = now;

                // Find current segment
                const segment = this._getSegmentAt(videoTime);
                const zoneSpeed = segment ? (this.config.speeds[segment.type] || 1.0) : 1.0;
                const effectiveSpeed = zoneSpeed * lapConfig.speedMultiplier;

                // Advance video time
                videoTime += wallDelta * effectiveSpeed;

                // Clamp to lap bounds
                if (videoTime >= this._endTime) {
                    resolve();
                    return;
                }

                // Seek video
                this._video.currentTime = videoTime;

                // Draw frame
                this._drawFrame(videoTime, lapIndex, segment);

                // Check if we need to pause (Lap 1-2 at gaze points)
                if (lapConfig.pauseAtGaze && segment && this._isGazePoint(segment, videoTime)) {
                    await this._doPause(lapConfig.pauseDuration, segment, lapIndex);
                    lastWallTime = performance.now();
                }

                // Play voice cue if at marker boundary
                this._checkVoiceCues(segment, videoTime, lapIndex);

                // Report progress
                const progress = (videoTime - this._startTime) / lapDuration;
                onProgress(Math.min(1, progress));

                this._animFrameId = requestAnimationFrame(tick);
            };

            this._animFrameId = requestAnimationFrame(tick);
        });
    },

    _getSegmentAt(time) {
        return this._segments.find(s => time >= s.start && time < s.end) || null;
    },

    _isGazePoint(segment, time) {
        // Trigger pause at the start of braking and apex zones
        if (segment.type === 'braking' && time < segment.start + 0.3) return true;
        if (segment.type === 'apex' && time < segment.start + 0.3) return true;
        return false;
    },


    // ==========================================================
    //  FRAME RENDERING — Canvas compositing
    // ==========================================================

    _drawFrame(videoTime, lapIndex, segment) {
        const ctx = this._ctx;
        const w = this._canvas.width;
        const h = this._canvas.height;
        const lapConfig = this.config.lapConfigs[lapIndex];

        // 1. Draw the video frame
        ctx.drawImage(this._video, 0, 0, w, h);

        if (!segment || segment.type === 'straight') {
            // On straights: just show lap indicator
            this._drawLapIndicator(ctx, w, h, lapIndex, lapConfig);
            return;
        }

        // 2. Corner zone tint
        if (segment.type !== 'straight') {
            ctx.fillStyle = this.config.cornerBg;
            ctx.fillRect(0, 0, w, h);
        }

        // 3. Lap indicator (top-left)
        this._drawLapIndicator(ctx, w, h, lapIndex, lapConfig);

        // 4. Corner label (top-right)
        if (segment.cornerName) {
            this._drawCornerLabel(ctx, w, segment);
        }

        // 5. Eyes → Aware overlay (bottom)
        if (lapConfig.showEyes || lapConfig.showAware) {
            this._drawGazeOverlay(ctx, w, h, segment, lapConfig);
        }

        // 6. Marker only mode (Lap 5)
        if (lapConfig.showMarker && !lapConfig.showEyes && !lapConfig.showAware) {
            this._drawMarkerOnly(ctx, w, h, segment);
        }

        // 7. Speed indicator
        const speed = this.config.speeds[segment.type] || 1.0;
        if (speed !== 1.0) {
            this._drawSpeedIndicator(ctx, w, h, speed * lapConfig.speedMultiplier);
        }
    },

    _drawLapIndicator(ctx, w, h, lapIndex, lapConfig) {
        const label = `L${lapIndex + 1} — ${lapConfig.label}`;
        ctx.font = this.config.overlayFontSmall;
        const metrics = ctx.measureText(label);

        // Background pill
        const px = 16, py = 16;
        const pw = metrics.width + 24, ph = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this._roundRect(ctx, px, py, pw, ph, 8);
        ctx.fill();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px + 12, py + ph / 2);
    },

    _drawCornerLabel(ctx, w, segment) {
        const label = `${segment.cornerName} — ${segment.direction || ''} ${segment.cornerType || ''}`;
        ctx.font = this.config.cornerLabelFont;
        const metrics = ctx.measureText(label);

        const px = w - metrics.width - 40, py = 16;
        const pw = metrics.width + 24, ph = 34;

        ctx.fillStyle = 'rgba(0,150,255,0.6)';
        this._roundRect(ctx, px, py, pw, ph, 8);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px + 12, py + ph / 2);
    },

    _drawGazeOverlay(ctx, w, h, segment, lapConfig) {
        const barHeight = 100;
        const barY = h - barHeight;

        // Semi-transparent background bar
        ctx.fillStyle = this.config.bgOverlay;
        ctx.fillRect(0, barY, w, barHeight);

        // Dividing line
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, barY);
        ctx.lineTo(w, barY);
        ctx.stroke();

        const centerX = w / 2;
        let yPos = barY + 20;

        // Phase label
        const phaseLabels = {
            approach: '◎ APPROACH',
            braking: '◉ BRAKE ZONE',
            apex: '◈ APEX',
            exit: '◇ EXIT',
        };
        ctx.font = this.config.overlayFontTiny;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(phaseLabels[segment.type] || segment.type.toUpperCase(), centerX, yPos);
        yPos += 24;

        // "Eyes: [target]" line
        if (lapConfig.showEyes && segment.eyes) {
            ctx.font = this.config.overlayFont;
            ctx.fillStyle = this.config.eyesColor;
            ctx.fillText(`Eyes → ${segment.eyes}`, centerX, yPos);
            yPos += 32;
        }

        // "Aware: [target]" line
        if (lapConfig.showAware && segment.aware) {
            ctx.font = this.config.overlayFontSmall;
            ctx.fillStyle = this.config.awareColor;
            ctx.fillText(`Aware: ${segment.aware}`, centerX, yPos);
        }

        ctx.textAlign = 'left';  // Reset
    },

    _drawMarkerOnly(ctx, w, h, segment) {
        // Lap 5: Just a small icon/symbol at the corner
        const icons = {
            approach: '◎',
            braking: '■',
            apex: '◆',
            exit: '▷',
        };
        const icon = icons[segment.type] || '●';

        ctx.font = 'bold 48px system-ui';
        ctx.fillStyle = 'rgba(0,240,255,0.8)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(icon, w / 2, h - 20);
        ctx.textAlign = 'left';
    },

    _drawSpeedIndicator(ctx, w, h, speed) {
        const label = `${Math.round(speed * 100)}%`;
        ctx.font = this.config.overlayFontTiny;
        ctx.fillStyle = speed < 1 ? 'rgba(255,200,0,0.7)' : 'rgba(0,255,100,0.7)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, w - 16, this._canvas.height - 110);
        ctx.textAlign = 'left';
    },


    // ==========================================================
    //  PAUSE SYSTEM (Lap 1-2)
    // ==========================================================

    async _doPause(duration, segment, lapIndex) {
        return new Promise((resolve) => {
            let remaining = duration;
            const startTime = performance.now();

            const drawPause = () => {
                if (!this._isPlaying) { resolve(); return; }

                const elapsed = (performance.now() - startTime) / 1000;
                remaining = Math.max(0, duration - elapsed);

                // Draw the frozen video frame
                this._ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);

                // Semi-transparent overlay
                this._ctx.fillStyle = 'rgba(0,0,0,0.4)';
                this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

                const w = this._canvas.width;
                const h = this._canvas.height;
                const centerX = w / 2;
                const centerY = h / 2;

                // Countdown number
                this._ctx.font = this.config.countdownFont;
                this._ctx.fillStyle = 'rgba(0,240,255,0.9)';
                this._ctx.textAlign = 'center';
                this._ctx.textBaseline = 'middle';
                this._ctx.fillText(Math.ceil(remaining).toString(), centerX, centerY - 40);

                // Quiet Eye cue
                if (segment.quietEyeCue) {
                    this._ctx.font = this.config.overlayFont;
                    this._ctx.fillStyle = '#ffffff';
                    this._ctx.fillText(segment.quietEyeCue, centerX, centerY + 30);
                }

                // "Where are your eyes right now?"
                this._ctx.font = this.config.overlayFontSmall;
                this._ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this._ctx.fillText('Where are your eyes right now?', centerX, centerY + 70);

                // Gaze instruction
                this._drawGazeOverlay(this._ctx, w, h, segment, this.config.lapConfigs[lapIndex]);

                this._ctx.textAlign = 'left';

                if (remaining > 0) {
                    this._animFrameId = requestAnimationFrame(drawPause);
                } else {
                    resolve();
                }
            };

            drawPause();
        });
    },


    // ==========================================================
    //  LAP BREAK SCREEN
    // ==========================================================

    async _showLapBreak(lapNumber, lapLabel) {
        return new Promise((resolve) => {
            let remaining = this.config.lapBreakDuration;
            const startTime = performance.now();

            const drawBreak = () => {
                if (!this._isPlaying) { resolve(); return; }

                const elapsed = (performance.now() - startTime) / 1000;
                remaining = Math.max(0, this.config.lapBreakDuration - elapsed);

                const w = this._canvas.width;
                const h = this._canvas.height;
                const ctx = this._ctx;

                // Dark background
                ctx.fillStyle = '#0a0e1a';
                ctx.fillRect(0, 0, w, h);

                // Subtle gradient ring
                const gradient = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, 300);
                gradient.addColorStop(0, 'rgba(0,200,255,0.1)');
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, w, h);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // "Take a Breath"
                ctx.font = 'italic 300 48px Georgia, serif';
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText('Take a Breath', w / 2, h / 2 - 60);

                // Next lap info
                ctx.font = this.config.overlayFont;
                ctx.fillStyle = this.config.eyesColor;
                ctx.fillText(`Lap ${lapNumber} — ${lapLabel}`, w / 2, h / 2 + 10);

                // Countdown
                ctx.font = 'bold 36px system-ui';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText(Math.ceil(remaining).toString(), w / 2, h / 2 + 60);

                ctx.textAlign = 'left';

                if (remaining > 0) {
                    this._animFrameId = requestAnimationFrame(drawBreak);
                } else {
                    resolve();
                }
            };

            drawBreak();
        });
    },


    // ==========================================================
    //  VOICE CUE SYSTEM
    // ==========================================================

    _lastCuePlayed: null,

    async _loadVoiceCues() {
        // Try to load from IndexedDB (user-uploaded cues)
        try {
            const db = await this._openCueDB();
            const tx = db.transaction('voiceCues', 'readonly');
            const store = tx.objectStore('voiceCues');

            for (const cueId of ['eyes_brakeMarker', 'eyes_apex', 'eyes_exit',
                'aware_apex', 'aware_exit', 'aware_straight']) {
                const req = store.get(cueId);
                req.onsuccess = async () => {
                    if (req.result && req.result.file) {
                        const buffer = await req.result.file.arrayBuffer();
                        this._voiceCues[cueId] = await this._audioCtx.decodeAudioData(buffer);
                    }
                };
            }
        } catch (e) {
            console.warn('[ConditioningEngine] Could not load voice cues:', e);
        }
    },

    _openCueDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('LapBlueprintVoiceCues', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    _checkVoiceCues(segment, time, lapIndex) {
        if (!segment || segment.type === 'straight') return;

        const cueKey = `${segment.type}_${segment.cornerIndex}_${lapIndex}`;
        if (this._lastCuePlayed === cueKey) return;

        // Only play at segment start
        if (time > segment.start + 0.5) return;

        const cueMap = {
            braking: 'eyes_brakeMarker',
            apex: 'eyes_apex',
            exit: 'eyes_exit',
        };

        const cueId = cueMap[segment.type];
        if (cueId && this._voiceCues[cueId]) {
            this._playCue(this._voiceCues[cueId]);
            this._lastCuePlayed = cueKey;
        }
    },

    _playCue(audioBuffer) {
        if (!audioBuffer || !this._audioCtx) return;
        const source = this._audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this._audioCtx.destination);
        source.start(0);
    },


    // ==========================================================
    //  UTILITY
    // ==========================================================

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    },

    /**
     * Generate a single-lap preview (no 5-lap structure) for quick checking.
     */
    async previewSingleLap(lapIndex = 0, onProgress = () => { }, onComplete = () => { }) {
        this._isPlaying = true;
        this._currentLap = lapIndex;
        await this._playLap(lapIndex, onProgress);
        this._isPlaying = false;
        onComplete();
    },

    /**
     * Export the full 5-lap conditioning video.
     * @returns {Promise<Blob>} — WebM video blob
     */
    async exportVideo(onProgress = () => { }) {
        this.startRecording();

        await this.play(
            (lap, progress, msg) => onProgress(lap, progress, msg),
            () => { }
        );

        const blob = await this.stopRecording();
        return blob;
    },

    /**
     * Download a blob as a file.
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};
