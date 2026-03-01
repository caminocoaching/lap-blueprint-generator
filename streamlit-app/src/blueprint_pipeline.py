"""
Blueprint Pipeline — 4-step deterministic QE blueprint generation using Claude.
"""
import json
from typing import Optional, Callable


class BlueprintPipeline:
    """Generates Quiet Eye conditioning blueprints via a 4-step Claude pipeline."""

    # ── Core Principles (injected into every prompt) ─────────
    QE_PRINCIPLES = """
QUIET EYE SCIENCE (Joan Vickers):
- The Quiet Eye is the final fixation on a specific target before a critical motor action
- Elite performers hold this fixation 62% longer than non-elite
- DAN (Dorsal Attention Network) = deliberate, planned eye movements
- VAN (Ventral Attention Network) = involuntary attention capture (distraction)
- Our goal: train DAN dominance through repetitive gaze conditioning

FLOW STATE AWARENESS (200ms Lead):
- EYES lock on the CURRENT physical target (foveal, DAN-controlled)
- AWARE holds the NEXT target in peripheral vision (200ms preparation lead)
- This creates seamless gaze transitions without attention gaps

THE FOUR CUES (every corner, same language, same sequence):
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"
"""

    def __init__(self, api_engine):
        self.api = api_engine

    def generate_blueprint(self, track_config, progress_cb=None):
        """
        Run the full 4-step pipeline for all corners.

        Args:
            track_config: dict with trackName, vehicleType, skillLevel, corners[]
            progress_cb: callback(percent, message)

        Returns: complete blueprint dict
        """
        corners = track_config.get('corners', [])
        template = self._get_template(track_config.get('vehicleType', 'car'))
        total_steps = len(corners) * 3 + 1  # 3 per-corner steps + 1 protocol assembly
        step_count = 0

        processed_corners = []

        for i, corner in enumerate(corners):
            corner_name = corner.get('name', f'Corner {i+1}')

            # Step 1: Classify
            if progress_cb:
                pct = int((step_count / total_steps) * 90)
                progress_cb(pct, f"Step 1/4: Classifying {corner_name}...")

            classified = self._step1_classify(corner, template, track_config)
            step_count += 1

            # Step 2: Gaze Sequence
            if progress_cb:
                pct = int((step_count / total_steps) * 90)
                progress_cb(pct, f"Step 2/4: Building gaze sequence for {corner_name}...")

            gaze_data = self._step2_gaze_sequence(classified, template, track_config)
            step_count += 1

            # Step 3: Risk Analysis
            if progress_cb:
                pct = int((step_count / total_steps) * 90)
                progress_cb(pct, f"Step 3/4: Risk analysis for {corner_name}...")

            risk_data = self._step3_risk_analysis(classified, gaze_data, template, track_config)
            step_count += 1

            # Merge all data for this corner
            processed = {**classified, **gaze_data, **risk_data}
            processed_corners.append(processed)

        # Step 4: Protocol Assembly (all corners at once)
        if progress_cb:
            progress_cb(85, "Step 4/4: Assembling training protocol...")

        protocol = self._step4_protocol(processed_corners, template, track_config)

        # Build final blueprint
        blueprint = {
            'trackName': track_config.get('trackName', 'Unknown Track'),
            'vehicleType': track_config.get('vehicleType', 'car'),
            'skillLevel': track_config.get('skillLevel', 'intermediate'),
            'clientName': track_config.get('clientName', ''),
            'cornerCount': len(processed_corners),
            'corners': processed_corners,
            'protocol': protocol,
            'metadata': {
                'generator': 'Lap Blueprint Generator (Streamlit)',
                'model': self.api.claude_model,
                'pipeline_version': '2.0'
            }
        }

        if progress_cb:
            progress_cb(100, "Blueprint complete!")

        return blueprint

    # ── Step 1: Corner Classification ────────────────────────

    def _step1_classify(self, corner, template, track_config):
        system = f"""You are a Quiet Eye corner classification specialist for motorsport.
{self.QE_PRINCIPLES}

VEHICLE: {template['vehicleType']}
{template.get('systemPromptSection', '')}"""

        user = f"""Classify this corner for Quiet Eye conditioning:

TRACK: {track_config.get('trackName', 'Unknown')}
SKILL LEVEL: {track_config.get('skillLevel', 'intermediate')}

CORNER DATA:
{json.dumps(corner, indent=2, default=str)}

Return ONLY valid JSON:
{{
  "cornerNumber": <int>,
  "name": "<corner name>",
  "type": "hairpin|tight|sweeper|kink|chicane|esses|offcamber|medium",
  "direction": "left|right|unknown",
  "severity": "very_tight|tight|medium|fast|flat_out",
  "qeDifficulty": "trivial|simple|moderate|challenging|expert",
  "primaryVanTrigger": "target_fixation|early_apex_look|peripheral_threat|instrument_glance|unexpected_threat",
  "gazeDominanceRecommendation": "early_commitment|extended_fixation|rapid_transition",
  "classificationReasoning": "<1-2 sentences explaining the QE challenge>"
}}"""

        return self._call_with_retry(system, user)

    # ── Step 2: Gaze Sequence ────────────────────────────────

    def _step2_gaze_sequence(self, classified, template, track_config):
        system = f"""You are a Quiet Eye gaze protocol specialist.
{self.QE_PRINCIPLES}

VEHICLE: {template['vehicleType']}
{template.get('systemPromptSection', '')}

CRITICAL RULES:
- "eyes" must be a SPECIFIC physical feature: kerb color, board number, landmark, cone, barrier
- "aware" must include VEHICLE-SPECIFIC peripheral cue + next visual target
- NEVER abstract: say "red/white inside kerb" not "the apex"
- NEVER mention driving technique — only WHAT TO LOOK AT
- Each "eyes" instruction = ONE clear place for brain to settle
- "cueLabel" follows the pattern: "Eyes [target] — Aware [next target]"
"""

        gaze_phases = template.get('gazePhases', {})
        phases_info = json.dumps(gaze_phases, indent=2) if gaze_phases else "Use standard 5-phase model"

        user = f"""Generate the gaze sequence for this classified corner:

CORNER: {classified.get('name', 'Unknown')} (#{classified.get('cornerNumber', '?')})
TYPE: {classified.get('type', 'medium')} — {classified.get('direction', 'unknown')}
QE DIFFICULTY: {classified.get('qeDifficulty', 'moderate')}
TRACK: {track_config.get('trackName', 'Unknown')}

VEHICLE GAZE PHASES:
{phases_info}

Return ONLY valid JSON:
{{
  "cornerNumber": {classified.get('cornerNumber', 1)},
  "gazeSequence": {{
    "brakeMarkerVisible": {{
      "eyes": "<specific physical target the fovea locks onto>",
      "aware": "<peripheral target + vehicle cue>",
      "fixationDurationSeconds": <0.8-2.0>,
      "cueLabel": "Eyes [target] — Aware [next target]"
    }},
    "brake": {{
      "eyes": "<specific physical target>",
      "aware": "<peripheral target + vehicle cue>",
      "fixationDurationSeconds": <0.5-1.5>,
      "cueLabel": "Eyes [target] — Aware [next target]"
    }},
    "apex": {{
      "eyes": "<specific physical target>",
      "aware": "<peripheral target + vehicle cue>",
      "fixationDurationSeconds": <0.8-2.5>,
      "cueLabel": "Eyes [target] — Aware [next target]"
    }},
    "exit": {{
      "eyes": "<specific physical target>",
      "aware": "<peripheral target + vehicle cue>",
      "fixationDurationSeconds": <0.5-1.5>,
      "cueLabel": "Eyes [target] — Aware [next target]"
    }},
    "nextMarker": {{
      "eyes": "<specific physical target>",
      "aware": "<peripheral target + vehicle cue>",
      "fixationDurationSeconds": <0.5-1.0>,
      "cueLabel": "Eyes [target] — Aware [next target]"
    }}
  }}
}}"""

        return self._call_with_retry(system, user)

    # ── Step 3: Risk Analysis ────────────────────────────────

    def _step3_risk_analysis(self, classified, gaze_data, template, track_config):
        system = f"""You are a motorsport Quiet Eye risk analyst.
{self.QE_PRINCIPLES}

VEHICLE: {template['vehicleType']}

THE FOUR CUES reference:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"

A corner is WEAK if:
- QE difficulty is "challenging" or "expert"
- It has 3+ risk factors
- The gaze sequence requires rapid transitions with low confidence targets
"""

        user = f"""Analyze gaze risks for this corner:

CORNER: {classified.get('name', 'Unknown')} (#{classified.get('cornerNumber', '?')})
TYPE: {classified.get('type', 'medium')}
VAN TRIGGER: {classified.get('primaryVanTrigger', 'unknown')}
QE DIFFICULTY: {classified.get('qeDifficulty', 'moderate')}

GAZE SEQUENCE:
{json.dumps(gaze_data.get('gazeSequence', {}), indent=2)}

Return ONLY valid JSON:
{{
  "cornerNumber": {classified.get('cornerNumber', 1)},
  "riskFactors": ["<risk 1>", "<risk 2>", "<risk 3 if applicable>"],
  "isWeakCorner": <true|false>,
  "weakCornerReason": "<reason or empty string>",
  "quietEyeCue": "Settle your eyes on [specific target] — let the [vehicle] follow.",
  "coachingNotes": "<2-3 sentences about gaze targets and awareness ONLY — no driving technique>"
}}"""

        return self._call_with_retry(system, user)

    # ── Step 4: Protocol Assembly ────────────────────────────

    def _step4_protocol(self, processed_corners, template, track_config):
        system = f"""You are the Quiet Eye training protocol architect.
{self.QE_PRINCIPLES}

Design a 5-lap progressive conditioning strategy.
The training follows a 4-week progression:
- Week 1: 0.5x speed, 5-second pauses at each gaze point, WATCH + LISTEN
- Week 2: 0.75x speed, 4-second pauses, LOOK AND CALL (say cues aloud)
- Week 3: 1.0x speed, 3-second pauses, AUDIO CUES ONLY (eyes closed optional)
- Week 4: 1.25x speed, 2-second pauses, AUTOMATIC (full speed, markers only)

Every corner uses the SAME four cue structure:
1. "Eyes Braking Marker — Aware Apex"
2. "Eyes Apex — Aware Exit"
3. "Eyes Exit — Aware Straight"
4. "Eyes Straight — Aware Braking Marker"
"""

        user = f"""Assemble the training protocol for all {len(processed_corners)} corners:

TRACK: {track_config.get('trackName', 'Unknown')}
VEHICLE: {template['vehicleType']}
SKILL LEVEL: {track_config.get('skillLevel', 'intermediate')}

PROCESSED CORNERS:
{json.dumps(processed_corners, indent=2, default=str)}

Return ONLY valid JSON:
{{
  "overallStrategy": "<gaze philosophy focusing on 4-cue rhythm and flow state>",
  "keyPrinciple": "<THE single most important insight for this track>",
  "corners": [
    {{
      "number": <int>,
      "lookAndCall": [
        "Eyes Braking Marker — Aware Apex",
        "Eyes Apex — Aware Exit",
        "Eyes Exit — Aware Straight",
        "Eyes Straight — Aware Braking Marker"
      ],
      "headRotationCue": "Begin head rotation [time] before turn-in...",
      "speedRamp": "25%|50%|100%"
    }}
  ],
  "trainingProtocol": {{
    "dailyMinutes": 15,
    "steps": [
      {{"title": "Watch + Listen (Week 1)", "instruction": "0.5x speed, 5s pauses", "duration": "5min"}},
      {{"title": "Look and Call (Week 2)", "instruction": "0.75x speed, say cues aloud", "duration": "5min"}},
      {{"title": "Audio Only (Week 3)", "instruction": "1.0x speed, no overlays", "duration": "3min"}},
      {{"title": "Full Speed (Week 4)", "instruction": "1.25x speed, automatic", "duration": "2min"}},
      {{"title": "Weak Corner Repetition", "instruction": "3x reps on weak corners", "duration": "5min"}}
    ],
    "weakCornerDrills": "<If Quiet Eye breaks on weak corners, describe remediation>"
  }}
}}"""

        return self._call_with_retry(system, user)

    # ── Helpers ──────────────────────────────────────────────

    def _call_with_retry(self, system, user, max_retries=1):
        """Call Claude pipeline with retry on parse failure."""
        for attempt in range(max_retries + 1):
            try:
                return self.api.call_claude_pipeline(system, user)
            except json.JSONDecodeError as e:
                if attempt < max_retries:
                    user += f"\n\nPREVIOUS RESPONSE FAILED JSON PARSING: {e}\nPlease return ONLY valid JSON, no markdown."
                else:
                    raise
            except Exception:
                if attempt < max_retries:
                    continue
                raise

    def _get_template(self, vehicle_type):
        """Get vehicle-specific template."""
        from src.blueprint_templates import TEMPLATES
        return TEMPLATES.get(vehicle_type, TEMPLATES.get('car', {'vehicleType': vehicle_type}))
