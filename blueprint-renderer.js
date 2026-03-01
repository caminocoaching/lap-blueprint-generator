/* ============================================================
   BLUEPRINT RENDERER — Renders generated blueprints to the UI
   ============================================================ */

const BlueprintRenderer = {

    renderBlueprint(blueprint, container) {
        container.innerHTML = '';

        // Header
        const header = this.createHeader(blueprint);
        container.appendChild(header);

        // Overall Strategy
        const strategy = this.createStrategySection(blueprint);
        container.appendChild(strategy);

        // Corners
        blueprint.corners.forEach((corner, index) => {
            const cornerEl = this.createCornerSection(corner, index);
            container.appendChild(cornerEl);
        });

        // Actions
        const actions = this.createActions(blueprint);
        container.appendChild(actions);

        // Auto-expand first corner
        const firstCorner = container.querySelector('.corner-blueprint');
        if (firstCorner) firstCorner.classList.add('expanded');
    },

    createHeader(blueprint) {
        const div = document.createElement('div');
        div.className = 'blueprint-header';
        div.innerHTML = `
            <h1 class="bp-track-name">${this.escapeHtml(blueprint.trackName)}</h1>
            <p class="bp-subtitle">Quiet Eye Lap Blueprint — ${this.escapeHtml(blueprint.clientName)}</p>
            <div class="bp-meta">
                <div class="bp-meta-item">
                    <div class="bp-meta-label">Vehicle</div>
                    <div class="bp-meta-value">${this.escapeHtml(blueprint.vehicleType)}</div>
                </div>
                <div class="bp-meta-item">
                    <div class="bp-meta-label">Skill Level</div>
                    <div class="bp-meta-value">${this.escapeHtml(blueprint.skillLevel)}</div>
                </div>
                <div class="bp-meta-item">
                    <div class="bp-meta-label">Corners</div>
                    <div class="bp-meta-value">${blueprint.corners.length}</div>
                </div>
                <div class="bp-meta-item">
                    <div class="bp-meta-label">Generated</div>
                    <div class="bp-meta-value">${new Date(blueprint.generatedAt).toLocaleDateString()}</div>
                </div>
            </div>
        `;
        return div;
    },

    createStrategySection(blueprint) {
        const div = document.createElement('div');
        div.className = 'protocol-section';
        div.style.marginBottom = '24px';
        div.innerHTML = `
            <h2><span class="section-icon">🧠</span> Overall Quiet Eye Strategy</h2>
            <p style="color: var(--text-secondary); line-height: 1.8; margin-bottom: 16px;">${this.escapeHtml(blueprint.overallStrategy)}</p>
            <div class="protocol-callout">
                <p>💡 ${this.escapeHtml(blueprint.keyPrinciple)}</p>
            </div>
        `;
        return div;
    },

    createCornerSection(corner, index) {
        const div = document.createElement('div');
        div.className = 'corner-blueprint';

        const speedColor = corner.speedRamp === '25%' ? 'var(--phase-brake)' :
            corner.speedRamp === '50%' ? 'var(--accent-orange)' : 'var(--phase-exit)';

        div.innerHTML = `
            <div class="corner-bp-header" onclick="this.parentElement.classList.toggle('expanded')">
                <div class="corner-bp-number">${corner.number}</div>
                <div class="corner-bp-title">
                    <div class="corner-bp-name">${this.escapeHtml(corner.name)}</div>
                    <div class="corner-bp-type">${this.escapeHtml(corner.type)} · Speed Ramp: <span style="color: ${speedColor}">${corner.speedRamp}</span></div>
                </div>
                <div class="corner-bp-toggle">▾</div>
            </div>
            <div class="corner-bp-body">
                <!-- Gaze Sequence -->
                <div class="gaze-sequence-display">
                    <div class="gaze-step brake">
                        <div class="gaze-step-label">BRAKE / PTIS</div>
                        <div class="gaze-step-icon">🔴</div>
                        <div class="gaze-step-eyes">Eyes: ${this.escapeHtml(corner.gazeSequence.brake.eyes)}</div>
                        <div class="gaze-step-aware">Aware: ${this.escapeHtml(corner.gazeSequence.brake.aware)}</div>
                    </div>
                    <div class="gaze-step apex">
                        <div class="gaze-step-label">APEX / FIXATION</div>
                        <div class="gaze-step-icon">🎯</div>
                        <div class="gaze-step-eyes">Eyes: ${this.escapeHtml(corner.gazeSequence.apex.eyes)}</div>
                        <div class="gaze-step-aware">Aware: ${this.escapeHtml(corner.gazeSequence.apex.aware)}</div>
                    </div>
                    <div class="gaze-step exit">
                        <div class="gaze-step-label">EXIT / PFTS</div>
                        <div class="gaze-step-icon">🟢</div>
                        <div class="gaze-step-eyes">Eyes: ${this.escapeHtml(corner.gazeSequence.exit.eyes)}</div>
                        <div class="gaze-step-aware">Aware: ${this.escapeHtml(corner.gazeSequence.exit.aware)}</div>
                    </div>
                </div>

                <!-- Info Grid -->
                <div class="corner-info-grid">
                    <div class="corner-info-block">
                        <div class="info-block-title">⚠️ Risk Factors</div>
                        <div class="info-block-content">
                            ${(corner.riskFactors || []).map(r => `<div style="margin-bottom: 4px;">• ${this.escapeHtml(r)}</div>`).join('')}
                        </div>
                    </div>
                    <div class="corner-info-block">
                        <div class="info-block-title">🗣 Look & Call Script</div>
                        <div class="info-block-content" style="font-family: var(--font-mono); font-size: 0.8rem;">
                            ${(corner.lookAndCall || []).map(l => `<div style="margin-bottom: 4px;">${this.escapeHtml(l)}</div>`).join('')}
                        </div>
                    </div>
                    <div class="corner-info-block">
                        <div class="info-block-title">🔄 Head Rotation</div>
                        <div class="info-block-content">${this.escapeHtml(corner.headRotationCue || '')}</div>
                    </div>
                    <div class="corner-info-block">
                        <div class="info-block-title">📝 Coaching Notes</div>
                        <div class="info-block-content">${this.escapeHtml(corner.coachingNotes || '')}</div>
                    </div>
                </div>

                <!-- Coaching Cue -->
                <div class="corner-coaching-cue">
                    <div class="coaching-cue-label">QUIET EYE CUE</div>
                    <div class="coaching-cue-text">${this.escapeHtml(corner.quietEyeCue)}</div>
                </div>
            </div>
        `;
        return div;
    },

    createActions(blueprint) {
        const div = document.createElement('div');
        div.className = 'blueprint-actions';
        div.innerHTML = `
            <button class="btn btn-primary" onclick="App.exportBlueprintPDF('${blueprint.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export as PDF
            </button>
            <button class="btn btn-outline" onclick="App.viewProtocol('${blueprint.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                View Training Protocol
            </button>
            <button class="btn btn-outline" onclick="App.expandAllCorners()">
                Expand All Corners
            </button>
        `;
        return div;
    },

    renderProtocol(blueprint, container) {
        container.innerHTML = '';

        const protocol = blueprint.trainingProtocol;
        if (!protocol) {
            container.innerHTML = '<div class="empty-state"><h3>No protocol data available</h3></div>';
            return;
        }

        // Header
        const header = document.createElement('div');
        header.className = 'protocol-header';
        header.innerHTML = `
            <h1>Training Protocol</h1>
            <p>${this.escapeHtml(blueprint.trackName)} — ${this.escapeHtml(blueprint.clientName)}</p>
            <div class="hero-badge" style="margin-top: 16px;">${protocol.dailyMinutes} MINUTES DAILY</div>
        `;
        container.appendChild(header);

        // Understanding Section
        const understanding = document.createElement('div');
        understanding.className = 'protocol-section';
        understanding.innerHTML = `
            <h2><span class="section-icon">🧠</span> Understanding the System</h2>
            <div class="protocol-callout">
                <p>"This isn't meditation. It's measurement. The data tells you when focus drops. Fifteen minutes is enough to train the system without fatigue."</p>
            </div>
            <div style="margin-top: 16px;">
                <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.7;">
                    The Quiet Eye is a GPS system that feeds your brain the optimal spatial information needed for action. 
                    By training it daily, you teach your brain what focused, settled attention <i>actually feels like</i>. 
                    You build consistency in your attention patterns and remove guesswork.
                </p>
            </div>
        `;
        container.appendChild(understanding);

        // Daily Steps
        const steps = document.createElement('div');
        steps.className = 'protocol-section';
        steps.innerHTML = `
            <h2><span class="section-icon">📋</span> Daily Training Steps</h2>
            ${protocol.steps.map((step, i) => `
                <div class="protocol-step">
                    <div class="protocol-step-number">${i + 1}</div>
                    <div class="protocol-step-content">
                        <h3>${this.escapeHtml(step.title)} <span style="color: var(--text-tertiary); font-weight: 400;">(${this.escapeHtml(step.duration)})</span></h3>
                        <p>${this.escapeHtml(step.instruction)}</p>
                    </div>
                </div>
            `).join('')}
        `;
        container.appendChild(steps);

        // Corner-by-Corner Drills
        const drills = document.createElement('div');
        drills.className = 'protocol-section';
        drills.innerHTML = `
            <h2><span class="section-icon">🎯</span> Corner-by-Corner Drills</h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">
                For each corner in the blueprint, follow the "Pause → Ask → Speak → Play" cycle:
            </p>
            <ul class="corner-drill-list">
                <li><strong>PAUSE</strong> the video before turn-in. Ask: "Where are my eyes right now?"</li>
                <li><strong>SAY</strong> the sequence out loud: "Eyes: [target]" → "Aware: [next point]"</li>
                <li><strong>PLAY</strong> and execute the mental lap through the corner</li>
                <li><strong>REPEAT</strong> weak corners 3x — this is neural reprogramming</li>
            </ul>
            ${blueprint.corners.map(corner => `
                <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px; margin-top: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700; font-size: 0.85rem;">T${corner.number}: ${this.escapeHtml(corner.name)}</span>
                        <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-tertiary);">${corner.type}</span>
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-cyan);">
                        ${(corner.lookAndCall || []).join(' → ')}
                    </div>
                </div>
            `).join('')}
        `;
        container.appendChild(drills);

        // The Power of Speaking
        const speaking = document.createElement('div');
        speaking.className = 'protocol-section';
        speaking.innerHTML = `
            <h2><span class="section-icon">🗣</span> The Power of Speaking</h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.7; margin-bottom: 16px;">
                Quiet Eye requires one clear decision: <strong>"This is the target."</strong>
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); padding: 16px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-red); margin-bottom: 8px;">❌ IF IT STAYS INTERNAL</div>
                    <ul style="list-style: none; font-size: 0.8rem; color: var(--text-secondary);">
                        <li style="margin-bottom: 4px;">"Maybe this..."</li>
                        <li style="margin-bottom: 4px;">"Or that..."</li>
                        <li>"I'll see how it feels"</li>
                    </ul>
                    <p style="font-size: 0.75rem; color: var(--accent-red); margin-top: 8px;">Softness = Eye Movement = VAN Activation</p>
                </div>
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-md); padding: 16px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--accent-green); margin-bottom: 8px;">✅ WHEN YOU SAY IT</div>
                    <ul style="list-style: none; font-size: 0.8rem; color: var(--text-secondary);">
                        <li style="margin-bottom: 4px;">The decision becomes binary</li>
                        <li style="margin-bottom: 4px;">The brain stops searching</li>
                        <li>The eyes commit</li>
                    </ul>
                    <p style="font-size: 0.75rem; color: var(--accent-green); margin-top: 8px;">Speech Finalizes the Decision = DAN Locked</p>
                </div>
            </div>
        `;
        container.appendChild(speaking);

        // Weak Corner Protocol  
        const weak = document.createElement('div');
        weak.className = 'protocol-section';
        weak.innerHTML = `
            <h2><span class="section-icon">🔁</span> Weak Corner Reprogramming</h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; line-height: 1.7; margin-bottom: 16px;">
                ${this.escapeHtml(protocol.weakCornerDrills || '')}
            </p>
            <div class="protocol-callout">
                <p>🔑 3 repetitions is the sweet spot: enough to learn, not enough to fatigue. If a corner feels "busy" in your mind, it needs more reps.</p>
            </div>
        `;
        container.appendChild(weak);
    },

    renderBlueprintCard(blueprint) {
        const div = document.createElement('div');
        div.className = 'blueprint-card';
        div.setAttribute('data-id', blueprint.id);

        const date = new Date(blueprint.generatedAt);
        const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        div.innerHTML = `
            <div class="card-header">
                <span class="card-track">${this.escapeHtml(blueprint.trackName)}</span>
                <span class="card-date">${dateStr}</span>
            </div>
            <div class="card-client">👤 ${this.escapeHtml(blueprint.clientName)}</div>
            <div class="card-stats">
                <span class="card-stat">🏎 ${this.escapeHtml(blueprint.vehicleType)}</span>
                <span class="card-stat">🔄 ${blueprint.corners.length} corners</span>
                <span class="card-stat">📊 ${this.escapeHtml(blueprint.skillLevel)}</span>
            </div>
            <div class="card-actions">
                <button class="btn btn-sm btn-primary" onclick="App.loadBlueprint('${blueprint.id}')">View Blueprint</button>
                <button class="btn btn-sm btn-outline" onclick="App.viewProtocol('${blueprint.id}')">Protocol</button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); App.deleteBlueprint('${blueprint.id}')">Delete</button>
            </div>
        `;

        return div;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
