/* ============================================================
   APP.JS — Lap Blueprint Builder & 5-Lap Conditioning Player
   ============================================================

   THE 5-LAP STRUCTURE:
   ─────────────────────
   Laps 1–2: PAUSE laps — 5s pause at each gaze point with Audio+Visual "Eyes [X] — Aware [Y]"
   Lap 3:    SLOW lap  — 10% slower, same "Eyes [X] — Aware [Y]" cues, no pauses
   Lap 4:    NORMAL    — Normal speed, "Aware [Y]" cues only
   Lap 5:    FAST      — 10% faster, "[X]" marker only — subconscious mode
   ============================================================ */

const App = {
    currentView: 'dashboard',
    blueprints: [],

    // Builder state
    builder: {
        videoFile: null,
        videoBlobUrl: null,
        videoDuration: 0,
        lapStart: null,
        lapEnd: null,
        currentCornerIndex: 0,
        corners: [],
        trackName: '',
        clientName: '',
        vehicleType: 'motorcycle',
        skillLevel: 'intermediate'
    },

    // Voice cue MP3 storage: cueId → { blobUrl, fileName }
    voiceCues: {},
    _voiceCueAudio: null, // Currently playing Audio element
    _pendingCueId: null,  // Which cue slot is awaiting file selection

    // Maps gaze point type + lap tier → voice cue ID
    CUE_MAP: {
        // Full cues (Laps 1–3): keyed by gaze point type
        full: {
            firstSight: 'full_eyesBrake_awareApex',
            brakingMarker: 'full_eyesApex_awareExit',
            apex: 'full_eyesExit_awareStraight',
            exit: 'full_eyesStraight_awareBrake'
        },
        // Aware cues (Lap 4)
        aware: {
            firstSight: 'aware_brakingMarker',
            brakingMarker: 'aware_apex',
            apex: 'aware_exit',
            exit: 'aware_straight'
        },
        // Marker cues (Lap 5)
        marker: {
            firstSight: 'marker_brakingMarker',
            brakingMarker: 'marker_apex',
            apex: 'marker_exit',
            exit: 'marker_straight'
        }
    },

    // Player state
    player: {
        blueprint: null,
        currentLap: 1,
        currentGazePointIndex: 0,
        isPaused: false,
        pauseTimer: null,
        pauseCountdown: 0,
        isRunning: false,
        allGazePoints: [] // Flattened list of all gaze points sorted by timestamp
    },

    init() {
        AIEngine.init();
        AIEngine.preseedTrackData(); // Load bundled track data (Ruapuna, etc.)
        if (typeof BlueprintTemplates !== 'undefined') BlueprintTemplates.init();
        this.loadBlueprints();
        this.setupNav();
        this.setupSettings();
        this.setupBuilder();
        this.setupVoiceCues();
        this.refreshDashboard();

        // Auto-load bundled voice cues from /audio/ folder
        if (typeof AudioCueLoader !== 'undefined') {
            AudioCueLoader.init().then(count => {
                if (count > 0) {
                    this.toast(`${count} voice cues loaded from /audio/`, 'success');
                }
            });
        }

        // Loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('fade-out');
            document.getElementById('app').classList.remove('hidden');
        }, 2200);

        // Populate settings
        const keyInput = document.getElementById('api-key-input');
        const modelSel = document.getElementById('model-select');
        const claudeKeyInput = document.getElementById('claude-key-input');
        const claudeModelSel = document.getElementById('claude-model-select');
        const providerSel = document.getElementById('blueprint-provider-select');
        if (AIEngine.geminiApiKey) keyInput.value = AIEngine.geminiApiKey;
        if (AIEngine.geminiModel) modelSel.value = AIEngine.geminiModel;
        if (AIEngine.claudeApiKey) claudeKeyInput.value = AIEngine.claudeApiKey;
        if (AIEngine.claudeModel) claudeModelSel.value = AIEngine.claudeModel;
        if (AIEngine.blueprintProvider) providerSel.value = AIEngine.blueprintProvider;

        // OpenAI key
        const openaiKeyInput = document.getElementById('openai-key-input');
        if (openaiKeyInput && AIEngine.openaiApiKey) openaiKeyInput.value = AIEngine.openaiApiKey;

        // Airtable Prompt Lab
        if (typeof AirtablePrompts !== 'undefined') {
            AirtablePrompts.init();
            const atKeyInput = document.getElementById('airtable-key-input');
            const atBaseInput = document.getElementById('airtable-base-input');
            const atTableInput = document.getElementById('airtable-table-input');
            if (atKeyInput && AirtablePrompts._apiKey) atKeyInput.value = AirtablePrompts._apiKey;
            if (atBaseInput && AirtablePrompts._baseId) atBaseInput.value = AirtablePrompts._baseId;
            if (atTableInput && AirtablePrompts._tableId) atTableInput.value = AirtablePrompts._tableId;
        }
    },

    // ===== NAVIGATION =====
    setupNav() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchView(btn.dataset.view));
        });
        document.getElementById('start-builder-btn').addEventListener('click', () => this.switchView('builder'));
    },

    switchView(name) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const el = document.getElementById(`view-${name}`);
        if (el) el.classList.add('active');
        this.currentView = name;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ===== SETTINGS =====
    setupSettings() {
        const modal = document.getElementById('settings-modal');
        document.getElementById('settings-btn').addEventListener('click', () => modal.classList.remove('hidden'));
        document.getElementById('settings-close').addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('.modal-overlay').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('save-settings').addEventListener('click', () => {
            // Gemini key
            const geminiKey = document.getElementById('api-key-input').value.trim();
            if (geminiKey) AIEngine.setGeminiKey(geminiKey);
            AIEngine.setModel(document.getElementById('model-select').value);

            // Claude key
            const claudeKey = document.getElementById('claude-key-input').value.trim();
            if (claudeKey) AIEngine.setClaudeKey(claudeKey);
            const claudeModel = document.getElementById('claude-model-select').value;
            if (claudeModel) { AIEngine.claudeModel = claudeModel; localStorage.setItem('lb_claude_model', claudeModel); }

            // OpenAI key (Track Map Intelligence)
            const openaiKey = document.getElementById('openai-key-input')?.value.trim();
            if (openaiKey) AIEngine.setOpenAIKey(openaiKey);

            // Airtable Prompt Lab
            if (typeof AirtablePrompts !== 'undefined') {
                const atKey = document.getElementById('airtable-key-input')?.value.trim();
                const atBase = document.getElementById('airtable-base-input')?.value.trim();
                const atTable = document.getElementById('airtable-table-input')?.value.trim() || 'Pipeline Prompts';
                AirtablePrompts.setConfig(atKey, atBase, atTable);
                if (atKey && atBase) {
                    AirtablePrompts.clearCache(); // force refresh on next build
                }
            }

            // Blueprint provider
            const provider = document.getElementById('blueprint-provider-select').value;
            AIEngine.setBlueprintProvider(provider);

            modal.classList.add('hidden');
            this.toast('Settings saved', 'success');
        });
    },

    // ===== BUILDER =====
    setupBuilder() {
        const zone = document.getElementById('builder-upload-zone');
        const fileInput = document.getElementById('builder-video-input');

        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) this.builderLoadVideo(e.target.files[0]);
        });
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]?.type.startsWith('video/')) {
                this.builderLoadVideo(e.dataTransfer.files[0]);
            }
        });

        // Gaze point mark buttons
        document.querySelectorAll('.gp-mark-btn').forEach(btn => {
            btn.addEventListener('click', () => this.markGazePoint(btn.dataset.point));
        });

        // Corner navigation
        document.getElementById('marker-next-corner').addEventListener('click', () => this.nextCorner());
        document.getElementById('marker-prev-corner').addEventListener('click', () => this.prevCorner());
        document.getElementById('marker-finish').addEventListener('click', () => this.finishMarking());

        // Build button (both the original and new Step 4 button)
        document.getElementById('build-blueprint-btn').addEventListener('click', () => this.buildBlueprint());
        const mainBlueprintBtn = document.getElementById('build-blueprint-btn-main');
        if (mainBlueprintBtn) {
            mainBlueprintBtn.addEventListener('click', () => {
                this.updatePipelineStep(4);
                this.buildBlueprint();
            });
        }

        // How-it-works toggle
        const howToggle = document.getElementById('how-toggle');
        const howContent = document.getElementById('how-content');
        if (howToggle && howContent) {
            howToggle.addEventListener('click', () => {
                howContent.classList.toggle('hidden');
                howToggle.textContent = howContent.classList.contains('hidden')
                    ? 'How the 3 AIs work together ▾'
                    : 'How the 3 AIs work together ▴';
            });
        }

        // Track Research button
        document.getElementById('research-track-btn').addEventListener('click', () => this.researchTrack());

        // Track name input — detect pre-built blueprints (Ruapuna)
        const trackInput = document.getElementById('builder-track');
        if (trackInput) {
            trackInput.addEventListener('input', () => {
                const name = trackInput.value.trim();
                const researchBtn = document.getElementById('research-track-btn');
                if (typeof RuapunaBlueprint !== 'undefined' && RuapunaBlueprint.isRuapuna(name)) {
                    if (researchBtn) researchBtn.textContent = '🏁 Load Ruapuna QE Blueprint';
                } else {
                    if (researchBtn) researchBtn.textContent = '🔍 Research Track for QE';
                }
            });
        }

        // Track Guide Upload
        const guideDropZone = document.getElementById('track-guide-drop');
        const guideFileInput = document.getElementById('track-guide-input');
        if (guideDropZone && guideFileInput) {
            guideDropZone.addEventListener('click', () => guideFileInput.click());
            guideFileInput.addEventListener('change', e => {
                if (e.target.files[0]) this.handleTrackGuideUpload(e.target.files[0]);
            });
            guideDropZone.addEventListener('dragover', e => { e.preventDefault(); guideDropZone.style.borderColor = 'rgba(16,185,129,0.8)'; });
            guideDropZone.addEventListener('dragleave', () => { guideDropZone.style.borderColor = 'rgba(16,185,129,0.3)'; });
            guideDropZone.addEventListener('drop', e => {
                e.preventDefault();
                guideDropZone.style.borderColor = 'rgba(16,185,129,0.3)';
                if (e.dataTransfer.files[0]) this.handleTrackGuideUpload(e.dataTransfer.files[0]);
            });
            const clearBtn = document.getElementById('track-guide-clear');
            if (clearBtn) clearBtn.addEventListener('click', () => {
                this._trackGuidePages = null;
                document.getElementById('track-guide-status').classList.add('hidden');
                guideFileInput.value = '';
            });
        }
    },

    // ── Track research state ──
    _trackResearchData: null,
    _trackGuidePages: null,

    // ===== VOICE CUES =====
    setupVoiceCues() {
        const fileInput = document.getElementById('audio-cue-file-input');

        // Upload buttons
        document.querySelectorAll('.acs-upload-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._pendingCueId = btn.dataset.cueId;
                fileInput.click();
            });
        });

        // File selected
        fileInput.addEventListener('change', (e) => {
            if (e.target.files[0] && this._pendingCueId) {
                this.loadVoiceCue(this._pendingCueId, e.target.files[0]);
                fileInput.value = ''; // Reset for next use
            }
        });

        // Play buttons
        document.querySelectorAll('.acs-play-btn').forEach(btn => {
            btn.addEventListener('click', () => this.previewVoiceCue(btn.dataset.cueId));
        });

        // Clear buttons
        document.querySelectorAll('.acs-clear-btn').forEach(btn => {
            btn.addEventListener('click', () => this.clearVoiceCue(btn.dataset.cueId));
        });

        // Restore saved cues from IndexedDB
        this.restoreVoiceCues();
    },

    loadVoiceCue(cueId, file) {
        const blobUrl = URL.createObjectURL(file);
        this.voiceCues[cueId] = {
            blobUrl,
            fileName: file.name
        };

        // Update UI for this slot
        this._updateCueSlotUI(cueId, file.name);

        // Persist to IndexedDB
        this.saveVoiceCueToDB(cueId, file);

        this.toast(`Voice cue saved: ${file.name}`, 'success');
    },

    _updateCueSlotUI(cueId, fileName) {
        const slot = document.querySelector(`.audio-cue-slot[data-cue-id="${cueId}"]`);
        if (slot) {
            slot.classList.add('loaded');
            const playBtn = slot.querySelector('.acs-play-btn');
            const clearBtn = slot.querySelector('.acs-clear-btn');
            const uploadBtn = slot.querySelector('.acs-upload-btn');
            const status = slot.querySelector('.acs-status');

            playBtn.classList.remove('hidden');
            clearBtn.classList.remove('hidden');
            uploadBtn.textContent = '🔄 Replace';
            status.textContent = fileName;
            status.classList.add('loaded');
        }
    },

    previewVoiceCue(cueId) {
        const cue = this.voiceCues[cueId];
        if (!cue) return;

        // Stop any playing preview
        if (this._voiceCueAudio) {
            this._voiceCueAudio.pause();
            this._voiceCueAudio = null;
        }

        const audio = new Audio(cue.blobUrl);
        this._voiceCueAudio = audio;

        // Toggle play button appearance
        const playBtn = document.querySelector(`.acs-play-btn[data-cue-id="${cueId}"]`);
        audio.addEventListener('playing', () => { if (playBtn) playBtn.textContent = '⏸'; });
        audio.addEventListener('ended', () => { if (playBtn) playBtn.textContent = '▶'; this._voiceCueAudio = null; });
        audio.addEventListener('pause', () => { if (playBtn) playBtn.textContent = '▶'; });

        audio.play().catch(() => this.toast('Could not play audio', 'error'));
    },

    clearVoiceCue(cueId) {
        // Revoke blob URL
        if (this.voiceCues[cueId]?.blobUrl) {
            URL.revokeObjectURL(this.voiceCues[cueId].blobUrl);
        }
        delete this.voiceCues[cueId];

        // Update UI
        const slot = document.querySelector(`.audio-cue-slot[data-cue-id="${cueId}"]`);
        if (slot) {
            slot.classList.remove('loaded');
            const playBtn = slot.querySelector('.acs-play-btn');
            const clearBtn = slot.querySelector('.acs-clear-btn');
            const uploadBtn = slot.querySelector('.acs-upload-btn');
            const status = slot.querySelector('.acs-status');

            playBtn.classList.add('hidden');
            clearBtn.classList.add('hidden');
            uploadBtn.textContent = '📁 Upload MP3';
            status.textContent = '';
            status.classList.remove('loaded');
        }

        // Remove from IndexedDB
        this.deleteVoiceCueFromDB(cueId);
        this.toast('Voice cue removed', 'info');
    },

    // ─── IndexedDB Persistence for Voice Cues ─────────────

    _openVoiceCueDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('LapBlueprintVoiceCues', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('cues')) {
                    db.createObjectStore('cues', { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async saveVoiceCueToDB(cueId, file) {
        try {
            const db = await this._openVoiceCueDB();
            const arrayBuffer = await file.arrayBuffer();
            const tx = db.transaction('cues', 'readwrite');
            tx.objectStore('cues').put({
                id: cueId,
                data: arrayBuffer,
                fileName: file.name,
                mimeType: file.type || 'audio/mpeg',
                size: file.size,
                savedAt: new Date().toISOString()
            });
            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = rej;
            });
            db.close();
            console.log(`Voice cue "${cueId}" saved to IndexedDB (${(file.size / 1024).toFixed(1)} KB)`);
        } catch (err) {
            console.error('Failed to save voice cue:', err);
        }
    },

    async deleteVoiceCueFromDB(cueId) {
        try {
            const db = await this._openVoiceCueDB();
            const tx = db.transaction('cues', 'readwrite');
            tx.objectStore('cues').delete(cueId);
            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = rej;
            });
            db.close();
        } catch (err) {
            console.error('Failed to delete voice cue:', err);
        }
    },

    async restoreVoiceCues() {
        try {
            const db = await this._openVoiceCueDB();
            const tx = db.transaction('cues', 'readonly');
            const store = tx.objectStore('cues');
            const req = store.getAll();

            const results = await new Promise((res, rej) => {
                req.onsuccess = () => res(req.result);
                req.onerror = rej;
            });
            db.close();

            if (!results.length) return;

            let restored = 0;
            for (const record of results) {
                const blob = new Blob([record.data], { type: record.mimeType });
                const blobUrl = URL.createObjectURL(blob);
                this.voiceCues[record.id] = {
                    blobUrl,
                    fileName: record.fileName
                };
                this._updateCueSlotUI(record.id, record.fileName);
                restored++;
            }

            if (restored > 0) {
                console.log(`Restored ${restored} voice cues from IndexedDB`);
                this.toast(`${restored} voice cue${restored > 1 ? 's' : ''} restored`, 'info');
            }
        } catch (err) {
            console.error('Failed to restore voice cues:', err);
        }
    },

    builderLoadVideo(file) {
        this.builder.videoFile = file;
        this.builder.videoBlobUrl = URL.createObjectURL(file);

        // Auto-detect name
        const trackInput = document.getElementById('builder-track');
        if (!trackInput.value) {
            trackInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        }

        // Show phase 2 (trim) and update pipeline indicator
        document.getElementById('builder-phase-2').classList.remove('hidden');
        this.updatePipelineStep(2);  // Step 2: Trim Lap

        // Setup marker video
        const video = document.getElementById('marker-video');
        video.src = this.builder.videoBlobUrl;
        video.addEventListener('loadedmetadata', () => {
            this.builder.videoDuration = video.duration;
        });

        this.setupMarkerControls();
        this.setupTrimControls();
        this.setupAutoDetect();
        this.setupAIAnalyzer();
        this.setupCornerWizard();

        // Restore saved trim points for this video, or reset
        this.builder.lapStart = null;
        this.builder.lapEnd = null;
        this.restoreTrimPoints(file.name);
        this.updateTrimUI();

        // Auto-init Corner Wizard if both trim points were restored
        if (this.builder.lapStart !== null && this.builder.lapEnd !== null) {
            video.addEventListener('loadeddata', () => {
                this._initCornerWizardCanvas();
            }, { once: true });
        }

        // Start with corner 1
        this.builder.corners = [];
        this.builder.currentCornerIndex = 0;
        this.resetCurrentCorner();

        // Update upload zone appearance
        const zone = document.getElementById('builder-upload-zone');
        zone.innerHTML = `
            <div class="upload-icon">✅</div>
            <h3>${this.escapeHtml(file.name)}</h3>
            <p>${(file.size / (1024 * 1024)).toFixed(1)} MB — Click to change</p>
        `;

        this.toast('Video loaded — set lap start & end, then mark gaze points!', 'success');

        // Scroll to phase 2
        document.getElementById('builder-phase-2').scrollIntoView({ behavior: 'smooth' });
    },

    setupMarkerControls() {
        const video = document.getElementById('marker-video');
        const playBtn = document.getElementById('marker-play');
        const seekBar = document.getElementById('marker-seek');
        const timeDisplay = document.getElementById('marker-time');
        const speedBtn = document.getElementById('marker-speed-btn');

        const speeds = [0.25, 0.5, 0.75, 1, 1.5];
        let spdIdx = 3;

        const fmt = s => {
            const m = Math.floor(s / 60);
            const sec = (s % 60).toFixed(1);
            return `${m}:${sec.padStart(4, '0')}`;
        };

        playBtn.onclick = () => {
            if (video.paused) { video.play(); playBtn.textContent = '⏸'; }
            else { video.pause(); playBtn.textContent = '▶'; }
        };

        video.addEventListener('timeupdate', () => {
            if (video.duration) {
                seekBar.value = (video.currentTime / video.duration) * 1000;
                timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
            }
        });

        video.addEventListener('ended', () => { playBtn.textContent = '▶'; });

        seekBar.oninput = () => {
            if (video.duration) video.currentTime = (seekBar.value / 1000) * video.duration;
        };

        speedBtn.onclick = () => {
            spdIdx = (spdIdx + 1) % speeds.length;
            video.playbackRate = speeds[spdIdx];
            speedBtn.textContent = `${speeds[spdIdx]}×`;
        };

        document.getElementById('marker-rewind').onclick = () => { video.currentTime = Math.max(0, video.currentTime - 5); };
        document.getElementById('marker-forward').onclick = () => { video.currentTime = Math.min(video.duration, video.currentTime + 5); };

        // Frame stepping (~1/30s)
        document.getElementById('marker-frame-back').onclick = () => { video.pause(); playBtn.textContent = '▶'; video.currentTime = Math.max(0, video.currentTime - 1 / 30); };
        document.getElementById('marker-frame-fwd').onclick = () => { video.pause(); playBtn.textContent = '▶'; video.currentTime = Math.min(video.duration, video.currentTime + 1 / 30); };

        // Keyboard shortcuts (while on builder view)
        document.addEventListener('keydown', e => {
            if (this.currentView !== 'builder') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            switch (e.key) {
                case ' ': e.preventDefault(); playBtn.click(); break;
                case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 2); break;
                case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 2); break;
                case '1': this.markGazePoint('firstSight'); break;
                case '2': this.markGazePoint('brakingMarker'); break;
                case '3': this.markGazePoint('apex'); break;
                case '4': this.markGazePoint('exit'); break;
            }
        });
    },

    // ===== LAP TRIM =====
    setupTrimControls() {
        const video = document.getElementById('marker-video');

        document.getElementById('trim-set-start').onclick = () => {
            this.builder.lapStart = video.currentTime;
            this.saveTrimPoints();
            this.updateTrimUI();
            this.showMarkerOverlay('🏁 Lap Start set at ' + this.formatTimestamp(video.currentTime));
            this.toast(`Lap Start: ${this.formatTimestamp(video.currentTime)}`, 'success');

            // Auto-initialize Corner Wizard if end is already set
            if (this.builder.lapEnd !== null) {
                this._initCornerWizardCanvas();
            }
        };

        document.getElementById('trim-set-end').onclick = () => {
            this.builder.lapEnd = video.currentTime;
            this.saveTrimPoints();
            this.updateTrimUI();
            this.showMarkerOverlay('🏁 Lap End set at ' + this.formatTimestamp(video.currentTime));
            this.toast(`Lap End: ${this.formatTimestamp(video.currentTime)}`, 'success');

            // Auto-initialize Corner Wizard with the video
            if (this.builder.lapStart !== null) {
                this._initCornerWizardCanvas();
            }
        };
    },

    updateTrimUI() {
        const startTime = document.getElementById('trim-start-time');
        const endTime = document.getElementById('trim-end-time');
        const duration = document.getElementById('trim-duration');
        const barFill = document.getElementById('trim-bar-fill');
        const barLabel = document.getElementById('trim-bar-label');
        const startSlot = document.getElementById('trim-start-slot');
        const endSlot = document.getElementById('trim-end-slot');

        const hasStart = this.builder.lapStart !== null;
        const hasEnd = this.builder.lapEnd !== null;

        startTime.textContent = hasStart ? this.formatTimestamp(this.builder.lapStart) : '—';
        endTime.textContent = hasEnd ? this.formatTimestamp(this.builder.lapEnd) : '—';
        startSlot.classList.toggle('set', hasStart);
        endSlot.classList.toggle('set', hasEnd);

        if (hasStart && hasEnd && this.builder.videoDuration > 0) {
            const lapDuration = this.builder.lapEnd - this.builder.lapStart;
            duration.textContent = `Duration: ${this.formatTimestamp(lapDuration)}`;

            // Visual bar
            const startPct = (this.builder.lapStart / this.builder.videoDuration) * 100;
            const widthPct = (lapDuration / this.builder.videoDuration) * 100;
            barFill.style.left = `${startPct}%`;
            barFill.style.width = `${widthPct}%`;
            barLabel.textContent = `${this.formatTimestamp(this.builder.lapStart)} → ${this.formatTimestamp(this.builder.lapEnd)}`;
        } else {
            duration.textContent = 'Duration: —';
            barFill.style.width = '0%';
            barLabel.textContent = 'Set start and end to define the lap';
        }
    },

    // ─── Trim Point Persistence ───────────────────────────
    /**
     * Save current lap start/end to localStorage, keyed by video filename.
     */
    saveTrimPoints() {
        if (!this.builder.videoFile) return;
        const key = 'lb_trim_' + this.builder.videoFile.name;
        const data = {
            lapStart: this.builder.lapStart,
            lapEnd: this.builder.lapEnd,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`Trim points saved for "${this.builder.videoFile.name}": start=${data.lapStart}, end=${data.lapEnd}`);
    },

    /**
     * Restore saved trim points for a given video filename.
     * @param {string} fileName — the video file name
     */
    restoreTrimPoints(fileName) {
        const key = 'lb_trim_' + fileName;
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return;
            const data = JSON.parse(saved);
            if (data.lapStart !== null && data.lapStart !== undefined) {
                this.builder.lapStart = data.lapStart;
            }
            if (data.lapEnd !== null && data.lapEnd !== undefined) {
                this.builder.lapEnd = data.lapEnd;
            }
            if (this.builder.lapStart !== null || this.builder.lapEnd !== null) {
                console.log(`Trim points restored for "${fileName}": start=${this.builder.lapStart}, end=${this.builder.lapEnd}`);
                this.toast('✅ Trim points restored from last session', 'success');
            }
        } catch (err) {
            console.error('Failed to restore trim points:', err);
        }
    },

    // ─────────────────────────────────────────────────────────
    //  GEMINI AUTO-DETECT — Full Video Forward Pass
    // ─────────────────────────────────────────────────────────

    _autoDetectResults: null,   // Latest auto-detect results from Gemini

    setupAutoDetect() {
        const btn = document.getElementById('auto-detect-btn');
        const confirmBtn = document.getElementById('auto-detect-confirm-btn');
        const editBtn = document.getElementById('auto-detect-edit-btn');

        if (!btn) return;

        btn.onclick = () => this.runAutoDetect();

        if (confirmBtn) {
            confirmBtn.onclick = () => this.confirmAutoDetectCorners();
        }

        if (editBtn) {
            editBtn.onclick = () => {
                // Allow inline editing — for now just enable delete buttons
                this.toast('Click the × on any corner to remove it', 'info');
            };
        }
    },

    async runAutoDetect() {
        if (!AIEngine.geminiApiKey) {
            this.toast('Set your Gemini API key in Settings first', 'error');
            return;
        }
        if (!this.builder.videoFile) {
            this.toast('Upload a video first', 'error');
            return;
        }

        // Update pipeline to step 3 (detecting)
        this.updatePipelineStep(3);

        const btn = document.getElementById('auto-detect-btn');
        const progressEl = document.getElementById('auto-detect-progress');
        const progressFill = document.getElementById('auto-detect-progress-fill');
        const statusEl = document.getElementById('auto-detect-status');
        const resultsEl = document.getElementById('auto-detect-results');

        // Disable button, show progress
        btn.disabled = true;
        btn.textContent = '⏳ Analysing...';
        progressEl.classList.remove('hidden');
        resultsEl.classList.add('hidden');

        // Read current form values
        const trackNameInput = document.getElementById('builder-track');
        const vehicleInput = document.getElementById('builder-vehicle');
        if (trackNameInput) this.builder.trackName = trackNameInput.value.trim();
        if (vehicleInput) this.builder.vehicleType = vehicleInput.value;

        try {
            const result = await AIEngine.analyzeVideoForward(
                this.builder.videoFile,
                {
                    trackName: this.builder.trackName || null,
                    vehicleType: this.builder.vehicleType || null,
                    lapStart: this.builder.lapStart,
                    lapEnd: this.builder.lapEnd
                },
                (pct, msg) => {
                    progressFill.style.width = `${pct}%`;
                    statusEl.textContent = msg;
                }
            );

            this._autoDetectResults = result;
            this._renderAutoDetectResults(result);

            resultsEl.classList.remove('hidden');
            progressEl.classList.add('hidden');

            this.toast(`Detected ${result.corners?.length || 0} corners`, 'success');

        } catch (err) {
            console.error('[AutoDetect] Error:', err);
            statusEl.textContent = `Error: ${err.message}`;
            this.toast(`Analysis failed: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🔍 Analyse Full Lap Video';
        }
    },

    _renderAutoDetectResults(result) {
        const listEl = document.getElementById('auto-detect-corners-list');
        if (!listEl || !result.corners) return;

        listEl.innerHTML = '';

        if (result.trackEstimate && result.trackEstimate !== 'Unknown') {
            const trackEst = document.createElement('div');
            trackEst.style.cssText = 'margin-bottom: 10px; font-size: 13px; color: var(--text-muted);';
            trackEst.textContent = `Track identified: ${result.trackEstimate} (${result.totalCorners || result.corners.length} corners, ${(result.lapDuration || 0).toFixed(1)}s lap)`;
            listEl.appendChild(trackEst);
        }

        result.corners.forEach((corner, idx) => {
            const card = document.createElement('div');
            card.className = 'auto-detect-corner-card';
            card.dataset.cornerIndex = idx;

            const dir = (corner.direction || 'right').toLowerCase();
            const conf = corner.confidence || 0.5;
            const confClass = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'medium' : 'low';

            const ts = corner.timestamps || {};
            const formatT = (t) => t != null ? `${t.toFixed(1)}s` : '—';

            card.innerHTML = `
                <div class="ad-corner-num ${dir}">${corner.number || idx + 1}</div>
                <div class="ad-corner-info">
                    <div class="ad-corner-name">${corner.name || 'Turn ' + (idx + 1)} — ${dir.toUpperCase()}</div>
                    <div class="ad-corner-type">${corner.type || 'medium'} · ${corner.severity || 'medium'}</div>
                </div>
                <div class="ad-corner-timestamps">
                    <span>🎯 ${formatT(ts.entry)}</span>
                    <span>◎ ${formatT(ts.apex)}</span>
                    <span>➡ ${formatT(ts.exit)}</span>
                </div>
                <div class="ad-corner-conf ${confClass}">${(conf * 100).toFixed(0)}%</div>
                <button class="ad-corner-delete" title="Remove corner">×</button>
            `;

            // Seek to entry on click
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('ad-corner-delete')) return;
                const video = document.getElementById('marker-video');
                if (video && ts.entry != null) {
                    video.currentTime = ts.entry;
                    video.pause();
                }
            });

            // Delete button
            card.querySelector('.ad-corner-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                result.corners.splice(idx, 1);
                this._renderAutoDetectResults(result);
            });

            listEl.appendChild(card);
        });
    },

    confirmAutoDetectCorners() {
        if (!this._autoDetectResults || !this._autoDetectResults.corners?.length) {
            this.toast('No corners detected yet', 'error');
            return;
        }

        // Convert auto-detect format to builder.corners format
        const corners = this._autoDetectResults.corners.map((c, idx) => {
            const ts = c.timestamps || {};
            return {
                number: c.number || idx + 1,
                name: c.name || `Turn ${idx + 1}`,
                direction: c.direction || 'right',
                cornerType: c.type || 'medium',
                severity: c.severity || 'medium',
                brakeMarkerVisible: ts.brakeMarkerVisible || null,
                brakeTime: ts.entry || 0,
                apexTime: ts.apex || 0,
                exitTime: ts.exit || 0,
                nextMarkerVisible: ts.nextMarkerVisible || null,
                visualReferences: c.visualReferences || {},
                isPartOfComplex: c.isPartOfComplex || false,
                complexWith: c.complexWith || [],
                confidence: c.confidence || 0.5,
                source: 'gemini_auto_detect'
            };
        });

        this.builder.corners = corners;
        this.toast(`✅ ${corners.length} corners confirmed — ready for blueprint generation`, 'success');

        // Update pipeline to step 4 (ready for blueprint)
        this.updatePipelineStep(4);

        // Update any existing corner display
        this._updateCornersList();

        // If track estimate is available and no track name set, use it
        if (this._autoDetectResults.trackEstimate && this._autoDetectResults.trackEstimate !== 'Unknown' && !this.builder.trackName) {
            this.builder.trackName = this._autoDetectResults.trackEstimate;
            const trackInput = document.getElementById('builder-track');
            if (trackInput) trackInput.value = this.builder.trackName;
        }

        // Show the build conditioning button area
        const condLaunch = document.getElementById('conditioning-launch');
        if (condLaunch) condLaunch.scrollIntoView({ behavior: 'smooth' });
    },

    /**
     * Update the existing corner list display (if applicable).
     * Syncs builder.corners to any UI showing corner data.
     */
    _updateCornersList() {
        // If there's an AI corners list, update its count display
        const aiCornersList = document.getElementById('ai-corners-list');
        if (aiCornersList && this.builder.corners) {
            // Just update any visible counter — the auto-detect list is already rendered separately
            console.log(`[App] Corners list updated: ${this.builder.corners.length} corners`);
        }
    },

    // ─────────────────────────────────────────────────────────
    //  RUAPUNA BLUEPRINT AUTO-LOAD
    // ─────────────────────────────────────────────────────────

    /**
     * Check if a track name matches Ruapuna and auto-load the pre-built blueprint.
     * Called from researchTrack(), confirmAutoDetectCorners(), and on track name change.
     * @param {string} trackName
     * @returns {boolean} true if Ruapuna was loaded
     */
    tryLoadRuapunaBlueprint(trackName) {
        if (typeof RuapunaBlueprint === 'undefined') return false;
        if (!RuapunaBlueprint.isRuapuna(trackName)) return false;

        const vehicleType = document.getElementById('builder-vehicle')?.value || 'car';
        const video = document.getElementById('marker-video');
        const lapStart = this.builder.lapStart || 0;
        const lapEnd = this.builder.lapEnd || (video?.duration || 90);

        // Load corners from the pre-built blueprint
        this.builder.corners = RuapunaBlueprint.toCornersArray(lapStart, lapEnd);
        this.builder.blueprint = RuapunaBlueprint.toBlueprint(vehicleType, lapStart, lapEnd);
        this.builder.lastBlueprint = this.builder.blueprint;
        this.builder.trackName = trackName;

        // Also set track research data so PDF export has it
        this._trackResearchData = {
            trackName: RuapunaBlueprint.trackName,
            country: RuapunaBlueprint.country,
            length: RuapunaBlueprint.length,
            direction: RuapunaBlueprint.direction,
            corners: this.builder.corners
        };

        // Update UI
        this._updateCornersList();

        console.log(`[App] ✅ Ruapuna QE Blueprint auto-loaded: ${this.builder.corners.length} sections, 4 cues each`);
        this.toast(`🏁 Ruapuna QE Blueprint loaded — ${this.builder.corners.length} sections × 4 cues = ${this.builder.corners.length * 4} pause points`, 'success');

        // Show conditioning launch area if it exists
        const condLaunch = document.getElementById('conditioning-launch');
        if (condLaunch) condLaunch.scrollIntoView({ behavior: 'smooth' });

        return true;
    },

    // ─────────────────────────────────────────────────────────
    //  AI LAP ANALYZER INTEGRATION (Legacy Frame-by-Frame)
    // ─────────────────────────────────────────────────────────

    _aiResults: null,       // Latest analysis results
    _aiAccepted: [],        // Array of booleans per detected corner

    // ─────────────────────────────────────────────────────────
    //  CORNER WIZARD SETUP
    // ─────────────────────────────────────────────────────────

    setupCornerWizard() {
        const self = this;

        // Frame stepping
        document.getElementById('cw-back-5').onclick = () => CornerWizard.stepBackwardMulti(5);
        document.getElementById('cw-back-1').onclick = () => CornerWizard.stepBackward();
        document.getElementById('cw-fwd-1').onclick = () => CornerWizard.stepForward();
        document.getElementById('cw-fwd-5').onclick = () => CornerWizard.stepForwardMulti(5);
        document.getElementById('cw-slow-play').onclick = () => CornerWizard.playSlowFromHere();
        document.getElementById('cw-pause').onclick = () => CornerWizard.pause();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only when wizard panel is visible
            if (document.getElementById('corner-wizard-panel').classList.contains('hidden')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            switch (e.key) {
                case 'ArrowLeft': e.preventDefault(); CornerWizard.stepBackward(); break;
                case 'ArrowRight': e.preventDefault(); CornerWizard.stepForward(); break;
                case 'ArrowUp': e.preventDefault(); CornerWizard.stepForwardMulti(5); break;
                case 'ArrowDown': e.preventDefault(); CornerWizard.stepBackwardMulti(5); break;
                case ' ': e.preventDefault();
                    if (self._cwVideo && self._cwVideo.paused) CornerWizard.playSlowFromHere();
                    else CornerWizard.pause();
                    break;
                case 'Enter': e.preventDefault(); document.getElementById('cw-confirm-btn').click(); break;
                case 'Escape': e.preventDefault(); document.getElementById('cw-skip-btn').click(); break;
            }
        });

        // Scan button
        document.getElementById('cw-scan-btn').onclick = async () => {
            const video = document.getElementById('marker-video');
            if (!video || !video.src) {
                self.toast('Load a video first', 'error');
                return;
            }
            if (self.builder.lapStart === null || self.builder.lapEnd === null) {
                self.toast('Set lap start and end first', 'error');
                return;
            }

            // Initialize wizard if not already
            if (CornerWizard._currentPhase === 'idle' || !CornerWizard._video) {
                await self._initCornerWizardCanvas();
            }

            await CornerWizard.scanForNextCorner();
        };

        // Confirm / Skip
        document.getElementById('cw-confirm-btn').onclick = () => CornerWizard.confirmMarker();
        document.getElementById('cw-skip-btn').onclick = () => CornerWizard.skipMarker();

        // Manual mark buttons
        document.getElementById('cw-mark-brake').onclick = () => CornerWizard.manualMark('brake');
        document.getElementById('cw-mark-apex').onclick = () => CornerWizard.manualMark('apex');
        document.getElementById('cw-mark-exit').onclick = () => CornerWizard.manualMark('exit');

        // Finish button
        document.getElementById('cw-finish-btn').onclick = () => {
            const corners = CornerWizard.finish();
            self._onWizardComplete(corners);
        };
    },

    /**
     * Initialize the Corner Wizard canvas with the video.
     * Called automatically when both trim start and end are set,
     * OR when Scan is clicked for the first time.
     */
    async _initCornerWizardCanvas() {
        const video = document.getElementById('marker-video');
        if (!video || !video.src) return;
        if (this.builder.lapStart === null || this.builder.lapEnd === null) return;

        const canvas = document.getElementById('cw-canvas');
        const trackMapUrl = this.builder.trackMapUrl || null;

        await CornerWizard.init(
            video, canvas,
            this.builder.lapStart, this.builder.lapEnd,
            trackMapUrl,
            (state) => this._updateWizardUI(state),
            (corners) => this._onWizardComplete(corners)
        );
        this._cwVideo = video;

        // Scroll to the wizard
        document.getElementById('corner-wizard-panel').scrollIntoView({ behavior: 'smooth' });
        this.toast('Corner Wizard ready — video loaded', 'success');
    },

    _updateWizardUI(state) {
        // Status message
        const statusEl = document.getElementById('cw-status-text');
        statusEl.innerHTML = (state.message || '').replace(/\n/g, '<br>');

        // Time display
        const timeEl = document.getElementById('cw-time-display');
        const m = Math.floor(state.currentTime / 60);
        const s = (state.currentTime % 60).toFixed(2);
        timeEl.textContent = `${m}:${s.padStart(5, '0')}`;

        // Show/hide confirm row based on phase
        const scanRow = document.getElementById('cw-scan-row');
        const confirmRow = document.getElementById('cw-confirm-row');
        const isProposing = state.phase.startsWith('proposing_');
        scanRow.classList.toggle('hidden', isProposing);
        confirmRow.classList.toggle('hidden', !isProposing);

        // Corner progress
        const progressEl = document.getElementById('cw-corner-progress');
        if (state.currentCorner) {
            progressEl.classList.remove('hidden');
            document.getElementById('cw-cp-title').textContent =
                `Corner ${state.currentCorner.number}${state.currentCorner.direction ? ' — ' + state.currentCorner.direction : ''}`;

            const fmt = (t) => t !== null && t !== undefined ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : '—';
            document.getElementById('cw-cp-brake-time').textContent = state.currentCorner.brake ? fmt(state.currentCorner.brake.time) : '—';
            document.getElementById('cw-cp-apex-time').textContent = state.currentCorner.apex ? fmt(state.currentCorner.apex.time) : '—';
            document.getElementById('cw-cp-exit-time').textContent = state.currentCorner.exit ? fmt(state.currentCorner.exit.time) : '—';

            // Highlight active marker
            document.getElementById('cw-cp-brake').style.opacity = state.phase === 'proposing_brake' ? '1' : '0.5';
            document.getElementById('cw-cp-apex').style.opacity = state.phase === 'proposing_apex' ? '1' : '0.5';
            document.getElementById('cw-cp-exit').style.opacity = state.phase === 'proposing_exit' ? '1' : '0.5';
        } else {
            progressEl.classList.add('hidden');
        }

        // Update completed corners list
        this._renderWizardCorners(state.completedCorners);
    },

    _renderWizardCorners(corners) {
        const container = document.getElementById('cw-corners-list');
        if (!corners || corners.length === 0) {
            container.innerHTML = '';
            return;
        }

        const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

        container.innerHTML = corners.map((c, i) => `
            <div class="cw-corner-card" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 10px; margin-top: 6px; border-left: 3px solid ${c.direction === 'left' ? '#7c3aed' : '#00f0ff'};">
                <div style="font-weight: 700; color: var(--text-secondary); min-width: 24px;">C${c.number}</div>
                <div style="display: flex; gap: 8px; flex: 1; flex-wrap: wrap;">
                    ${c.brake ? `<span style="color:#ff6b35; font-size:13px;">BRK ${fmt(c.brake.time)} ${c.brake.confirmed ? '✓' : '~'}</span>` : ''}
                    ${c.apex ? `<span style="color:#00f0ff; font-size:13px;">APX ${fmt(c.apex.time)} ${c.apex.confirmed ? '✓' : '~'}</span>` : ''}
                    ${c.exit ? `<span style="color:#10b981; font-size:13px;">EXT ${fmt(c.exit.time)} ${c.exit.confirmed ? '✓' : '~'}</span>` : ''}
                </div>
                <span style="font-size: 12px; color: var(--text-muted);">${c.direction || ''} ${c.severity || ''}</span>
            </div>
        `).join('');
    },

    _onWizardComplete(corners) {
        if (!corners || corners.length === 0) {
            this.toast('No corners marked', 'info');
            return;
        }

        // Convert wizard corners to builder format
        this.builder.corners = corners.map((c, i) => ({
            name: c.name || `Turn ${i + 1}`,
            cornerType: c.severity === 'hairpin' ? 'hairpin' :
                c.severity === 'fast_sweeper' ? 'sweeper' :
                    c.severity === 'kink' ? 'kink' :
                        c.severity || 'medium',
            type: c.severity === 'hairpin' ? 'hairpin' :
                c.severity === 'fast_sweeper' ? 'sweeper' :
                    c.severity === 'kink' ? 'kink' :
                        c.severity || 'medium',
            direction: c.direction || 'unknown',
            severity: c.severity || 'medium',
            firstSight: c.brake ? c.brake.time - 1 : null,
            brakingMarker: c.brake ? c.brake.time : null,
            apex: c.apex ? c.apex.time : null,
            exit: c.exit ? c.exit.time : null,
            gazeTargets: c.gazeTargets || {},
        }));

        this.builder.currentCornerIndex = 0;
        this.resetCurrentCorner();
        this.updateCornersSummary();

        // Also store for conditioning engine
        this._wizardCorners = corners;

        this.toast(`${corners.length} corners marked and applied!`, 'success');

        // Show conditioning video section
        document.getElementById('conditioning-player').classList.remove('hidden');
    },

    setupAIAnalyzer() {
        // Track map upload
        const mapDrop = document.getElementById('ai-track-map-drop');
        const mapInput = document.getElementById('ai-track-map-input');

        mapDrop.onclick = () => mapInput.click();
        mapInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            LapAnalyzer.setTrackMap(url);
            document.getElementById('ai-map-preview').src = url;
            document.getElementById('ai-map-preview').classList.remove('hidden');
            document.getElementById('ai-map-placeholder').classList.add('hidden');
            this.toast('Track map loaded', 'success');
        };

        // Drag & drop for track map
        mapDrop.ondragover = (e) => { e.preventDefault(); mapDrop.style.borderColor = 'var(--accent-cyan)'; };
        mapDrop.ondragleave = () => { mapDrop.style.borderColor = ''; };
        mapDrop.ondrop = (e) => {
            e.preventDefault();
            mapDrop.style.borderColor = '';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                mapInput.files = e.dataTransfer.files;
                mapInput.dispatchEvent(new Event('change'));
            }
        };

        // Analyze button
        document.getElementById('ai-analyze-btn').onclick = () => this.runAIAnalysis();

        // Accept all button
        document.getElementById('ai-accept-all').onclick = () => {
            if (!this._aiResults) return;
            this._aiAccepted = this._aiResults.corners.map(() => true);
            this.renderAICorners();
        };

        // Apply button
        document.getElementById('ai-apply-btn').onclick = () => this.applyAIDetections();

        // Preview viewer navigation
        this.setupAIPreviewViewer();

        // ── CONDITIONING VIDEO CONTROLS ────────────────────
        document.getElementById('build-conditioning-btn').onclick = () => this.buildConditioningVideo();
        document.getElementById('cond-preview-btn').onclick = () => this.previewConditioningLap();
        document.getElementById('cond-play-5-btn').onclick = () => this.playConditioningFull();
        document.getElementById('cond-stop-btn').onclick = () => this.stopConditioning();
        document.getElementById('cond-export-btn').onclick = () => this.exportConditioningVideo();

        // PDF Export
        const pdfBtn = document.getElementById('pdf-export-btn');
        if (pdfBtn) {
            pdfBtn.onclick = () => this.exportPDF();
        }
    },

    exportPDF() {
        if (!this.builder.corners?.length) {
            this.toast('No corners to export — detect corners first', 'error');
            return;
        }

        this.updatePipelineStep(6);  // Step 6: Export

        try {
            const fileName = PDFExport.generate({
                trackName: this.builder.trackName || 'Unknown Track',
                vehicleType: this.builder.vehicleType || document.getElementById('builder-vehicle')?.value || 'car',
                clientName: this.builder.clientName || '',
                corners: this.builder.corners,
                blueprint: this.builder.lastBlueprint || this.builder.blueprint || null,
                trackData: this.builder.trackData || this._trackResearchData || null
            });
            this.toast(`PDF exported: ${fileName}`, 'success');
        } catch (err) {
            console.error('[PDF Export] Error:', err);
            this.toast(`PDF export failed: ${err.message}`, 'error');
        }
    },

    async runAIAnalysis() {
        const video = document.getElementById('marker-video');
        const startTime = this.builder.lapStart;
        const endTime = this.builder.lapEnd;

        // Validate
        if (startTime === null || endTime === null) {
            this.toast('Set Lap Start and Lap End before running AI analysis', 'error');
            return;
        }
        if (endTime <= startTime) {
            this.toast('Lap End must be after Lap Start', 'error');
            return;
        }

        // Configure from UI
        const sensitivity = parseInt(document.getElementById('ai-sensitivity').value) / 100;
        const sampleRate = parseInt(document.getElementById('ai-sample-rate').value);
        LapAnalyzer.config.sampleRate = sampleRate;
        // Sensitivity scales thresholds: higher = more forgiving, but with safe floors
        LapAnalyzer.config.brakeThreshold = Math.max(0.015, 0.04 - (sensitivity * 0.025));
        LapAnalyzer.config.confidenceThreshold = Math.max(0.4, 0.65 - (sensitivity * 0.25));
        LapAnalyzer.config.minSteeringMagnitude = Math.max(0.08, 0.20 - (sensitivity * 0.12));
        LapAnalyzer.config.minCornerDuration = Math.max(0.6, 1.2 - (sensitivity * 0.6));

        console.log('[AI Analysis] Sensitivity:', sensitivity.toFixed(2), {
            brakeThreshold: LapAnalyzer.config.brakeThreshold,
            confidenceThreshold: LapAnalyzer.config.confidenceThreshold,
            minSteeringMagnitude: LapAnalyzer.config.minSteeringMagnitude,
            minCornerDuration: LapAnalyzer.config.minCornerDuration,
        });

        // Show progress
        const progressEl = document.getElementById('ai-progress');
        const fillEl = document.getElementById('ai-progress-fill');
        const statusEl = document.getElementById('ai-progress-status');
        progressEl.classList.remove('hidden');

        const btn = document.getElementById('ai-analyze-btn');
        btn.classList.add('analyzing');
        btn.innerHTML = '<div class="spinner-sm"></div> Analyzing...';

        // Pause video during analysis
        video.pause();

        try {
            // Determine which analyzer to use
            const useVision = AIEngine.isConfigured();

            if (useVision) {
                // ── GPT-4o VISION ANALYZER (primary) ──────────────
                statusEl.textContent = 'Using GPT-4o Vision AI...';

                const trackMapUrl = LapAnalyzer.trackMapImage || null;

                this._aiResults = await VisionAnalyzer.analyze(
                    video, startTime, endTime, trackMapUrl,
                    (progress, msg) => {
                        fillEl.style.width = `${Math.round(progress * 100)}%`;
                        statusEl.textContent = msg;
                    }
                );

                // Capture thumbnails using VisionAnalyzer
                statusEl.textContent = 'Capturing corner previews...';
                this._aiThumbnails = await VisionAnalyzer.captureCornerThumbnails(
                    video, this._aiResults.corners,
                    (p, msg) => {
                        fillEl.style.width = `${Math.round(95 + p * 5)}%`;
                        statusEl.textContent = msg;
                    }
                );

            } else {
                // ── FALLBACK: Basic CV Analyzer ──────────────────
                statusEl.textContent = 'No API key — using basic CV analysis...';
                this.toast('Set OpenAI API key in Settings for GPT-4o Vision analysis (much more accurate)', 'warning');

                this._aiResults = await LapAnalyzer.analyze(video, startTime, endTime, (progress, msg) => {
                    fillEl.style.width = `${Math.round(progress * 100)}%`;
                    statusEl.textContent = msg;
                });

                // Render signal chart (only available with CV analyzer)
                this.renderAISignalChart();

                statusEl.textContent = 'Capturing corner previews...';
                this._aiThumbnails = await LapAnalyzer.captureCornerThumbnails(
                    video, this._aiResults.corners,
                    (p, msg) => {
                        fillEl.style.width = `${Math.round(95 + p * 5)}%`;
                        statusEl.textContent = msg;
                    }
                );
            }

            // Initialize acceptance state
            this._aiAccepted = this._aiResults.corners.map(() => true);

            // Render corner cards
            this.renderAICorners();

            // Show results sections
            if (!useVision) {
                document.getElementById('ai-signals').classList.remove('hidden');
            }
            document.getElementById('ai-results').classList.remove('hidden');

            // Show preview viewer on first corner
            if (this._aiResults.corners.length > 0) {
                this._aiPreviewIdx = 0;
                this.showAIPreview(0);
            }

            const method = useVision ? 'GPT-4o Vision' : 'Basic CV';
            this.toast(`${method}: detected ${this._aiResults.corners.length} corners — review thumbnails and accept/reject`, 'success');
        } catch (err) {
            console.error('AI Analysis failed:', err);
            this.toast('Analysis failed: ' + err.message, 'error');
        } finally {
            btn.classList.remove('analyzing');
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                Re-Analyze Lap
            `;
        }
    },

    _aiThumbnails: [],      // Array of { brake, apex, exit } thumbnail data URLs
    _aiPreviewIdx: 0,       // Currently previewed corner index

    renderAISignalChart() {
        const wrap = document.getElementById('ai-chart-wrap');
        wrap.innerHTML = '';
        const chartCanvas = LapAnalyzer.renderSignalChart(wrap.clientWidth || 800, 200);
        wrap.appendChild(chartCanvas);
    },

    renderAICorners() {
        const list = document.getElementById('ai-corners-list');
        if (!this._aiResults || !this._aiResults.corners.length) {
            list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:var(--space-xl);">
                No corners detected — try increasing sensitivity or adjusting lap trim bounds
            </div>`;
            return;
        }

        const fmt = (t) => {
            const rel = t - (this.builder.lapStart || 0);
            const m = Math.floor(rel / 60);
            const s = (rel % 60).toFixed(1);
            return `${m}:${s.padStart(4, '0')}`;
        };

        list.innerHTML = this._aiResults.corners.map((c, i) => {
            const accepted = this._aiAccepted[i];
            const confPct = Math.round(c.confidence * 100);
            const confColor = confPct >= 80 ? '#10b981' : confPct >= 60 ? '#fbbf24' : '#ef4444';
            const thumbs = this._aiThumbnails[i] || {};
            const typeIcons = { right: '↱', left: '↰', hairpin: '↩', kink: '∼', chicane: '⇌', complex: '✦' };
            const isActive = i === this._aiPreviewIdx;

            return `
                <div class="ai-corner-card ${accepted ? 'accepted' : 'rejected'} ${isActive ? 'active-preview' : ''}" data-ai-idx="${i}">
                    <div class="ai-cc-number">${i + 1}</div>
                    <div class="ai-cc-type ${c.cornerType}">${typeIcons[c.cornerType] || '↱'} ${c.cornerType}</div>
                    <div class="ai-cc-thumbs-row">
                        ${thumbs.firstSight ? `<img class="ai-cc-thumb" src="${thumbs.firstSight}" alt="Sight" title="First Sight @ ${fmt(c.firstSight.time)}">` : ''}
                        ${thumbs.brake ? `<img class="ai-cc-thumb" src="${thumbs.brake}" alt="Brake" title="Brake @ ${fmt(c.brake.time)}">` : ''}
                        ${thumbs.apex ? `<img class="ai-cc-thumb" src="${thumbs.apex}" alt="Apex" title="Apex @ ${fmt(c.apex.time)}">` : ''}
                        ${thumbs.exit ? `<img class="ai-cc-thumb" src="${thumbs.exit}" alt="Exit" title="Exit @ ${fmt(c.exit.time)}">` : ''}
                    </div>
                    <div class="ai-cc-markers">
                        ${c.firstSight ? `<span class="ai-cc-marker sight">👁 ${fmt(c.firstSight.time)}</span>` : ''}
                        ${c.brake ? `<span class="ai-cc-marker brake">🎯 ${fmt(c.brake.time)}</span>` : ''}
                        ${c.apex ? `<span class="ai-cc-marker apex">◎ ${fmt(c.apex.time)}</span>` : ''}
                        ${c.exit ? `<span class="ai-cc-marker exit">➡ ${fmt(c.exit.time)}</span>` : ''}
                    </div>
                    <div class="ai-cc-confidence">
                        <div class="ai-cc-conf-bar">
                            <div class="ai-cc-conf-fill" style="width:${confPct}%;background:${confColor}"></div>
                        </div>
                        <span class="ai-cc-conf-text">${confPct}%</span>
                    </div>
                    ${c.bidirectionalCount > 0 ? `<span class="ai-cc-bidir" title="Confirmed by bidirectional processing">✓✓</span>` : ''}
                    <div class="ai-cc-actions">
                        <button class="ai-cc-btn ${accepted ? 'active-accept' : ''}"
                                onclick="App.toggleAICorner(${i}, true)" title="Accept">✓</button>
                        <button class="ai-cc-btn ${!accepted ? 'active-reject' : ''}"
                                onclick="App.toggleAICorner(${i}, false)" title="Reject">✕</button>
                        <button class="ai-cc-btn ${isActive ? 'active-accept' : ''}"
                                onclick="App.showAIPreview(${i})" title="Preview this corner">👁</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    /** Show the preview viewer for a specific corner */
    showAIPreview(idx) {
        if (!this._aiResults || idx < 0 || idx >= this._aiResults.corners.length) return;
        this._aiPreviewIdx = idx;
        const corner = this._aiResults.corners[idx];
        const thumbs = this._aiThumbnails[idx] || {};
        const accepted = this._aiAccepted[idx];

        const viewer = document.getElementById('ai-preview-viewer');
        viewer.classList.remove('hidden');

        // Title
        const typeLabels = { right: 'Right', left: 'Left', hairpin: 'Hairpin', kink: 'Kink', chicane: 'Chicane', complex: 'Complex' };
        document.getElementById('ai-pv-title').textContent =
            `Corner ${idx + 1} of ${this._aiResults.corners.length} — ${typeLabels[corner.cornerType] || corner.cornerType}`;

        // Thumbnails
        const fmt = (t) => {
            const rel = t - (this.builder.lapStart || 0);
            const m = Math.floor(rel / 60);
            const s = (rel % 60).toFixed(1);
            return `${m}:${s.padStart(4, '0')}`;
        };

        // First Sight
        const sightSlot = document.getElementById('ai-pv-sight');
        if (thumbs.firstSight && corner.firstSight) {
            sightSlot.classList.remove('no-data');
            document.getElementById('ai-pv-sight-img').src = thumbs.firstSight;
            document.getElementById('ai-pv-sight-time').textContent = fmt(corner.firstSight.time);
        } else {
            sightSlot.classList.add('no-data');
            document.getElementById('ai-pv-sight-img').src = '';
            document.getElementById('ai-pv-sight-time').textContent = 'Not detected';
        }

        // Brake
        const brakeSlot = document.getElementById('ai-pv-brake');
        if (thumbs.brake && corner.brake) {
            brakeSlot.classList.remove('no-data');
            document.getElementById('ai-pv-brake-img').src = thumbs.brake;
            document.getElementById('ai-pv-brake-time').textContent = fmt(corner.brake.time);
        } else {
            brakeSlot.classList.add('no-data');
            document.getElementById('ai-pv-brake-img').src = '';
            document.getElementById('ai-pv-brake-time').textContent = 'Not detected';
        }

        // Apex
        const apexSlot = document.getElementById('ai-pv-apex');
        if (thumbs.apex && corner.apex) {
            apexSlot.classList.remove('no-data');
            document.getElementById('ai-pv-apex-img').src = thumbs.apex;
            document.getElementById('ai-pv-apex-time').textContent = fmt(corner.apex.time);
        } else {
            apexSlot.classList.add('no-data');
            document.getElementById('ai-pv-apex-img').src = '';
            document.getElementById('ai-pv-apex-time').textContent = 'Not detected';
        }

        // Exit
        const exitSlot = document.getElementById('ai-pv-exit');
        if (thumbs.exit && corner.exit) {
            exitSlot.classList.remove('no-data');
            document.getElementById('ai-pv-exit-img').src = thumbs.exit;
            document.getElementById('ai-pv-exit-time').textContent = fmt(corner.exit.time);
        } else {
            exitSlot.classList.add('no-data');
            document.getElementById('ai-pv-exit-img').src = '';
            document.getElementById('ai-pv-exit-time').textContent = 'Not detected';
        }

        // Confidence
        const confPct = Math.round(corner.confidence * 100);
        const confColor = confPct >= 80 ? '#10b981' : confPct >= 60 ? '#fbbf24' : '#ef4444';
        document.getElementById('ai-pv-conf-fill').style.width = `${confPct}%`;
        document.getElementById('ai-pv-conf-fill').style.background = confColor;
        document.getElementById('ai-pv-conf-text').textContent = `${confPct}%`;

        const bidirBadge = document.getElementById('ai-pv-bidir');
        if (corner.bidirectionalCount > 0) {
            bidirBadge.classList.remove('hidden');
        } else {
            bidirBadge.classList.add('hidden');
        }

        // Accept/Reject buttons
        const pvAccept = document.getElementById('ai-pv-accept');
        const pvReject = document.getElementById('ai-pv-reject');
        pvAccept.className = `ai-cc-btn ${accepted ? 'active-accept' : ''}`;
        pvReject.className = `ai-cc-btn ${!accepted ? 'active-reject' : ''}`;

        // Re-render cards to highlight active
        this.renderAICorners();

        // Scroll the viewer into view
        viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    /** Setup preview viewer navigation and seek buttons */
    setupAIPreviewViewer() {
        document.getElementById('ai-pv-prev').onclick = () => {
            if (this._aiPreviewIdx > 0) this.showAIPreview(this._aiPreviewIdx - 1);
        };
        document.getElementById('ai-pv-next').onclick = () => {
            if (this._aiResults && this._aiPreviewIdx < this._aiResults.corners.length - 1)
                this.showAIPreview(this._aiPreviewIdx + 1);
        };
        document.getElementById('ai-pv-accept').onclick = () => {
            this.toggleAICorner(this._aiPreviewIdx, true);
            this.showAIPreview(this._aiPreviewIdx);
        };
        document.getElementById('ai-pv-reject').onclick = () => {
            this.toggleAICorner(this._aiPreviewIdx, false);
            this.showAIPreview(this._aiPreviewIdx);
        };

        // Seek buttons — jump video to the marker's time
        const seekTo = (time) => {
            const video = document.getElementById('marker-video');
            if (time !== undefined && time !== null) {
                video.currentTime = time;
                video.pause();
                // Scroll video into view
                document.querySelector('.marker-video-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        document.getElementById('ai-pv-sight-seek').onclick = () => {
            const c = this._aiResults?.corners[this._aiPreviewIdx];
            if (c?.firstSight) seekTo(c.firstSight.time);
        };
        document.getElementById('ai-pv-brake-seek').onclick = () => {
            const c = this._aiResults?.corners[this._aiPreviewIdx];
            if (c?.brake) seekTo(c.brake.time);
        };
        document.getElementById('ai-pv-apex-seek').onclick = () => {
            const c = this._aiResults?.corners[this._aiPreviewIdx];
            if (c?.apex) seekTo(c.apex.time);
        };
        document.getElementById('ai-pv-exit-seek').onclick = () => {
            const c = this._aiResults?.corners[this._aiPreviewIdx];
            if (c?.exit) seekTo(c.exit.time);
        };
    },

    toggleAICorner(idx, accept) {
        this._aiAccepted[idx] = accept;
        this.renderAICorners();
    },

    previewAICorner(idx) {
        this.showAIPreview(idx);
    },

    applyAIDetections() {
        if (!this._aiResults) return;

        const accepted = this._aiResults.corners.filter((_, i) => this._aiAccepted[i]);
        if (!accepted.length) {
            this.toast('No corners accepted — accept at least one corner to apply', 'error');
            return;
        }

        // Map AI detections to builder corner format (with rich data for blueprint generation)
        this.builder.corners = accepted.map((c, i) => ({
            name: `Turn ${i + 1}`,
            cornerType: c.cornerType || 'medium',
            type: c.cornerType || 'medium',
            direction: c.direction || 'unknown',
            severity: c.severity || c.cornerType || 'medium',
            maxLeanAngle: c.maxLeanAngle || 0,
            gazeTargets: c.gazeTargets || {},
            firstSight: c.firstSight ? c.firstSight.time : (c.brake ? c.brake.time - 0.5 : null),
            brakingMarker: c.brake ? c.brake.time : (c.apex ? c.apex.time - 1 : null),
            apex: c.apex ? c.apex.time : null,
            exit: c.exit ? c.exit.time : null,
        }));

        this.builder.currentCornerIndex = 0;
        this.resetCurrentCorner();
        this.updateCornersSummary();

        this.toast(`Applied ${accepted.length} AI-detected corners as gaze points — review & refine`, 'success');

        // Scroll to the corner marker panel
        document.querySelector('.marker-panel')?.scrollIntoView({ behavior: 'smooth' });
    },


    // ─────────────────────────────────────────────────────────
    //  CONDITIONING VIDEO BUILDER
    // ─────────────────────────────────────────────────────────

    _conditioningReady: false,

    buildConditioningVideo() {
        // Try auto-detect corners first, then Ruapuna preset, then legacy AI results
        let corners = [];

        // Check if Ruapuna preset should be loaded
        const trackName = document.getElementById('builder-track')?.value?.trim() || this.builder.trackName || '';
        if (!this.builder.corners?.length && typeof RuapunaBlueprint !== 'undefined' && RuapunaBlueprint.isRuapuna(trackName)) {
            this.tryLoadRuapunaBlueprint(trackName);
        }

        if (this.builder.corners && this.builder.corners.length > 0) {
            // New auto-detect / preset path
            corners = this.builder.corners;
        } else if (this._aiResults && this._aiResults.corners) {
            // Legacy AI analyzer path
            corners = this._aiResults.corners.filter((_, i) => this._aiAccepted[i]);
        }

        if (corners.length === 0) {
            this.toast('Detect corners first — use Auto-Detect or AI Analyzer', 'error');
            return;
        }

        const video = document.getElementById('marker-video');
        const canvas = document.getElementById('conditioning-canvas');
        if (!video || !canvas) {
            this.toast('Video or canvas not found', 'error');
            return;
        }

        const startTime = this.builder.lapStart || 0;
        const endTime = this.builder.lapEnd || video.duration;

        // Get blueprint coaching data (if generated or pre-built)
        const blueprint = this.builder.lastBlueprint || this.builder.blueprint || null;

        // Initialize the conditioning engine
        ConditioningEngine.init(video, canvas, corners, blueprint, startTime, endTime);

        // Inject bundled voice cues into the conditioning engine
        if (typeof AudioCueLoader !== 'undefined' && AudioCueLoader.hasAnyCues()) {
            AudioCueLoader.injectIntoConditioningEngine();
        }
        this._conditioningReady = true;

        // Update pipeline indicator to step 5 (conditioning video)
        this.updatePipelineStep(5);

        // Show the conditioning player UI
        document.getElementById('conditioning-player').classList.remove('hidden');
        document.getElementById('cond-status-text').textContent =
            `Ready — ${corners.length} corners, ${(endTime - startTime).toFixed(1)}s lap`;

        // Scroll to it
        document.getElementById('conditioning-player').scrollIntoView({ behavior: 'smooth' });
        this.toast(`Conditioning video ready: ${corners.length} corners loaded`, 'success');
    },

    async previewConditioningLap() {
        if (!this._conditioningReady) {
            this.toast('Build the conditioning video first', 'error');
            return;
        }

        const lapLabel = document.getElementById('cond-lap-label');
        const progressFill = document.getElementById('cond-progress-fill');
        const progressPct = document.getElementById('cond-progress-pct');
        const stopBtn = document.getElementById('cond-stop-btn');

        stopBtn.disabled = false;
        lapLabel.textContent = 'Lap 1 — FULL PAUSE (Preview)';

        await ConditioningEngine.previewSingleLap(0,
            (progress) => {
                const pct = Math.round(progress * 100);
                progressFill.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
            },
            () => {
                lapLabel.textContent = 'Preview complete';
                stopBtn.disabled = true;
                this.toast('Lap 1 preview complete', 'success');
            }
        );
    },

    async playConditioningFull() {
        if (!this._conditioningReady) {
            this.toast('Build the conditioning video first', 'error');
            return;
        }

        const lapLabel = document.getElementById('cond-lap-label');
        const progressFill = document.getElementById('cond-progress-fill');
        const progressPct = document.getElementById('cond-progress-pct');
        const stopBtn = document.getElementById('cond-stop-btn');

        stopBtn.disabled = false;

        await ConditioningEngine.play(
            (lap, progress, message) => {
                lapLabel.textContent = message;
                const totalProgress = ((lap - 1) / 5 + progress / 5);
                const pct = Math.round(totalProgress * 100);
                progressFill.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
            },
            () => {
                lapLabel.textContent = '5-Lap Conditioning Complete ✓';
                progressFill.style.width = '100%';
                progressPct.textContent = '100%';
                stopBtn.disabled = true;
                this.toast('5-lap conditioning session complete!', 'success');
            }
        );
    },

    stopConditioning() {
        ConditioningEngine.stop();
        document.getElementById('cond-lap-label').textContent = 'Stopped';
        document.getElementById('cond-stop-btn').disabled = true;
    },

    async exportConditioningVideo() {
        if (!this._conditioningReady) {
            this.toast('Build the conditioning video first', 'error');
            return;
        }

        const lapLabel = document.getElementById('cond-lap-label');
        const progressFill = document.getElementById('cond-progress-fill');
        const progressPct = document.getElementById('cond-progress-pct');
        const stopBtn = document.getElementById('cond-stop-btn');
        const exportArea = document.getElementById('cond-export-area');
        const exportSize = document.getElementById('cond-export-size');
        const downloadLink = document.getElementById('cond-download-link');

        stopBtn.disabled = false;
        lapLabel.textContent = '🎬 Recording 5-Lap Video...';
        this.toast('Recording started — playing full 5-lap conditioning video...', 'info');

        try {
            const blob = await ConditioningEngine.exportVideo(
                (lap, progress, message) => {
                    lapLabel.textContent = `Recording: ${message}`;
                    const totalProgress = ((lap - 1) / 5 + progress / 5);
                    const pct = Math.round(totalProgress * 100);
                    progressFill.style.width = `${pct}%`;
                    progressPct.textContent = `${pct}%`;
                }
            );

            // Show download area
            const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
            exportSize.textContent = `${sizeMB} MB — WebM format`;
            downloadLink.href = URL.createObjectURL(blob);
            exportArea.classList.remove('hidden');

            lapLabel.textContent = `✅ Export complete — ${sizeMB} MB`;
            progressFill.style.width = '100%';
            progressPct.textContent = '100%';
            stopBtn.disabled = true;

            this.toast(`Video exported (${sizeMB} MB) — click Download`, 'success');
        } catch (err) {
            console.error('Export failed:', err);
            this.toast('Export failed: ' + err.message, 'error');
            lapLabel.textContent = 'Export failed';
            stopBtn.disabled = true;
        }
    },

    resetCurrentCorner() {
        const idx = this.builder.currentCornerIndex;
        const existing = this.builder.corners[idx];

        document.getElementById('marker-corner-title').textContent = `Corner ${idx + 1}`;
        document.getElementById('marker-corner-name').value = existing?.name || '';
        document.getElementById('marker-corner-type').value = existing?.cornerType || 'right';

        const points = ['firstSight', 'brakingMarker', 'apex', 'exit'];
        points.forEach(p => {
            const el = document.getElementById(`gp-${p}-time`);
            if (existing && existing[p] !== undefined) {
                el.textContent = this.formatTimestamp(existing[p]);
                el.closest('.gaze-point-card').classList.add('marked');
            } else {
                el.textContent = '—';
                el.closest('.gaze-point-card').classList.remove('marked');
            }
        });

        // Show/hide nav
        document.getElementById('marker-prev-corner').style.display = idx > 0 ? '' : 'none';
    },

    markGazePoint(point) {
        const video = document.getElementById('marker-video');
        const time = video.currentTime;
        const idx = this.builder.currentCornerIndex;

        // Ensure corner object exists
        if (!this.builder.corners[idx]) {
            this.builder.corners[idx] = {
                name: '',
                cornerType: document.getElementById('marker-corner-type').value || 'right',
                firstSight: undefined, brakingMarker: undefined, apex: undefined, exit: undefined
            };
        }

        this.builder.corners[idx][point] = time;

        // Update UI
        const el = document.getElementById(`gp-${point}-time`);
        el.textContent = this.formatTimestamp(time);
        el.closest('.gaze-point-card').classList.add('marked');

        // Flash the overlay with the cue
        const cues = {
            firstSight: 'Eyes Braking Marker — Aware Apex',
            brakingMarker: 'Eyes Apex — Aware Exit',
            apex: 'Eyes Exit — Aware Straight',
            exit: 'Eyes Straight — Aware Braking Marker'
        };
        this.showMarkerOverlay(cues[point]);

        this.toast(`Marked at ${this.formatTimestamp(time)}`, 'success');
    },

    showMarkerOverlay(text) {
        const overlay = document.getElementById('marker-overlay');
        const textEl = document.getElementById('marker-overlay-text');
        textEl.textContent = text;
        overlay.classList.remove('hidden');
        clearTimeout(this._overlayTimer);
        this._overlayTimer = setTimeout(() => overlay.classList.add('hidden'), 2000);
    },

    nextCorner() {
        const idx = this.builder.currentCornerIndex;
        // Save name and type
        if (this.builder.corners[idx]) {
            this.builder.corners[idx].name = document.getElementById('marker-corner-name').value.trim() || `Turn ${idx + 1}`;
            this.builder.corners[idx].cornerType = document.getElementById('marker-corner-type').value;
        }

        // Validate current corner has all points
        const c = this.builder.corners[idx];
        if (!c || c.firstSight === undefined || c.brakingMarker === undefined || c.apex === undefined || c.exit === undefined) {
            this.toast('Please mark all 4 gaze points before continuing', 'error');
            return;
        }

        this.builder.currentCornerIndex++;
        this.resetCurrentCorner();
        this.updateCornersSummary();

        // Show finish button
        document.getElementById('marker-finish').style.display = '';
    },

    prevCorner() {
        if (this.builder.currentCornerIndex > 0) {
            // Save current name and type
            const idx = this.builder.currentCornerIndex;
            if (this.builder.corners[idx]) {
                this.builder.corners[idx].name = document.getElementById('marker-corner-name').value.trim() || `Turn ${idx + 1}`;
                this.builder.corners[idx].cornerType = document.getElementById('marker-corner-type').value;
            }
            this.builder.currentCornerIndex--;
            this.resetCurrentCorner();
        }
    },

    finishMarking() {
        // Save current corner
        const idx = this.builder.currentCornerIndex;
        if (this.builder.corners[idx]) {
            this.builder.corners[idx].name = document.getElementById('marker-corner-name').value.trim() || `Turn ${idx + 1}`;
            this.builder.corners[idx].cornerType = document.getElementById('marker-corner-type').value;
        }

        // Check if last corner is complete
        const c = this.builder.corners[idx];
        if (c && (c.firstSight === undefined || c.brakingMarker === undefined || c.apex === undefined || c.exit === undefined)) {
            // If partially filled, warn
            if (c.firstSight !== undefined || c.brakingMarker !== undefined || c.apex !== undefined || c.exit !== undefined) {
                this.toast('Complete all 4 gaze points or go back to remove this corner', 'error');
                return;
            }
            // If empty, just remove it
            this.builder.corners.pop();
        }

        if (this.builder.corners.length === 0) {
            this.toast('Please mark at least one corner', 'error');
            return;
        }

        this.updateCornersSummary();
        document.getElementById('build-action').style.display = '';
        document.getElementById('build-action').scrollIntoView({ behavior: 'smooth' });
        this.toast(`${this.builder.corners.length} corners marked — ready to build!`, 'success');
    },

    updateCornersSummary() {
        const list = document.getElementById('corners-summary-list');
        list.innerHTML = '';

        this.builder.corners.forEach((c, i) => {
            if (!c || c.firstSight === undefined) return;
            const typeIcons = { right: '↱', left: '↰', hairpin: '↩', chicane: '⇌', kink: '〰', complex: '⟲' };
            const typeIcon = typeIcons[c.cornerType] || '↱';
            const typeLabel = (c.cornerType || 'right').charAt(0).toUpperCase() + (c.cornerType || 'right').slice(1);
            const div = document.createElement('div');
            div.className = 'corner-summary-item';
            div.innerHTML = `
                <div class="cs-number">${i + 1}</div>
                <div class="cs-type-badge ct-${c.cornerType || 'right'}">${typeIcon} ${typeLabel}</div>
                <div class="cs-name">${this.escapeHtml(c.name || `Turn ${i + 1}`)}</div>
                <div class="cs-times">
                    <span class="cs-time brake">👁 ${this.formatTimestamp(c.firstSight)}</span>
                    <span class="cs-arrow">→</span>
                    <span class="cs-time apex">🎯 ${this.formatTimestamp(c.brakingMarker)}</span>
                    <span class="cs-arrow">→</span>
                    <span class="cs-time exit">🔄 ${this.formatTimestamp(c.apex)}</span>
                    <span class="cs-arrow">→</span>
                    <span class="cs-time straight">➡️ ${this.formatTimestamp(c.exit)}</span>
                </div>
                <button class="btn btn-sm btn-outline" onclick="App.editCorner(${i})">Edit</button>
            `;
            list.appendChild(div);
        });
    },

    editCorner(index) {
        this.builder.currentCornerIndex = index;
        this.resetCurrentCorner();
        // Seek video to first sight
        const c = this.builder.corners[index];
        if (c && c.firstSight !== undefined) {
            document.getElementById('marker-video').currentTime = c.firstSight;
        }
        document.getElementById('builder-phase-2').scrollIntoView({ behavior: 'smooth' });
    },

    // ===== TRACK AUTO-RESEARCH =====
    async researchTrack() {
        const trackName = document.getElementById('builder-track').value.trim();
        const series = document.getElementById('builder-series').value.trim();
        const vehicleType = document.getElementById('builder-vehicle').value;

        if (!trackName) {
            this.toast('Enter a track name first', 'error');
            return;
        }

        // ── Check for pre-built blueprint (Ruapuna) ──
        if (this.tryLoadRuapunaBlueprint(trackName)) {
            // Pre-built blueprint loaded — no API call needed
            const statusEl = document.getElementById('research-status');
            const textEl = document.getElementById('research-status-text');
            const summaryEl = document.getElementById('research-result-summary');
            if (statusEl) statusEl.classList.remove('hidden');
            if (textEl) {
                textEl.textContent = `✅ Pre-built QE Blueprint loaded for Ruapuna Park — 7 sections × 4 cues`;
                textEl.style.color = 'var(--accent-green)';
            }
            if (summaryEl) {
                summaryEl.innerHTML = `<strong>${RuapunaBlueprint.trackName}</strong> · ${RuapunaBlueprint.direction} · ${RuapunaBlueprint.length}<br>Pre-built 4-cue Quiet Eye protocol — ready for conditioning video`;
                summaryEl.classList.remove('hidden');
            }
            return;
        }

        if (!AIEngine.isResearchConfigured()) {
            this.toast('Set your Gemini API key in Settings to enable track research', 'error');
            return;
        }

        const statusEl = document.getElementById('research-status');
        const spinnerEl = document.getElementById('research-spinner');
        const textEl = document.getElementById('research-status-text');
        const summaryEl = document.getElementById('research-result-summary');
        const btn = document.getElementById('research-track-btn');

        statusEl.classList.remove('hidden');
        spinnerEl.classList.remove('hidden');
        summaryEl.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = '⏳ Researching...';

        try {
            let trackData;

            if (this._trackGuidePages && this._trackGuidePages.length > 0) {
                // PRIORITY: Extract from uploaded track guide (deeper data)
                textEl.textContent = 'Extracting QE data from uploaded track guide...';
                const guideData = await AIEngine.extractFromTrackGuide(
                    this._trackGuidePages, trackName, vehicleType,
                    (pct, msg) => { textEl.textContent = `📄 Guide: ${msg} (${pct}%)`; }
                );

                // Also run web research to fill gaps
                textEl.textContent = 'Enriching with web research...';
                let webData = null;
                try {
                    webData = await AIEngine.researchTrack(trackName, series, vehicleType,
                        (pct, msg) => { textEl.textContent = `🔍 Web: ${msg} (${pct}%)`; }
                    );
                } catch (e) {
                    console.warn('[researchTrack] Web research failed, using guide data only:', e.message);
                }

                // Merge: guide data takes priority, web data fills gaps
                trackData = this._mergeResearchSources(guideData, webData);
                trackData._source = 'guide_plus_web';
            } else {
                // No guide uploaded — web research only
                trackData = await AIEngine.researchTrack(trackName, series, vehicleType, (pct, msg) => {
                    textEl.textContent = `${msg} (${pct}%)`;
                });
            }

            this._trackResearchData = trackData;
            spinnerEl.classList.add('hidden');
            const sourceLabel = trackData._source === 'guide_plus_web' ? 'Guide + Web' :
                               trackData._source === 'track_guide_upload' ? 'Guide' : 'Web';
            textEl.textContent = `✅ Research complete (${sourceLabel}) — ${trackData.corners?.length || 0} corners found`;
            textEl.style.color = 'var(--accent-green)';

            // Show summary
            if (trackData.corners && trackData.corners.length > 0) {
                const cornerList = trackData.corners.slice(0, 8).map(c =>
                    `<strong>${c.name || 'T' + c.number}</strong> (${c.direction} ${c.type})`
                ).join(' → ');
                const extra = trackData.corners.length > 8 ? ` + ${trackData.corners.length - 8} more` : '';
                summaryEl.innerHTML = `<strong>${trackData.trackName || trackName}</strong> · ${trackData.direction || ''} · ${trackData.length || ''}<br>${cornerList}${extra}`;
                if (trackData.problemCornersForQuietEye?.length > 0) {
                    summaryEl.innerHTML += `<br><span style="color: var(--accent-orange);">⚠ ${trackData.problemCornersForQuietEye.length} QE problem corner(s) identified</span>`;
                }
                summaryEl.classList.remove('hidden');
            }

            this.toast(`Track research for "${trackName}" complete!`, 'success');

        } catch (error) {
            console.error('[researchTrack] Error:', error);
            spinnerEl.classList.add('hidden');
            textEl.textContent = `❌ Research failed: ${error.message}`;
            textEl.style.color = 'var(--accent-red)';
            this.toast(`Track research failed: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🔍 Research Track for QE';
        }
    },

    /**
     * Merge track data from two sources (guide + web research).
     * Guide data takes priority; web data fills gaps.
     */
    _mergeResearchSources(guideData, webData) {
        if (!webData) return guideData;
        if (!guideData) return webData;

        const merged = { ...guideData };

        // Fill top-level gaps
        if (!merged.country && webData.country) merged.country = webData.country;
        if (!merged.length && webData.length) merged.length = webData.length;
        if (!merged.surfaceNotes && webData.surfaceNotes) merged.surfaceNotes = webData.surfaceNotes;
        if (!merged.elevationProfile && webData.elevationProfile) merged.elevationProfile = webData.elevationProfile;

        // Merge notable features
        if (webData.notableVisualFeatures?.length) {
            merged.notableVisualFeatures = [
                ...(merged.notableVisualFeatures || []),
                ...webData.notableVisualFeatures.filter(f =>
                    !(merged.notableVisualFeatures || []).some(mf => mf.toLowerCase().includes(f.toLowerCase().substring(0, 20)))
                )
            ];
        }

        // Merge problem corners
        if (webData.problemCornersForQuietEye?.length) {
            const existingNums = new Set((merged.problemCornersForQuietEye || []).map(p => p.cornerNumber));
            merged.problemCornersForQuietEye = [
                ...(merged.problemCornersForQuietEye || []),
                ...webData.problemCornersForQuietEye.filter(p => !existingNums.has(p.cornerNumber))
            ];
        }

        // Enrich corner data — guide corners take priority
        if (merged.corners && webData.corners) {
            merged.corners.forEach((corner, i) => {
                const webCorner = webData.corners[i] || {};
                // Fill empty gaze targets from web
                if (corner.gazeTargets && webCorner.gazeTargets) {
                    Object.keys(webCorner.gazeTargets).forEach(key => {
                        if (!corner.gazeTargets[key] || corner.gazeTargets[key].includes('not found') || corner.gazeTargets[key].includes('requires onboard')) {
                            corner.gazeTargets[key] = webCorner.gazeTargets[key];
                        }
                    });
                }
                // Fill other empty fields
                if (!corner.elevation && webCorner.elevation) corner.elevation = webCorner.elevation;
                if (!corner.camber && webCorner.camber) corner.camber = webCorner.camber;
                if (!corner.visualChallenge && webCorner.visualChallenge) corner.visualChallenge = webCorner.visualChallenge;
                if (!corner.danVanNotes && webCorner.danVanNotes) corner.danVanNotes = webCorner.danVanNotes;
            });
        }

        return merged;
    },

    // ===== TRACK GUIDE UPLOAD & EXTRACTION =====
    async handleTrackGuideUpload(file) {
        const statusEl = document.getElementById('track-guide-status');
        const iconEl = document.getElementById('track-guide-icon');
        const textEl = document.getElementById('track-guide-text');

        statusEl.classList.remove('hidden');
        iconEl.textContent = '⏳';
        textEl.textContent = `Loading "${file.name}"...`;

        try {
            const pages = [];

            if (file.type === 'application/pdf') {
                // For PDFs: render pages to images using canvas
                textEl.textContent = `Converting PDF pages to images...`;
                const pdfImages = await this._renderPdfToImages(file);
                pdfImages.forEach((img, i) => {
                    pages.push({ type: 'image', data: img });
                });
                iconEl.textContent = '📄';
                textEl.textContent = `PDF loaded — ${pages.length} page(s). Click "Research Track for QE" or "Build Blueprint" to extract.`;
            } else if (file.type.startsWith('image/')) {
                // Direct image upload (track map, screenshot)
                const dataUrl = await this._fileToDataUrl(file);
                pages.push({ type: 'image', data: dataUrl });
                iconEl.textContent = '🗺️';
                textEl.textContent = `Track map loaded. Will be analysed when you build the blueprint.`;
            } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                // Text file
                const text = await file.text();
                pages.push({ type: 'text', data: text });
                iconEl.textContent = '📝';
                textEl.textContent = `Corner notes loaded (${text.length} chars). Will feed into blueprint.`;
            } else {
                throw new Error(`Unsupported file type: ${file.type || file.name}`);
            }

            this._trackGuidePages = pages;
            this.toast(`Track guide loaded: ${file.name}`, 'success');

        } catch (error) {
            console.error('[handleTrackGuideUpload] Error:', error);
            iconEl.textContent = '❌';
            textEl.textContent = `Failed: ${error.message}`;
            this.toast(`Track guide upload failed: ${error.message}`, 'error');
        }
    },

    /**
     * Render a PDF file to an array of base64 image data URLs using pdf.js.
     * Loads pdf.js from CDN if not already present.
     */
    async _renderPdfToImages(file) {
        // Load pdf.js from CDN if needed
        if (!window.pdfjsLib) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.onload = () => {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const images = [];
        const maxPages = Math.min(pdf.numPages, 20); // Limit to 20 pages

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // Good quality without being huge
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.85));
        }

        return images;
    },

    /**
     * Convert a File to a base64 data URL.
     */
    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    async buildBlueprint() {
        const trackName = document.getElementById('builder-track').value.trim() || 'Unnamed Track';
        const clientName = document.getElementById('builder-client').value.trim() || '';
        const vehicleType = document.getElementById('builder-vehicle').value;
        const skillLevel = document.getElementById('builder-skill').value;

        // Validate lap trim
        if (this.builder.lapStart === null || this.builder.lapEnd === null) {
            this.toast('Set Lap Start and Lap End before building', 'error');
            return;
        }
        if (this.builder.lapEnd <= this.builder.lapStart) {
            this.toast('Lap End must be after Lap Start', 'error');
            return;
        }

        if (this.builder.corners.length === 0) {
            this.toast('Mark at least one corner before building', 'error');
            return;
        }

        // Snapshot the current voice cues into the blueprint
        const voiceCueSnapshot = {};
        Object.keys(this.voiceCues).forEach(id => {
            voiceCueSnapshot[id] = { ...this.voiceCues[id] };
        });

        // Normalise corner data for AI engine
        const cornersForAI = this.builder.corners.map((c, i) => ({
            name: c.name || `Turn ${i + 1}`,
            type: c.cornerType || c.type || c.severity || 'sweeper',
            direction: c.direction || 'unknown',
            severity: c.severity || 'medium',
            approachSpeed: c.approachSpeed || 'unknown',
            maxLeanAngle: c.maxLeanAngle || 0,
            notes: c.notes || '',
            gazeTargets: c.gazeTargets || {}
        }));

        // Auto-load cached research data if user hasn't manually researched
        if (!this._trackResearchData) {
            const series = document.getElementById('builder-series')?.value?.trim() || '';
            const cached = AIEngine.getCachedTrackData(trackName, series || 'general');
            if (cached) {
                this._trackResearchData = cached;
                console.log(`[buildBlueprint] Auto-loaded cached QE data for "${trackName}" (${cached.corners?.length || 0} corners)`);
            }
        }

        // Enrich corners with research data if available
        if (this._trackResearchData?.corners) {
            const researchCorners = this._trackResearchData.corners;
            cornersForAI.forEach((corner, i) => {
                // Try to match by index or find closest match
                const rc = researchCorners[i] || {};
                if (rc.gazeTargets) {
                    corner.gazeTargets = {
                        ...corner.gazeTargets,
                        brakingReference: rc.gazeTargets.brakingReference || corner.gazeTargets?.brake || '',
                        turnInReference: rc.gazeTargets.turnInReference || '',
                        apexFixation: rc.gazeTargets.apexFixation || corner.gazeTargets?.apex || '',
                        exitTarget: rc.gazeTargets.exitTarget || corner.gazeTargets?.exit || '',
                        peripheralCues: rc.gazeTargets.peripheralCues || ''
                    };
                }
                if (rc.elevation) corner.elevation = rc.elevation;
                if (rc.camber) corner.camber = rc.camber;
                if (rc.visualChallenge) corner.visualChallenge = rc.visualChallenge;
                if (rc.danVanNotes) corner.danVanNotes = rc.danVanNotes;
                if (rc.kerbDescription) corner.kerbDescription = rc.kerbDescription;
                if (rc.approach) corner.approach = rc.approach;
                if (rc.exitTo) corner.exitTo = rc.exitTo;
                // Prefer research name if corner has no user-set name
                if (!corner.name || corner.name.startsWith('Turn ')) {
                    corner.name = rc.name || corner.name;
                }
                if (rc.type && (!corner.type || corner.type === 'sweeper')) corner.type = rc.type;
                if (rc.direction && corner.direction === 'unknown') corner.direction = rc.direction;
                if (rc.severity) corner.severity = rc.severity;
            });
        }

        // Build track notes from research
        let trackNotes = '';
        if (this._trackResearchData) {
            const rd = this._trackResearchData;
            const parts = [];
            if (rd.direction) parts.push(`Direction: ${rd.direction}`);
            if (rd.length) parts.push(`Length: ${rd.length}`);
            if (rd.surfaceNotes) parts.push(`Surface: ${rd.surfaceNotes}`);
            if (rd.elevationProfile) parts.push(`Elevation: ${rd.elevationProfile}`);
            if (rd.notableVisualFeatures?.length > 0) {
                parts.push(`Visual Features: ${rd.notableVisualFeatures.join('; ')}`);
            }
            if (rd.problemCornersForQuietEye?.length > 0) {
                parts.push(`QE Problem Corners: ${rd.problemCornersForQuietEye.map(p => `T${p.cornerNumber}: ${p.issue}`).join('; ')}`);
            }
            trackNotes = parts.join('\n');
        }

        const trackConfig = {
            trackName,
            clientName,
            vehicleType,
            skillLevel,
            trackNotes,
            corners: cornersForAI
        };

        // Show progress
        const buildBtn = document.getElementById('build-blueprint-btn');
        const origText = buildBtn.textContent;
        buildBtn.disabled = true;
        buildBtn.textContent = '⏳ Generating...';

        try {
            // Generate the full Quiet Eye blueprint via AI
            const qeBlueprint = await AIEngine.generateBlueprint(trackConfig, (pct, msg) => {
                buildBtn.textContent = `⏳ ${msg} (${pct}%)`;
            });

            // Merge the AI-generated coaching data with video timing data
            const blueprint = {
                ...qeBlueprint,
                id: qeBlueprint.id || 'bp_' + Date.now(),
                videoBlobUrl: this.builder.videoBlobUrl,
                videoFileName: this.builder.videoFile?.name || '',
                videoDuration: this.builder.videoDuration,
                lapStart: this.builder.lapStart,
                lapEnd: this.builder.lapEnd,
                voiceCues: voiceCueSnapshot,
                createdAt: new Date().toISOString(),
                sessions: 0
            };

            // Merge timestamp data into corners — keep AI coaching data but add video timestamps
            if (blueprint.corners && this.builder.corners.length > 0) {
                blueprint.corners.forEach((corner, i) => {
                    const builderCorner = this.builder.corners[i];
                    if (builderCorner) {
                        corner.firstSight = builderCorner.firstSight;
                        corner.brakingMarker = builderCorner.brakingMarker;
                        corner.apex_time = builderCorner.apex;
                        corner.exit_time = builderCorner.exit;
                        // Also store as brake/apex/exit objects for ConditioningEngine
                        corner.brake = builderCorner.brakingMarker !== undefined ? { time: builderCorner.brakingMarker } : (builderCorner.brake || null);
                        corner.apexMarker = builderCorner.apex !== undefined ? { time: builderCorner.apex } : (builderCorner.apexObj || null);
                        corner.exitMarker = builderCorner.exit !== undefined ? { time: builderCorner.exit } : (builderCorner.exitObj || null);
                    }
                });
            }

            this.blueprints.push(blueprint);
            this.persistBlueprints();
            this.refreshDashboard();

            const provider = qeBlueprint.provider || 'AI';
            this.toast(`Blueprint "${trackName}" generated via ${provider} with ${blueprint.corners.length} corners!`, 'success');

            // Auto-open player
            this.launchPlayer(blueprint.id);

        } catch (error) {
            console.error('[buildBlueprint] Error:', error);
            this.toast(`Blueprint generation failed: ${error.message}`, 'error');
        } finally {
            buildBtn.disabled = false;
            buildBtn.textContent = origText;
        }
    },

    // ===== CONDITIONING PLAYER =====
    launchPlayer(id) {
        const bp = this.blueprints.find(b => b.id === id);
        if (!bp) { this.toast('Blueprint not found', 'error'); return; }
        if (!bp.videoBlobUrl) { this.toast('Video not available — rebuild the blueprint', 'error'); return; }

        this.player.blueprint = bp;
        this.player.currentLap = 1;
        this.player.currentGazePointIndex = 0;
        this.player.isRunning = false;

        // Build the flattened gaze points list
        this.buildGazePointSequence(bp);

        // Build player UI
        this.renderPlayer(bp);

        // Log session
        bp.sessions = (bp.sessions || 0) + 1;
        this.persistBlueprints();

        this.switchView('player');
    },

    buildGazePointSequence(bp) {
        // Each corner has 4 gaze points, each with a specific cue
        const points = [];
        bp.corners.forEach((corner, ci) => {
            const name = corner.name;
            points.push({
                cornerIndex: ci,
                cornerName: name,
                type: 'firstSight',
                timestamp: corner.firstSight,
                cues: {
                    full: `Eyes Braking Marker — Aware Apex`,
                    aware: `Aware Apex`,
                    marker: `Braking Marker`
                },
                // Voice cue IDs for MP3 lookup
                audioCueIds: {
                    full: this.CUE_MAP.full.firstSight,
                    aware: this.CUE_MAP.aware.firstSight,
                    marker: this.CUE_MAP.marker.firstSight
                }
            });
            points.push({
                cornerIndex: ci,
                cornerName: name,
                type: 'brakingMarker',
                timestamp: corner.brakingMarker,
                cues: {
                    full: `Eyes Apex — Aware Exit`,
                    aware: `Aware Exit`,
                    marker: `Apex`
                },
                audioCueIds: {
                    full: this.CUE_MAP.full.brakingMarker,
                    aware: this.CUE_MAP.aware.brakingMarker,
                    marker: this.CUE_MAP.marker.brakingMarker
                }
            });
            points.push({
                cornerIndex: ci,
                cornerName: name,
                type: 'apex',
                timestamp: corner.apex,
                cues: {
                    full: `Eyes Exit — Aware Straight`,
                    aware: `Aware Straight`,
                    marker: `Exit`
                },
                audioCueIds: {
                    full: this.CUE_MAP.full.apex,
                    aware: this.CUE_MAP.aware.apex,
                    marker: this.CUE_MAP.marker.apex
                }
            });
            points.push({
                cornerIndex: ci,
                cornerName: name,
                type: 'exit',
                timestamp: corner.exit,
                cues: {
                    full: `Eyes Straight — Aware Braking Marker`,
                    aware: `Aware Braking Marker`,
                    marker: `Straight`
                },
                audioCueIds: {
                    full: this.CUE_MAP.full.exit,
                    aware: this.CUE_MAP.aware.exit,
                    marker: this.CUE_MAP.marker.exit
                }
            });
        });

        // Sort by timestamp
        points.sort((a, b) => a.timestamp - b.timestamp);
        this.player.allGazePoints = points;
    },

    renderPlayer(bp) {
        const container = document.getElementById('player-container');
        container.innerHTML = `
            <div class="player-wrapper" id="player-wrapper">
                <div class="player-top-bar">
                    <div class="player-track-info">
                        <span class="player-track-name">${this.escapeHtml(bp.trackName)}</span>
                        <span class="player-client-name">— ${this.escapeHtml(bp.clientName)}</span>
                    </div>
                    <div class="player-lap-indicator">
                        <div class="lap-dots">
                            <span class="lap-dot active" data-lap="1">L1</span>
                            <span class="lap-dot" data-lap="2">L2</span>
                            <span class="lap-dot" data-lap="3">L3</span>
                            <span class="lap-dot" data-lap="4">L4</span>
                            <span class="lap-dot" data-lap="5">L5</span>
                        </div>
                        <div class="lap-info" id="lap-info">Lap 1 — Full Pause · "Eyes — Aware"</div>
                    </div>
                </div>
                
                <div class="player-video-wrap">
                    <video id="conditioning-video" src="${bp.videoBlobUrl}" preload="auto"></video>
                    
                    <!-- Cue Overlay -->
                    <div class="cue-overlay hidden" id="cue-overlay">
                        <div class="cue-overlay-text" id="cue-overlay-text"></div>
                    </div>
                    
                    <!-- Pause Countdown Overlay -->
                    <div class="pause-overlay hidden" id="pause-overlay">
                        <div class="pause-cue-text" id="pause-cue-text"></div>
                        <div class="pause-countdown" id="pause-countdown">5</div>
                        <div class="pause-label">GAZE LOCK-IN</div>
                    </div>

                    <!-- Lap Transition Overlay — Subconscious Rest -->
                    <div class="lap-transition-overlay hidden" id="lap-transition">
                        <div class="lt-rest-label">SUBCONSCIOUS REST</div>
                        <div class="lt-countdown" id="lt-countdown">10</div>
                        <div class="lt-lap-num" id="lt-lap-num">Lap 2</div>
                        <div class="lt-description" id="lt-description"></div>
                    </div>
                </div>
                
                <div class="player-controls">
                    <button class="ctrl-btn" id="cond-play">▶ Start Session</button>
                    <button class="ctrl-btn" id="cond-pause-resume">⏸</button>
                    <span class="player-time" id="cond-time">0:00 / 0:00</span>
                    <input type="range" class="player-seek" id="cond-seek" min="0" max="1000" value="0">
                    <div class="ctrl-spacer"></div>
                    <span class="player-mode-badge" id="cond-mode-badge">READY</span>
                </div>
            </div>

            <!-- Corner Guide -->
            <div class="player-sidebar">
                <div class="sidebar-card" style="grid-column: 1 / -1;">
                    <h3>📍 Corner Map — ${bp.corners.length} corners</h3>
                    <div class="corner-map" id="corner-map">
                        ${bp.corners.map((c, i) => `
                            <div class="corner-map-item" data-corner="${i}">
                                <span class="cm-number">${c.number}</span>
                                <span class="cm-name">${this.escapeHtml(c.name)}</span>
                                <span class="cm-time">${this.formatTimestamp(c.firstSight)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="sidebar-card">
                    <h3>🏁 Session Structure</h3>
                    <div class="qe-rule"><span style="color: var(--phase-brake); font-weight: 700;">L1–L2</span> Full Pause — "Eyes [X] — Aware [Y]"</div>
                    <div class="qe-rule"><span style="color: var(--accent-orange); font-weight: 700;">L3</span> Slow (−10%) — Full cues, no pauses</div>
                    <div class="qe-rule"><span style="color: var(--accent-green); font-weight: 700;">L4</span> Normal — "Aware [Y]" only</div>
                    <div class="qe-rule"><span style="color: var(--accent-red); font-weight: 700;">L5</span> Fast (+10%) — Markers only</div>
                </div>

                <div class="sidebar-card">
                    <h3>🗣 Look & Call</h3>
                    <div class="qe-rule">During pauses in L1–L2, <strong>speak the cue aloud</strong>.</div>
                    <div class="qe-rule">Speech finalizes the decision — the brain stops searching, eyes commit.</div>
                    <div class="qe-rule" style="font-family: var(--font-mono); color: var(--accent-cyan); font-size: 0.75rem;">"Eyes Braking Marker → Aware Apex"</div>
                </div>
            </div>
        `;

        this.setupConditioningControls();
    },

    setupConditioningControls() {
        const video = document.getElementById('conditioning-video');
        const playBtn = document.getElementById('cond-play');
        const pauseBtn = document.getElementById('cond-pause-resume');
        const seekBar = document.getElementById('cond-seek');
        const timeDisplay = document.getElementById('cond-time');

        const fmt = s => {
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec.toString().padStart(2, '0')}`;
        };

        // Start session
        playBtn.onclick = () => {
            if (!this.player.isRunning) {
                this.startConditioningSession();
                playBtn.textContent = '⏹ Stop';
            } else {
                this.stopConditioningSession();
                playBtn.textContent = '▶ Start Session';
            }
        };

        // Manual pause/resume
        pauseBtn.onclick = () => {
            if (video.paused && !this.player.isPaused) {
                video.play();
                pauseBtn.textContent = '⏸';
            } else if (!video.paused) {
                video.pause();
                pauseBtn.textContent = '▶';
            }
        };

        // Time update — also checks for lap end boundary
        video.addEventListener('timeupdate', () => {
            if (!video.duration) return;
            const bp = this.player.blueprint;
            const lapEnd = bp?.lapEnd ?? video.duration;
            const lapStart = bp?.lapStart ?? 0;

            // Seek bar relative to full video
            seekBar.value = (video.currentTime / video.duration) * 1000;
            timeDisplay.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;

            // Check if we've reached the lap end boundary
            if (this.player.isRunning && !this.player.isPaused && video.currentTime >= lapEnd) {
                video.pause();
                this.advanceLap();
                return;
            }

            this.checkGazePoints();
        });

        // Seek
        seekBar.oninput = () => {
            if (video.duration) video.currentTime = (seekBar.value / 1000) * video.duration;
        };

        // Video ended (natural end) = also advance lap
        video.addEventListener('ended', () => {
            if (this.player.isRunning) this.advanceLap();
        });

        // Corner map clicks
        document.querySelectorAll('.corner-map-item').forEach(item => {
            item.addEventListener('click', () => {
                const ci = parseInt(item.dataset.corner);
                const corner = this.player.blueprint.corners[ci];
                if (corner) video.currentTime = corner.firstSight;
            });
        });
    },

    startConditioningSession() {
        const video = document.getElementById('conditioning-video');
        const bp = this.player.blueprint;
        this.player.isRunning = true;
        this.player.currentLap = 1;
        this.player.currentGazePointIndex = 0;

        // Set speed for lap 1
        video.playbackRate = 1.0;
        // Start at lap start trim point
        video.currentTime = bp?.lapStart ?? 0;
        video.play();

        this.updateLapUI();
        document.getElementById('cond-mode-badge').textContent = 'LAP 1 — PAUSE MODE';
        document.getElementById('cond-pause-resume').textContent = '⏸';
    },

    stopConditioningSession() {
        const video = document.getElementById('conditioning-video');
        video.pause();
        this.player.isRunning = false;
        clearTimeout(this.player.pauseTimer);
        document.getElementById('cue-overlay').classList.add('hidden');
        document.getElementById('pause-overlay').classList.add('hidden');
        document.getElementById('cond-mode-badge').textContent = 'STOPPED';
    },

    checkGazePoints() {
        if (!this.player.isRunning || this.player.isPaused) return;

        const video = document.getElementById('conditioning-video');
        const currentTime = video.currentTime;
        const lap = this.player.currentLap;
        const points = this.player.allGazePoints;

        // Find the next upcoming gaze point
        for (let i = this.player.currentGazePointIndex; i < points.length; i++) {
            const gp = points[i];
            const threshold = 0.15; // 150ms tolerance

            if (Math.abs(currentTime - gp.timestamp) < threshold) {
                this.player.currentGazePointIndex = i + 1;
                this.triggerGazePoint(gp, lap);
                break;
            }
        }
    },

    triggerGazePoint(gp, lap) {
        const video = document.getElementById('conditioning-video');

        // Determine cue text and audio tier based on lap
        let cueText = '';
        let audioTier = 'full';
        if (lap <= 2) {
            cueText = gp.cues.full; // "Eyes [X] — Aware [Y]"
            audioTier = 'full';
        } else if (lap === 3) {
            cueText = gp.cues.full;
            audioTier = 'full';
        } else if (lap === 4) {
            cueText = gp.cues.aware; // "Aware [Y]"
            audioTier = 'aware';
        } else {
            cueText = gp.cues.marker; // "[X]"
            audioTier = 'marker';
        }

        // Show visual cue
        this.showCueOverlay(cueText);

        // Play audio cue — MP3 first, then TTS fallback
        const audioCueId = gp.audioCueIds?.[audioTier];
        this.playCueAudio(audioCueId, cueText);

        // Highlight active corner in map
        document.querySelectorAll('.corner-map-item').forEach(el => el.classList.remove('active'));
        const mapItem = document.querySelector(`.corner-map-item[data-corner="${gp.cornerIndex}"]`);
        if (mapItem) mapItem.classList.add('active');

        // Laps 1–2: PAUSE for 5 seconds
        if (lap <= 2) {
            video.pause();
            this.player.isPaused = true;
            this.showPauseOverlay(cueText);
        }
    },

    showCueOverlay(text) {
        const overlay = document.getElementById('cue-overlay');
        const textEl = document.getElementById('cue-overlay-text');
        textEl.textContent = text;
        overlay.classList.remove('hidden');

        clearTimeout(this._cueTimer);
        this._cueTimer = setTimeout(() => {
            overlay.classList.add('hidden');
        }, 3000);
    },

    showPauseOverlay(cueText) {
        const overlay = document.getElementById('pause-overlay');
        const cueEl = document.getElementById('pause-cue-text');
        const countEl = document.getElementById('pause-countdown');

        cueEl.textContent = cueText;
        overlay.classList.remove('hidden');

        let countdown = 5;
        countEl.textContent = countdown;

        this.player.pauseTimer = setInterval(() => {
            countdown--;
            countEl.textContent = countdown;

            if (countdown <= 0) {
                clearInterval(this.player.pauseTimer);
                overlay.classList.add('hidden');
                this.player.isPaused = false;

                // Resume video
                const video = document.getElementById('conditioning-video');
                video.play();
            }
        }, 1000);
    },

    /**
     * Play audio cue — tries MP3 from blueprint's voiceCues first,
     * then falls back to builder voiceCues, then to Web Speech API TTS.
     */
    playCueAudio(cueId, fallbackText) {
        // Stop any currently playing cue audio
        if (this._voiceCueAudio) {
            this._voiceCueAudio.pause();
            this._voiceCueAudio.currentTime = 0;
            this._voiceCueAudio = null;
        }

        // Priority 1: Bundled MP3s from /audio/ folder
        if (typeof AudioCueLoader !== 'undefined' && AudioCueLoader.play(cueId)) {
            return; // Bundled cue played successfully
        }

        // Priority 2: Uploaded cues (blueprint or builder)
        const bpCues = this.player.blueprint?.voiceCues || {};
        const cue = bpCues[cueId] || this.voiceCues[cueId];

        if (cue && cue.blobUrl) {
            // Play the uploaded MP3
            const audio = new Audio(cue.blobUrl);
            this._voiceCueAudio = audio;
            audio.play().catch(() => {
                // If MP3 fails, fall back to TTS
                this.speakCueTTS(fallbackText);
            });
        } else {
            // No MP3 uploaded — use TTS
            this.speakCueTTS(fallbackText);
        }
    },

    /**
     * TTS VOICE CUE CONFIGURATION — Prompt 4 (The Four Spoken Cues)
     *
     * Voice: Calm, clear, authoritative. Male. Medium pace.
     * No excitement. No urgency. Like a meditation guide who understands motorsport.
     *
     * Timing per cue: "Eyes..." [0.3s pause] "[Target]" [0.5s pause] "Aware..." [0.3s pause] "[Target]"
     * Total duration per cue: approximately 3-4 seconds
     * These play during a 5-second pause, so remaining 1-2 seconds is silence for eyes to settle
     *
     * Tone notes:
     * - "Eyes" is spoken with slight emphasis — it's the command
     * - Target word is spoken clearly and neutrally
     * - "Aware" is spoken slightly softer — it's the peripheral, not the focus
     * - No rising intonation. Flat, steady, grounding.
     *
     * ElevenLabs prompt (for generating MP3 cues):
     * "Calm, clear, authoritative male voice. Medium pace. No excitement. No urgency.
     *  Like a meditation guide who understands motorsport. Flat, steady, grounding intonation."
     */
    TTS_CUE_CONFIG: {
        voice: 'calm_authoritative_male',
        rate: 0.85,           // Slightly slow — meditative pace
        pitch: 0.75,          // Lower pitch — grounding, not exciting
        volume: 1.0,
        pauseAfterEyes: 300,  // ms pause after "Eyes..."
        pauseAfterTarget: 500, // ms pause after target word
        pauseAfterAware: 300, // ms pause after "Aware..."
        totalCueDuration: 3500, // ms target duration per cue

        // The four canonical cue texts
        cueTexts: [
            'Eyes... Braking Marker. Aware... Apex.',
            'Eyes... Apex. Aware... Exit.',
            'Eyes... Exit. Aware... Straight.',
            'Eyes... Straight. Aware... Braking Marker.'
        ],

        // ElevenLabs generation prompt
        elevenLabsPrompt: 'Calm, clear, authoritative male voice. Medium pace. No excitement. No urgency. Like a meditation guide who understands motorsport. Flat, steady, grounding intonation. "Eyes" is spoken with slight emphasis — it\'s the command. Target word is spoken clearly and neutrally. "Aware" is spoken slightly softer — it\'s the peripheral, not the focus. No rising intonation.'
    },

    /**
     * Get the voice cue text for a given phase/cue number.
     * Uses the canonical 4-cue language.
     * @param {number} cueNum — 0-3 (or 1-4 will be adjusted)
     * @param {Object} segment — optional segment with specific eyes/aware targets
     * @returns {string} the voice cue text
     */
    getVoiceCueText(cueNum, segment) {
        // Normalize to 0-indexed
        const idx = cueNum >= 1 && cueNum <= 4 ? cueNum - 1 : cueNum;

        // If segment has specific cueLabel, use that
        if (segment?.cueLabel) return segment.cueLabel;

        // Otherwise use canonical cue text
        if (idx >= 0 && idx < this.TTS_CUE_CONFIG.cueTexts.length) {
            return this.TTS_CUE_CONFIG.cueTexts[idx];
        }

        // Fallback: build from segment data
        if (segment?.eyes && segment?.aware) {
            return `Eyes: ${segment.eyes}. Aware: ${segment.aware}.`;
        }

        return '';
    },

    /**
     * Text-to-speech fallback using Web Speech API
     * Configured per Prompt 4 voice specifications
     */
    speakCueTTS(text) {
        if (!('speechSynthesis' in window)) return;

        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.TTS_CUE_CONFIG.rate;     // 0.85 — meditative pace
        utterance.pitch = this.TTS_CUE_CONFIG.pitch;    // 0.75 — low, grounding
        utterance.volume = this.TTS_CUE_CONFIG.volume;

        const voices = speechSynthesis.getVoices();
        // Prefer male, calm voices — Daniel (macOS), Google UK Male, Microsoft Mark
        const preferred = voices.find(v =>
            v.name.includes('Daniel') ||
            v.name.includes('Google UK English Male') ||
            v.name.includes('Mark') ||
            v.name.includes('James')
        ) || voices.find(v =>
            v.name.includes('Samantha') ||
            v.name.includes('Google UK')
        );
        if (preferred) utterance.voice = preferred;

        speechSynthesis.speak(utterance);
    },

    advanceLap() {
        const video = document.getElementById('conditioning-video');
        this.player.currentLap++;
        this.player.currentGazePointIndex = 0;

        if (this.player.currentLap > 5) {
            // Session complete
            this.stopConditioningSession();
            document.getElementById('cond-mode-badge').textContent = 'SESSION COMPLETE ✓';
            this.showLapTransition('Session Complete', 'All 5 laps finished. Your Quiet Eye sequence is programmed.', 0);
            this.toast('Conditioning session complete! 🎯', 'success');
            return;
        }

        const lap = this.player.currentLap;
        const lapDescriptions = {
            2: 'Full Pause — "Eyes [X] — Aware [Y]"',
            3: 'Slow Lap (−10%) — Full cues, no pauses',
            4: 'Normal Pace — "Aware [Y]" only',
            5: 'Fast Lap (+10%) — Markers only — Subconscious Mode'
        };

        // Set playback rate
        const speeds = { 1: 1.0, 2: 1.0, 3: 0.9, 4: 1.0, 5: 1.1 };
        video.playbackRate = speeds[lap];

        // Show 10-second Subconscious Rest transition with countdown
        this.showLapTransition(`Lap ${lap}`, lapDescriptions[lap], 10);

        // Update UI
        this.updateLapUI();

        // After 10s subconscious rest, restart video at lap start
        const bp = this.player.blueprint;
        let restCountdown = 10;
        const countdownEl = document.getElementById('lt-countdown');
        if (countdownEl) countdownEl.textContent = restCountdown;

        clearInterval(this._restTimer);
        this._restTimer = setInterval(() => {
            restCountdown--;
            if (countdownEl) countdownEl.textContent = restCountdown;

            if (restCountdown <= 0) {
                clearInterval(this._restTimer);
                video.currentTime = bp?.lapStart ?? 0;
                video.play();
                document.getElementById('lap-transition').classList.add('hidden');
            }
        }, 1000);
    },

    showLapTransition(title, description, countdownSec) {
        const overlay = document.getElementById('lap-transition');
        document.getElementById('lt-lap-num').textContent = title;
        document.getElementById('lt-description').textContent = description;

        // Show or hide countdown
        const countdownEl = document.getElementById('lt-countdown');
        if (countdownEl) {
            if (countdownSec > 0) {
                countdownEl.textContent = countdownSec;
                countdownEl.classList.remove('hidden');
            } else {
                countdownEl.classList.add('hidden');
            }
        }

        overlay.classList.remove('hidden');
    },

    updateLapUI() {
        const lap = this.player.currentLap;

        // Update dots
        document.querySelectorAll('.lap-dot').forEach(d => {
            const l = parseInt(d.dataset.lap);
            d.classList.toggle('active', l === lap);
            d.classList.toggle('completed', l < lap);
        });

        // Update info
        const infos = {
            1: 'Lap 1 — Full Pause · "Eyes — Aware"',
            2: 'Lap 2 — Full Pause · "Eyes — Aware"',
            3: 'Lap 3 — Slow (−10%) · Full Cues',
            4: 'Lap 4 — Normal · "Aware" Only',
            5: 'Lap 5 — Fast (+10%) · Markers Only'
        };
        document.getElementById('lap-info').textContent = infos[lap] || '';

        const modes = {
            1: 'LAP 1 — PAUSE MODE',
            2: 'LAP 2 — PAUSE MODE',
            3: 'LAP 3 — SLOW MODE',
            4: 'LAP 4 — AWARENESS MODE',
            5: 'LAP 5 — AUTOMATIC MODE'
        };
        document.getElementById('cond-mode-badge').textContent = modes[lap] || '';
    },

    // ===== LIBRARY =====
    persistBlueprints() {
        const toSave = this.blueprints.map(bp => ({
            ...bp,
            videoBlobUrl: null // Can't persist blob URLs
        }));
        localStorage.setItem('lb_blueprints', JSON.stringify(toSave));
    },

    loadBlueprints() {
        try {
            const saved = localStorage.getItem('lb_blueprints');
            this.blueprints = saved ? JSON.parse(saved) : [];
        } catch { this.blueprints = []; }
    },

    deleteBlueprint(id) {
        if (!confirm('Delete this blueprint?')) return;
        this.blueprints = this.blueprints.filter(b => b.id !== id);
        this.persistBlueprints();
        this.refreshDashboard();
        this.toast('Blueprint deleted', 'info');
    },

    refreshDashboard() {
        const uniqueTracks = new Set(this.blueprints.map(b => b.trackName)).size;
        const totalCorners = this.blueprints.reduce((s, b) => s + (b.corners?.length || 0), 0);
        const totalSessions = this.blueprints.reduce((s, b) => s + (b.sessions || 0), 0);

        document.getElementById('stat-blueprints').textContent = this.blueprints.length;
        document.getElementById('stat-tracks').textContent = uniqueTracks;
        document.getElementById('stat-corners').textContent = totalCorners;
        document.getElementById('stat-sessions').textContent = totalSessions;

        document.getElementById('library-count').textContent = `${this.blueprints.length} blueprint${this.blueprints.length !== 1 ? 's' : ''}`;

        const grid = document.getElementById('library-grid');
        if (this.blueprints.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎬</div>
                    <h3>No Blueprints Yet</h3>
                    <p>Build your first lap blueprint to get started.</p>
                </div>
            `;
        } else {
            grid.innerHTML = '';
            [...this.blueprints].reverse().forEach(bp => {
                const card = document.createElement('div');
                card.className = 'library-card';
                const date = new Date(bp.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                const icons = { motorcycle: '🏍', car: '🏎', kart: '🏁', formula: '🏎' };

                card.innerHTML = `
                    <div class="card-thumbnail">
                        ${bp.videoBlobUrl ? `<video src="${bp.videoBlobUrl}" muted preload="metadata"></video>` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:3rem;">${icons[bp.vehicleType] || '🎬'}</div>`}
                        <div class="card-thumbnail-overlay">
                            <div class="play-icon"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
                        </div>
                    </div>
                    <div class="card-info">
                        <div class="card-info-header">
                            <span class="card-track-name">${this.escapeHtml(bp.trackName)}</span>
                            <span class="card-vehicle-badge">${bp.vehicleType}</span>
                        </div>
                        <div class="card-client-name">👤 ${this.escapeHtml(bp.clientName)}</div>
                        <div class="card-meta-row">
                            <span>${date}</span>
                            <span>${bp.corners?.length || 0} corners</span>
                            <span>${bp.sessions || 0} sessions</span>
                        </div>
                        <div class="card-btn-row">
                            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); App.launchPlayer('${bp.id}')">▶ Play</button>
                            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); App.viewBlueprint('${bp.id}')">📋 Blueprint</button>
                            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); App.exportBlueprintPDF('${bp.id}')">📄 PDF</button>
                            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); App.deleteBlueprint('${bp.id}')">✕</button>
                        </div>
                    </div>
                `;
                card.addEventListener('click', () => this.launchPlayer(bp.id));
                grid.appendChild(card);
            });
        }
    },

    // ===== BLUEPRINT & PROTOCOL VIEWS =====

    viewBlueprint(id) {
        const bp = this.blueprints.find(b => b.id === id);
        if (!bp) { this.toast('Blueprint not found', 'error'); return; }

        // Render into the protocol display area (reusing it)
        const container = document.getElementById('protocol-display');
        BlueprintRenderer.renderBlueprint(bp, container);

        this.switchView('protocol');
    },

    viewProtocol(id) {
        const bp = this.blueprints.find(b => b.id === id);
        if (!bp) { this.toast('Blueprint not found', 'error'); return; }

        const container = document.getElementById('protocol-display');
        BlueprintRenderer.renderProtocol(bp, container);

        this.switchView('protocol');
    },

    expandAllCorners() {
        document.querySelectorAll('.corner-blueprint').forEach(el => el.classList.add('expanded'));
    },

    async exportBlueprintPDF(id) {
        const bp = this.blueprints.find(b => b.id === id);
        if (!bp) { this.toast('Blueprint not found', 'error'); return; }

        this.toast('Generating PDF...', 'info');

        try {
            // Dynamically load jsPDF if not already loaded
            if (!window.jspdf) {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js';
                document.head.appendChild(script);
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Failed to load jsPDF'));
                });
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 15;
            const contentWidth = pageWidth - margin * 2;
            let y = margin;

            const addPage = () => { doc.addPage(); y = margin; };
            const checkPage = (needed) => { if (y + needed > 270) addPage(); };

            // ─── TITLE PAGE ───
            doc.setFillColor(10, 10, 15);
            doc.rect(0, 0, pageWidth, 297, 'F');

            doc.setFontSize(28);
            doc.setTextColor(0, 240, 255);
            doc.text(bp.trackName || 'Lap Blueprint', pageWidth / 2, 50, { align: 'center' });

            doc.setFontSize(14);
            doc.setTextColor(200, 200, 220);
            doc.text('Quiet Eye Conditioning Blueprint', pageWidth / 2, 62, { align: 'center' });

            doc.setFontSize(11);
            doc.setTextColor(160, 160, 180);
            y = 80;
            const meta = [
                `Client: ${bp.clientName || 'N/A'}`,
                `Vehicle: ${bp.vehicleType || 'N/A'}`,
                `Skill Level: ${bp.skillLevel || 'N/A'}`,
                `Corners: ${bp.corners?.length || 0}`,
                `Generated: ${new Date(bp.generatedAt || bp.createdAt).toLocaleDateString('en-GB')}`
            ];
            meta.forEach(line => {
                doc.text(line, pageWidth / 2, y, { align: 'center' });
                y += 7;
            });

            // Strategy
            if (bp.overallStrategy) {
                y += 10;
                doc.setFontSize(10);
                doc.setTextColor(180, 180, 200);
                const stratLines = doc.splitTextToSize(bp.overallStrategy, contentWidth - 20);
                stratLines.forEach(line => { doc.text(line, margin + 10, y); y += 5; });
            }

            if (bp.keyPrinciple) {
                y += 8;
                doc.setFontSize(10);
                doc.setTextColor(0, 240, 255);
                const princLines = doc.splitTextToSize(bp.keyPrinciple, contentWidth - 20);
                princLines.forEach(line => { doc.text(line, margin + 10, y); y += 5; });
            }

            // ─── CORNERS ───
            if (bp.corners && bp.corners.length > 0) {
                addPage();
                doc.setFillColor(10, 10, 15);
                doc.rect(0, 0, pageWidth, 297, 'F');

                bp.corners.forEach((corner, idx) => {
                    checkPage(80);

                    // Corner header
                    doc.setFontSize(14);
                    doc.setTextColor(0, 240, 255);
                    doc.text(`${corner.number || idx + 1}. ${corner.name || `Turn ${idx + 1}`}`, margin, y);
                    y += 5;

                    doc.setFontSize(9);
                    doc.setTextColor(140, 140, 160);
                    doc.text(`${corner.type || ''} · Speed Ramp: ${corner.speedRamp || '50%'}`, margin, y);
                    y += 7;

                    // Gaze Sequence
                    if (corner.gazeSequence) {
                        const phases = ['brake', 'apex', 'exit'];
                        const phaseLabels = { brake: 'BRAKE / PTIS', apex: 'APEX / FIXATION', exit: 'EXIT / PFTS' };
                        const phaseColors = { brake: [255, 107, 53], apex: [0, 240, 255], exit: [16, 185, 129] };

                        phases.forEach(phase => {
                            if (corner.gazeSequence[phase]) {
                                checkPage(15);
                                const c = phaseColors[phase];
                                doc.setTextColor(c[0], c[1], c[2]);
                                doc.setFontSize(9);
                                doc.text(phaseLabels[phase], margin + 2, y);
                                y += 4.5;

                                doc.setTextColor(220, 220, 240);
                                doc.setFontSize(8.5);
                                doc.text(`Eyes: ${corner.gazeSequence[phase].eyes || ''}`, margin + 5, y); y += 4;
                                doc.text(`Aware: ${corner.gazeSequence[phase].aware || ''}`, margin + 5, y); y += 5;
                            }
                        });
                    }

                    // Quiet Eye Cue
                    if (corner.quietEyeCue) {
                        checkPage(12);
                        doc.setFontSize(9);
                        doc.setTextColor(255, 200, 50);
                        const cueLines = doc.splitTextToSize(`QE CUE: ${corner.quietEyeCue}`, contentWidth - 10);
                        cueLines.forEach(line => { doc.text(line, margin + 2, y); y += 4.5; });
                        y += 2;
                    }

                    // Risk Factors
                    if (corner.riskFactors && corner.riskFactors.length > 0) {
                        checkPage(10);
                        doc.setFontSize(8);
                        doc.setTextColor(239, 68, 68);
                        corner.riskFactors.forEach(risk => {
                            const riskLines = doc.splitTextToSize(`⚠ ${risk}`, contentWidth - 15);
                            riskLines.forEach(line => { doc.text(line, margin + 5, y); y += 4; });
                        });
                        y += 2;
                    }

                    // Look & Call
                    if (corner.lookAndCall && corner.lookAndCall.length > 0) {
                        checkPage(10);
                        doc.setFontSize(8);
                        doc.setTextColor(100, 200, 255);
                        corner.lookAndCall.forEach(call => {
                            doc.text(call, margin + 5, y); y += 4;
                        });
                        y += 2;
                    }

                    // Head Rotation
                    if (corner.headRotationCue) {
                        checkPage(8);
                        doc.setFontSize(8);
                        doc.setTextColor(160, 160, 180);
                        doc.text(`Head: ${corner.headRotationCue}`, margin + 2, y);
                        y += 5;
                    }

                    y += 6; // Gap between corners

                    // Separator line
                    doc.setDrawColor(40, 40, 60);
                    doc.line(margin, y, pageWidth - margin, y);
                    y += 4;
                });
            }

            // ─── TRAINING PROTOCOL ───
            if (bp.trainingProtocol) {
                addPage();
                doc.setFillColor(10, 10, 15);
                doc.rect(0, 0, pageWidth, 297, 'F');

                doc.setFontSize(16);
                doc.setTextColor(0, 240, 255);
                doc.text('Daily Training Protocol', margin, y);
                y += 8;

                doc.setFontSize(10);
                doc.setTextColor(200, 200, 220);
                doc.text(`${bp.trainingProtocol.dailyMinutes || 15} Minutes Daily`, margin, y);
                y += 10;

                if (bp.trainingProtocol.steps) {
                    bp.trainingProtocol.steps.forEach((step, i) => {
                        checkPage(20);
                        doc.setFontSize(11);
                        doc.setTextColor(0, 240, 255);
                        doc.text(`${i + 1}. ${step.title} (${step.duration})`, margin, y);
                        y += 6;

                        doc.setFontSize(9);
                        doc.setTextColor(180, 180, 200);
                        const instrLines = doc.splitTextToSize(step.instruction, contentWidth - 10);
                        instrLines.forEach(line => { doc.text(line, margin + 5, y); y += 4.5; });
                        y += 4;
                    });
                }

                if (bp.trainingProtocol.weakCornerDrills) {
                    checkPage(20);
                    y += 5;
                    doc.setFontSize(11);
                    doc.setTextColor(255, 159, 28);
                    doc.text('Weak Corner Reprogramming', margin, y);
                    y += 6;

                    doc.setFontSize(9);
                    doc.setTextColor(180, 180, 200);
                    const drillLines = doc.splitTextToSize(bp.trainingProtocol.weakCornerDrills, contentWidth - 10);
                    drillLines.forEach(line => { doc.text(line, margin + 5, y); y += 4.5; });
                }
            }

            // Footer on all pages
            const totalPages = doc.internal.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setFontSize(7);
                doc.setTextColor(80, 80, 100);
                doc.text(`Quiet Eye Lap Blueprint — ${bp.trackName} — ${bp.clientName} — Page ${p}/${totalPages}`, pageWidth / 2, 290, { align: 'center' });
                doc.text('Generated by Lap Blueprint Generator — caminocoaching.co.uk', pageWidth / 2, 294, { align: 'center' });
            }

            // Save
            const filename = `${(bp.trackName || 'Blueprint').replace(/[^a-zA-Z0-9]/g, '_')}_QE_Blueprint.pdf`;
            doc.save(filename);
            this.toast(`PDF saved: ${filename}`, 'success');

        } catch (error) {
            console.error('[exportPDF] Error:', error);
            this.toast(`PDF export failed: ${error.message}`, 'error');
        }
    },

    // ===== UTILITIES =====
    /**
     * Update the pipeline step indicator bar.
     * @param {number} step — 1, 2, or 3
     */
    updatePipelineStep(step) {
        for (let i = 1; i <= 6; i++) {
            const el = document.getElementById(`pipeline-step-${i}`);
            if (!el) continue;
            el.classList.remove('active', 'completed');
            if (i === step) {
                el.classList.add('active');
            } else if (i < step) {
                el.classList.add('completed');
            }
        }
    },

    formatTimestamp(seconds) {
        if (seconds === undefined || seconds === null) return '—';
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toFixed(1);
        return `${m}:${s.padStart(4, '0')}`;
    },

    toast(msg, type = 'info') {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, 4000);
    },

    escapeHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    escapeAttr(s) {
        return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
};

// Load voices (needed for some browsers)
if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

document.addEventListener('DOMContentLoaded', () => App.init());
