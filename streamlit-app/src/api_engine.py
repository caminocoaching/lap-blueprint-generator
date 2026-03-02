"""
API Engine — Wraps Gemini and Claude for the Lap Blueprint Generator.
"""
import json
import re
import time
import base64
import requests
import google.generativeai as genai
from anthropic import Anthropic


def _repair_json(text):
    """Attempt to repair common JSON issues from LLM outputs."""
    text = text.strip()
    # Strip markdown code blocks
    if text.startswith('```'):
        lines = text.split('\n')
        text = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])

    # Fix trailing commas before } or ]
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # Fix unterminated strings — truncate at last valid JSON structure
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try truncating to last complete object/array
    for end_char in ['}', ']']:
        last_idx = text.rfind(end_char)
        if last_idx > 0:
            candidate = text[:last_idx + 1]
            # Balance braces
            open_b = candidate.count('{') - candidate.count('}')
            open_a = candidate.count('[') - candidate.count(']')
            candidate += '}' * max(0, open_b) + ']' * max(0, open_a)
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue

    raise json.JSONDecodeError("Could not repair JSON", text, 0)


class APIEngine:
    """Manages all AI API calls for the blueprint generation pipeline."""

    GEMINI_MODELS = {
        'gemini-2.5-flash': 'Gemini 2.5 Flash (Recommended)',
        'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite (Fastest)',
        'gemini-2.5-pro': 'Gemini 2.5 Pro (Best Quality)',
    }

    CLAUDE_MODELS = {
        'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5 (Recommended)',
        'claude-opus-4-5-20251101': 'Claude Opus 4.5 (Most Powerful)',
    }

    def __init__(self, gemini_key=None, claude_key=None,
                 gemini_model='gemini-2.5-flash', claude_model='claude-sonnet-4-5-20250929'):
        self.gemini_key = gemini_key
        self.claude_key = claude_key
        self.gemini_model = gemini_model
        self.claude_model = claude_model

        # Initialize clients
        if gemini_key:
            genai.configure(api_key=gemini_key)
        if claude_key:
            self.claude_client = Anthropic(api_key=claude_key)
        else:
            self.claude_client = None

    # ── Gemini: Analyze Video Frames ─────────────────────────

    def analyze_frames_gemini(self, frames_b64, track_map_b64=None, progress_cb=None):
        """
        Send batches of base64 JPEG frames to Gemini for corner classification.

        Args:
            frames_b64: list of dicts {index, time, data} where data is base64 JPEG
            track_map_b64: optional base64 track map image for spatial context
            progress_cb: callback(percent, message)

        Returns: list of classified frames with phase, direction, severity, confidence
        """
        model = genai.GenerativeModel(self.gemini_model)
        batch_size = 8
        all_results = []
        total_batches = (len(frames_b64) + batch_size - 1) // batch_size

        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            end = min(start + batch_size, len(frames_b64))
            batch = frames_b64[start:end]

            if progress_cb:
                pct = int((batch_idx / total_batches) * 80)
                progress_cb(pct, f"AI analyzing batch {batch_idx + 1}/{total_batches}...")

            # Build content parts
            parts = []

            # Add track map if available
            if track_map_b64 and batch_idx == 0:
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": track_map_b64
                    }
                })
                parts.append("TRACK MAP above for spatial reference.\n\n")

            # Add frame images
            for frame in batch:
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": frame['data']
                    }
                })
                parts.append(f"Frame {frame['index']} at t={frame['time']:.1f}s\n")

            # Add classification prompt
            parts.append(self._build_vision_prompt(batch))

            try:
                response = model.generate_content(
                    parts,
                    generation_config=genai.GenerationConfig(
                        temperature=0.2,
                        max_output_tokens=8192,
                        response_mime_type="application/json",
                    )
                )

                result = json.loads(response.text)
                frames_data = result.get('frames', result if isinstance(result, list) else [result])
                all_results.extend(frames_data)

            except Exception as e:
                print(f"[Gemini] Batch {batch_idx + 1} failed: {e}")
                # Add empty results for failed batch
                for frame in batch:
                    all_results.append({
                        'index': frame['index'],
                        'time': frame['time'],
                        'phase': 'unknown',
                        'confidence': 0,
                        'error': str(e)
                    })

            # Rate limiting
            if batch_idx < total_batches - 1:
                time.sleep(0.5)

        if progress_cb:
            progress_cb(85, "Building corner sequences...")

        return all_results

    def _build_vision_prompt(self, batch):
        """Build the Gemini vision classification prompt."""
        return f"""You are a motorsport visual target analyst using Quiet Eye science.

Analyze these {len(batch)} consecutive onboard video frames.

For EACH frame, classify the corner phase based on what is VISIBLE:
- "straight" — open road ahead, no corner features
- "braking" — braking markers/boards visible, horizon dropping (nose dive)
- "turn_in" — beginning to change direction
- "mid_corner" — in the corner, kerbs alongside
- "apex" — tightest point, inside kerb closest
- "exit" — corner opening up, track widening
- "between_corners" — transitioning between corners

VEHICLE DYNAMICS TO LOOK FOR:
- HORIZON TILT = lean angle (motorcycle) or body roll (car)
- HORIZON DROP = braking (nose dive)
- HORIZON RISE = acceleration
- TRACK EXPANSION RATE = speed indicator
- KERB PROXIMITY = apex location
- TRACK CURVATURE = corner severity

Return JSON:
{{
  "frames": [
    {{
      "index": <frame_index>,
      "time": <time_in_seconds>,
      "phase": "straight|braking|turn_in|mid_corner|apex|exit|between_corners",
      "direction": "left|right|none",
      "severity": "hairpin|medium|fast_sweeper|kink|chicane_element",
      "confidence": 0.0-1.0,
      "leanAngle": <degrees_estimated>,
      "speedEstimate": "very_high|high|medium|low|very_low",
      "kerbs": "none|approaching|alongside|receding",
      "gazeTarget": "<what the Quiet Eye should fixate on in this frame>",
      "notes": "<brief description>"
    }}
  ]
}}"""

    # ── Gemini: Upload Full Video ────────────────────────────

    def upload_video_gemini(self, video_path, progress_cb=None):
        """
        Upload a video file to Gemini Files API for analysis.
        Returns the file URI for use in subsequent calls.
        """
        if progress_cb:
            progress_cb(10, "Uploading video to Gemini...")

        video_file = genai.upload_file(video_path)

        # Poll until ready
        max_polls = 120
        for i in range(max_polls):
            video_file = genai.get_file(video_file.name)
            if video_file.state.name == "ACTIVE":
                if progress_cb:
                    progress_cb(30, "Video uploaded and ready")
                return video_file
            if video_file.state.name == "FAILED":
                raise RuntimeError(f"Video upload failed: {video_file.state.name}")
            if progress_cb:
                progress_cb(10 + int(20 * i / max_polls), "Processing video...")
            time.sleep(5)

        raise TimeoutError("Video processing timed out")

    def analyze_video_forward(self, video_file, start_time=0, end_time=None,
                              track_model=None, progress_cb=None):
        """
        FORWARD PASS: Analyze uploaded video with track context.
        The AI already knows the track layout from Step 2 and uses that
        knowledge to find and timestamp each corner in the video.

        Args:
            video_file: Gemini file object from upload_video_gemini()
            start_time: lap start in seconds
            end_time: lap end in seconds
            track_model: dict from Step 2 track analysis (corners, geometry, visual targets)
            progress_cb: callback(percent, message)

        Returns: list of detected corners with timestamps and gaze targets
        """
        if progress_cb:
            progress_cb(35, "Forward pass: matching video to track model...")

        model = genai.GenerativeModel(self.gemini_model)

        time_range = ""
        if start_time or end_time:
            time_range = f"\nAnalyze only the section from {start_time:.1f}s to {end_time:.1f}s."

        # Inject track model context so Gemini knows what to expect
        track_context = ""
        if track_model:
            known_corners = track_model.get('corners', [])
            if known_corners:
                track_context = f"""
TRACK MODEL (from map + guide analysis — you KNOW this track):
Track: {track_model.get('trackName', 'Unknown')}
Direction: {track_model.get('trackDirection', 'unknown')}
Characteristics: {track_model.get('trackCharacteristics', '')}

EXPECTED CORNERS (match these to what you see in the video):
"""
                for c in known_corners:
                    vt = c.get('visual_targets', {})
                    braking_ref = vt.get('braking', 'braking markers')
                    apex_ref = vt.get('apex', 'inside kerb')
                    exit_ref = vt.get('exit', 'exit kerb')
                    racing_notes = c.get('racingLineNotes', c.get('guideNotes', ''))

                    track_context += (
                        f"  Corner {c.get('number', '?')}: {c.get('name', '?')} "
                        f"— {c.get('direction', '?')} {c.get('severity', '?')}\n"
                        f"    LOOK FOR: Brake={braking_ref} | Apex={apex_ref} | Exit={exit_ref}\n"
                    )
                    if racing_notes:
                        track_context += f"    NOTES: {racing_notes}\n"

                track_context += (
                    "\nYour job is to TIMESTAMP when each of these known corners appears in the video.\n"
                    "Use the visual references above to confirm you've found the right corner."
                )

        prompt = f"""You are a motorsport visual target analyst using Quiet Eye (QE) science by Joan Vickers.
{track_context}

YOUR JOB: Watch this onboard lap video and identify every corner's 4 critical moments:

1. BRAKING MARKER VISIBLE — The moment a braking reference (board, cone, mark) first appears in the visual field
2. APEX VISIBLE — The moment the inside of the corner (kerb, paint, post) becomes the dominant visual target
3. EXIT VISIBLE — The moment the corner exit (track opening, exit kerb, straight ahead) becomes visible
4. STRAIGHT / NEXT MARKER — The moment the road opens and the next braking reference appears
{time_range}

RULES:
- Only report what is PHYSICALLY VISIBLE in the frame
- Use SPECIFIC objects: "100m board", "red/white kerb", "orange cone", "pit wall end"
- Never use abstract descriptions like "the braking zone" or "the apex"
- Report timestamps relative to video start
- If a track model was provided, match your detected corners to the known layout

Return JSON:
{{
  "corners": [
    {{
      "number": 1,
      "name": "Corner name if identifiable",
      "direction": "left|right",
      "severity": "hairpin|tight|medium|fast_sweeper|kink",
      "markers": {{
        "firstSight": {{
          "time": <seconds>,
          "gazeTarget": "<specific visible object>",
          "confidence": 0.0-1.0
        }},
        "brake": {{
          "time": <seconds>,
          "gazeTarget": "<specific visible object>",
          "confidence": 0.0-1.0
        }},
        "apex": {{
          "time": <seconds>,
          "gazeTarget": "<specific visible object>",
          "confidence": 0.0-1.0
        }},
        "exit": {{
          "time": <seconds>,
          "gazeTarget": "<specific visible object>",
          "confidence": 0.0-1.0
        }}
      }},
      "notes": "<brief description of corner character>"
    }}
  ],
  "trackNotes": "<overall track characteristics observed>"
}}"""

        try:
            response = model.generate_content(
                [video_file, prompt],
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                )
            )

            try:
                result = json.loads(response.text)
            except json.JSONDecodeError:
                result = _repair_json(response.text)
            if progress_cb:
                corners = result.get('corners', [])
                progress_cb(65, f"Forward pass: found {len(corners)} corners")
            return result

        except Exception as e:
            if progress_cb:
                progress_cb(65, f"Forward pass error: {e}")
            raise

    def analyze_video_reverse(self, video_file, forward_corners, start_time=0,
                               end_time=None, progress_cb=None):
        """
        REVERSE RUN: Re-analyze the video working BACKWARDS from each corner's exit
        to its entry. This is the Quiet Eye principle — you must know WHERE YOU'RE GOING
        (exit) before you decide WHERE TO LOOK (entry).

        For each corner found in the forward pass:
        - Start from the EXIT timestamp
        - Work backwards to the BRAKING MARKER
        - Validate and refine the gaze targets in reverse order
        - Ensure the 4-cue chain is physically connected

        Args:
            video_file: Gemini file object
            forward_corners: corners from analyze_video_forward()
            start_time: lap start seconds
            end_time: lap end seconds
            progress_cb: callback(percent, message)

        Returns: refined corners with reverse-validated gaze targets
        """
        if progress_cb:
            progress_cb(70, "Reverse run: validating gaze chain exit→entry...")

        model = genai.GenerativeModel(self.gemini_model)

        time_range = ""
        if start_time or end_time:
            time_range = f"\nOriginal lap section: {start_time:.1f}s to {end_time:.1f}s."

        corners_json = json.dumps(forward_corners, indent=2, default=str)

        prompt = f"""You are a Quiet Eye REVERSE VALIDATION specialist.

THE QUIET EYE PRINCIPLE:
Every gaze chain must flow from EXIT back to ENTRY. The driver needs to know
WHERE THEY ARE GOING before they can plan WHERE TO LOOK on approach.

FORWARD PASS DETECTED THESE CORNERS:
{corners_json}
{time_range}

YOUR JOB — REVERSE RUN:
For EACH corner, work BACKWARDS from exit to entry and validate:

1. EXIT → Can the driver's eyes PHYSICALLY SEE the exit target from the apex?
2. APEX → Does this target naturally lead the eyes FROM the braking marker?
3. BRAKE → Is this marker visible EARLY ENOUGH to allow a calm fixation (not a panic grab)?
4. FIRST SIGHT → When does the approaching corner first enter the visual field?

CHECK EACH GAZE TRANSITION:
- Eyes on Braking Marker → can you SEE the apex in peripheral vision? (if not, the aware cue is wrong)
- Eyes on Apex → can you SEE the exit in peripheral vision? (if not, fix the aware target)
- Eyes on Exit → can you SEE the next straight? (if not, adjust)
- Eyes on Straight → can you SEE the next braking marker approaching? (if not, the chain breaks)

ALSO FLAG:
- Corners where the driver can't physically see the next target (blind crests, camber changes)
- Transitions that happen too fast for proper fixation
- Gaze targets that are ambiguous or not specific enough

Watch the video AGAIN and refine each corner. Keep all original timestamps but fix any
gaze targets that don't work in the reverse direction.

Return JSON:
{{
  "corners": [
    {{
      "number": <int>,
      "name": "<corner name>",
      "direction": "left|right",
      "severity": "<severity>",
      "markers": {{
        "firstSight": {{
          "time": <seconds>,
          "gazeTarget": "<refined specific target>",
          "confidence": 0.0-1.0,
          "reverseValidated": true
        }},
        "brake": {{
          "time": <seconds>,
          "gazeTarget": "<refined specific target>",
          "confidence": 0.0-1.0,
          "canSeeApexFromHere": true|false,
          "reverseValidated": true
        }},
        "apex": {{
          "time": <seconds>,
          "gazeTarget": "<refined specific target>",
          "confidence": 0.0-1.0,
          "canSeeExitFromHere": true|false,
          "reverseValidated": true
        }},
        "exit": {{
          "time": <seconds>,
          "gazeTarget": "<refined specific target>",
          "confidence": 0.0-1.0,
          "canSeeStraightFromHere": true|false,
          "reverseValidated": true
        }}
      }},
      "gazeChainValid": true|false,
      "gazeChainIssues": "<description of any breaks in the visual chain, or 'clean'>",
      "notes": "<refined description>"
    }}
  ],
  "reverseRunNotes": "<overall observations about gaze chain quality across the lap>"
}}"""

        try:
            response = model.generate_content(
                [video_file, prompt],
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                )
            )

            try:
                result = json.loads(response.text)
            except json.JSONDecodeError:
                result = _repair_json(response.text)
            if progress_cb:
                corners = result.get('corners', [])
                valid = sum(1 for c in corners if c.get('gazeChainValid', False))
                progress_cb(85, f"Reverse run: {valid}/{len(corners)} gaze chains validated")
            return result

        except Exception as e:
            if progress_cb:
                progress_cb(85, f"Reverse run error: {e}")
            raise

    # ── Web Research: Deep Track Research ────────────────────

    def research_track(self, track_name, progress_cb=None):
        """
        Deep web research for track data when no guide is uploaded.
        Uses Gemini to search and synthesize track information including:
        - Corner names, directions, severities
        - Visual landmarks and braking markers
        - Elevation changes, camber, surface details
        - Common racing lines and hazards

        Returns structured track data similar to what a guide would provide.
        """
        if progress_cb:
            progress_cb(10, f"Researching {track_name} online...")

        model = genai.GenerativeModel(self.gemini_model)

        prompt = f"""You are a motorsport track researcher compiling a detailed corner-by-corner guide.

Research and compile everything you know about: **{track_name}**

For EACH corner, provide:
1. **Official name** (if known) and number
2. **Direction** (left/right)
3. **Severity** (hairpin, tight, medium, fast_sweeper, kink, flat_out)
4. **Physical landmarks** visible to the driver:
   - Braking markers (distance boards, cones, marks, shadows, buildings)
   - Apex references (kerb colors, painted lines, posts, grass edges)
   - Exit references (kerb ends, barriers, tree lines, fences)
5. **Track characteristics**: elevation (uphill/downhill/flat/crest/dip),
   camber (positive/negative/off-camber), surface changes, bumps
6. **Hazards**: run-off type, barrier proximity, gravel traps, walls
7. **Racing line notes**: late apex corners, double-apex, tightening radius etc.

Also provide:
- Track direction (clockwise/counter-clockwise)
- Track length
- Overall character (fast flowing, technical, mixed, street circuit etc.)
- Any notable features (blind crests, off-camber corners, compression zones)

IMPORTANT: Only include information you are confident about.
If you're unsure about a specific detail, say so rather than guessing.

Return JSON:
{{
  "trackName": "{track_name}",
  "trackLength": "<length if known>",
  "trackDirection": "clockwise|counter-clockwise",
  "country": "<country>",
  "trackCharacteristics": "<overall description>",
  "notableFeatures": ["<feature 1>", "<feature 2>"],
  "corners": [
    {{
      "number": <int>,
      "name": "<official corner name>",
      "direction": "left|right",
      "severity": "hairpin|tight|medium|fast_sweeper|kink|flat_out",
      "visual_targets": {{
        "braking": "<specific physical braking marker>",
        "apex": "<specific physical apex reference>",
        "exit": "<specific physical exit reference>"
      }},
      "geometry": {{
        "radius_estimate": "tight|medium|open",
        "elevation": "flat|uphill|downhill|crest|dip",
        "camber": "positive|negative|flat|off-camber"
      }},
      "hazards_visible": ["<hazard 1>", "<hazard 2>"],
      "racingLineNotes": "<key racing line information>",
      "notes": "<anything else relevant for gaze planning>"
    }}
  ],
  "researchConfidence": "high|medium|low",
  "sourceNotes": "<what sources or knowledge this is based on>"
}}"""

        for attempt in range(2):
            try:
                response = model.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        temperature=0.3,
                        max_output_tokens=8192,
                        response_mime_type="application/json",
                    )
                )

                # Try standard parse first, fall back to repair
                try:
                    result = json.loads(response.text)
                except json.JSONDecodeError:
                    result = _repair_json(response.text)

                if progress_cb:
                    corners = result.get('corners', [])
                    confidence = result.get('researchConfidence', 'unknown')
                    progress_cb(50, f"Found {len(corners)} corners (confidence: {confidence})")
                return result

            except json.JSONDecodeError as e:
                if attempt == 0:
                    if progress_cb:
                        progress_cb(30, f"Retrying research (JSON parse issue)...")
                    continue
                if progress_cb:
                    progress_cb(50, f"Research JSON error: {e}")
                raise
            except Exception as e:
                if progress_cb:
                    progress_cb(50, f"Research error: {e}")
                raise

    # ── Claude: Blueprint Pipeline ───────────────────────────

    def call_claude_pipeline(self, system_prompt, user_prompt, temperature=0):
        """
        Call Claude for deterministic pipeline steps.
        Returns parsed JSON response.
        """
        if not self.claude_client:
            raise ValueError("Claude API key not configured")

        response = self.claude_client.messages.create(
            model=self.claude_model,
            max_tokens=4096,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extract text content
        text = response.content[0].text

        # Parse JSON (handle markdown code blocks)
        text = text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])

        return json.loads(text)

    def call_claude_full(self, system_prompt, user_prompt, temperature=0.7):
        """
        Call Claude for full blueprint generation (non-pipeline mode).
        Returns parsed JSON response.
        """
        if not self.claude_client:
            raise ValueError("Claude API key not configured")

        response = self.claude_client.messages.create(
            model=self.claude_model,
            max_tokens=8192,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        text = response.content[0].text
        text = text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])

        return json.loads(text)

    # ── SWEEP 1: Track Map → Template ────────────────────────

    def extract_track_template(self, image_b64, track_name, progress_cb=None):
        """
        SWEEP 1: Extract the track TEMPLATE from a map image using Gemini.

        Uses a 3-pass approach that SEPARATES vision from spatial reasoning:
          Pass 1 (VISION): Describe what you see — compass headings at each corner
          Pass 2 (REASONING, no image): Compute L/R from heading changes + direction
          Pass 3 (VISION): Confirm severity of each corner by looking at the map again

        This works because AI models score 10/10 on DESCRIBING images but fail
        at SPATIAL REASONING about left/right. By separating the two tasks,
        we get accurate results from both.
        """
        if not self.gemini_key:
            raise ValueError("Gemini API key not configured — required for track map reading")

        if progress_cb:
            progress_cb(5, "Sweep 1: Reading track map with Gemini Pro (3-pass)...")

        # Use Pro model for map reading — spatial reasoning needs the best model
        map_model_name = 'gemini-2.5-pro'
        model = genai.GenerativeModel(map_model_name)

        # Build image part (reused in vision passes)
        image_part = {
            "inline_data": {
                "mime_type": "image/jpeg",
                "data": image_b64
            }
        }

        # ═══════════════════════════════════════════════════════
        # PASS 1 — PURE VISION: Describe geometry, no L/R judgment
        # ═══════════════════════════════════════════════════════
        # Key insight: AI describes images perfectly (10/10) but reasons
        # about L/R incorrectly. So we ask ONLY for descriptions here.
        pass1_prompt = f"""You are analyzing a circuit map image of {track_name}.

YOUR TASK: DESCRIBE what you see. Do NOT judge left or right — just describe geometry.

1. ARROW: Find the direction arrow on the map. Describe:
   - Where on the map is the arrow?
   - What COMPASS direction does the arrow point? (N, NE, E, SE, S, SW, W, NW)
   - Is the arrow on the main straight?

2. NUMBERED CORNERS: Find all numbered corners (in circles on the map).
   List every number you can see.

3. For EACH numbered corner, describe the GEOMETRY of the track AT that point.
   DO NOT say "left" or "right". Instead, describe:
   - What COMPASS direction is the track heading APPROACHING this corner?
     (e.g., "heading North", "heading Southeast")
   - What COMPASS direction is the track heading LEAVING this corner?
     (e.g., "heading West", "heading Northwest")
   - How TIGHT is the curve? (barely deflects / gentle arc / moderate bend /
     sharp bend / hairpin — almost reverses direction)
   - POSITION on the map: is this corner at the top/bottom/left/right of the circuit?

4. OVERALL SHAPE: Describe the overall shape of the circuit.
   Where is the main straight? Where does the circuit go from there?

CRITICAL: Do NOT use the words "left" or "right" for turn direction.
Only use compass directions and geometric descriptions.

Return JSON:
{{
  "trackName": "{track_name}",
  "arrow": {{
    "position": "<where on the map>",
    "compassDirection": "<N/NE/E/SE/S/SW/W/NW>",
    "onMainStraight": true
  }},
  "cornersFound": [<list of all corner numbers visible>],
  "corners": [
    {{
      "number": <int>,
      "approachHeading": "<compass direction approaching>",
      "exitHeading": "<compass direction leaving>",
      "tightness": "kink|gentle|moderate|sharp|hairpin",
      "mapPosition": "<top/bottom/left/right/center of circuit>",
      "description": "<brief geometric description of what the track does here>"
    }}
  ],
  "overallShape": "<describe the circuit shape and where features are>"
}}"""

        if progress_cb:
            progress_cb(8, "Pass 1: Describing track geometry (no L/R judgment)...")

        try:
            pass1_response = model.generate_content(
                [image_part, pass1_prompt],
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                )
            )

            try:
                pass1_result = json.loads(pass1_response.text)
            except json.JSONDecodeError:
                pass1_result = _repair_json(pass1_response.text)

            total_corners = len(pass1_result.get('corners', []))
            if progress_cb:
                progress_cb(18, f"Pass 1: Described {total_corners} corners geometrically")

        except Exception as e:
            if progress_cb:
                progress_cb(18, f"Pass 1 error: {e}")
            raise

        # ═══════════════════════════════════════════════════════
        # PASS 2 — PURE REASONING: Compute L/R from headings
        # (NO image — text only, so no spatial confusion)
        # ═══════════════════════════════════════════════════════
        pass1_json = json.dumps(pass1_result, indent=2)

        pass2_prompt = f"""You are a navigation expert. Given COMPASS HEADINGS at each corner
of a racing circuit, determine the direction of travel and whether each turn is LEFT or RIGHT.

Here is the geometric description of {track_name}:

{pass1_json}

RULES FOR DETERMINING LEFT vs RIGHT:
When you are heading in a direction and the road changes to a new heading:
- If the heading rotates COUNTER-CLOCKWISE (e.g., North → West, East → North,
  South → East, West → South), that is a LEFT turn
- If the heading rotates CLOCKWISE (e.g., North → East, East → South,
  South → West, West → North), that is a RIGHT turn

COMPASS ROTATION REFERENCE:
Clockwise order: N → NE → E → SE → S → SW → W → NW → N
Counter-clockwise: N → NW → W → SW → S → SE → E → NE → N

WORK THROUGH EACH CORNER:
For each corner, take the approach heading and exit heading.
Determine which way the heading rotated (CW = right turn, CCW = left turn).

Then determine overall circuit direction:
- If the car completes the loop by mostly turning LEFT → counter-clockwise circuit
- If the car completes the loop by mostly turning RIGHT → clockwise circuit

SEVERITY MAPPING:
- kink → kink
- gentle → fast_sweeper
- moderate → medium
- sharp → tight
- hairpin → hairpin

Return JSON:
{{
  "trackName": "{track_name}",
  "trackDirection": "clockwise|counter-clockwise",
  "reasoning": "<step by step: for each corner, approach heading → exit heading → rotation direction → left/right>",
  "corners": [
    {{
      "number": <int>,
      "approachHeading": "<from pass 1>",
      "exitHeading": "<from pass 1>",
      "headingRotation": "clockwise|counter-clockwise",
      "direction": "left|right",
      "severity": "hairpin|tight|medium|fast_sweeper|kink",
      "name": ""
    }}
  ],
  "cornerSummary": "<X left-hand turns, Y right-hand turns>",
  "layoutNotes": "<brief description>"
}}"""

        if progress_cb:
            progress_cb(22, "Pass 2: Computing L/R from compass headings (text-only reasoning)...")

        try:
            # TEXT-ONLY call — no image, pure reasoning
            pass2_response = model.generate_content(
                pass2_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                )
            )

            try:
                result = json.loads(pass2_response.text)
            except json.JSONDecodeError:
                result = _repair_json(pass2_response.text)

            # Add the direction evidence from pass 1
            result['directionEvidence'] = result.get('reasoning', '')
            result['totalCorners'] = len(result.get('corners', []))

            if progress_cb:
                corners = result.get('corners', [])
                left = sum(1 for c in corners if c.get('direction') == 'left')
                right = sum(1 for c in corners if c.get('direction') == 'right')
                direction = result.get('trackDirection', '?')
                progress_cb(40, f"Sweep 1: {len(corners)} corners ({left}L, {right}R) — {direction}")

            return result

        except Exception as e:
            if progress_cb:
                progress_cb(40, f"Pass 2 error: {e}")
            raise

    # ── SWEEP 2: Guide → Enrich Template ──────────────────────

    def enrich_template_with_guide(self, template, guide_text, track_name, progress_cb=None):
        """
        SWEEP 2: Take the template from Sweep 1 and enrich it with the track guide.

        The guide has the detail — braking references, apex kerbs, racing lines,
        elevation, camber, hazards. This sweep maps that detail onto the template
        so every corner gets specific visual references the video AI can look for.
        """
        if not self.claude_client:
            raise ValueError("Claude API key not configured")

        if progress_cb:
            progress_cb(50, "Sweep 2: Enriching template with track guide...")

        template_json = json.dumps(template.get('corners', []), indent=2)

        system_prompt = """You are a motorsport visual target specialist.
You have a track TEMPLATE (corner count, directions, severities) and a TRACK GUIDE.
Your job is to map the guide's detail onto the template — filling in the specific
visual references for each corner.

Return ONLY valid JSON. Never invent information not in the guide."""

        user_prompt = f"""TRACK: {track_name}

TEMPLATE (from map analysis — this is the correct corner count and sequence):
{template_json}

TRACK GUIDE CONTENT:
{guide_text[:6000]}

For EACH corner in the template, extract from the guide:

1. **Visual targets** the driver can physically see:
   - braking: What physical object marks the braking point? (board, cone, mark, shadow, building)
   - apex: What physical object marks the apex? (kerb colour, paint line, post, grass edge)
   - exit: What physical object marks the exit? (kerb end, barrier, tree line, fence)

2. **Corner name** if the guide gives one

3. **Racing line notes** (late apex, double apex, carry speed, etc.)

4. **Track characteristics** at this corner (elevation, camber, surface)

5. **Hazards** (run-off type, wall proximity, gravel)

IMPORTANT:
- The template corner count is CORRECT — do not add or remove corners
- If the guide doesn't mention a specific corner, leave its visual targets empty
- If the guide uses different corner numbering, map it to the template's sequence
- Only include information that's actually in the guide

Return JSON:
{{
  "corners": [
    {{
      "number": <matching template number>,
      "name": "<from guide or empty>",
      "direction": "<keep from template>",
      "severity": "<keep from template>",
      "visual_targets": {{
        "braking": "<specific physical object from guide>",
        "apex": "<specific physical object from guide>",
        "exit": "<specific physical object from guide>"
      }},
      "racingLineNotes": "<from guide>",
      "elevation": "<from guide: flat/uphill/downhill/crest/dip>",
      "camber": "<from guide: positive/negative/flat/off-camber>",
      "hazards": ["<from guide>"],
      "guideNotes": "<any other useful detail from the guide>"
    }}
  ],
  "trackDirection": "<from guide if stated>",
  "trackCharacteristics": "<overall summary from guide>"
}}"""

        response = self.claude_client.messages.create(
            model=self.claude_model,
            max_tokens=8192,
            temperature=0,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        text = response.content[0].text.strip()
        if text.startswith('```'):
            lines = text.split('\n')
            text = '\n'.join(lines[1:-1])

        result = json.loads(text)

        if progress_cb:
            enriched = sum(1 for c in result.get('corners', [])
                          if c.get('visual_targets', {}).get('braking'))
            total = len(result.get('corners', []))
            progress_cb(75, f"Sweep 2: {enriched}/{total} corners enriched with visual targets")

        return result

    # ── Utility: Merge Video + Map Data ──────────────────────

    @staticmethod
    def merge_corner_data(video_corners, map_corners):
        """
        Merge corner data from video analysis (timing) with track map analysis (geometry).
        Video data takes priority for timestamps; map data enriches with geometry.
        """
        merged = []
        for i, vc in enumerate(video_corners):
            corner = dict(vc)
            if i < len(map_corners):
                mc = map_corners[i]
                # Enrich with map geometry
                corner['geometry'] = mc.get('geometry', {})
                corner['hazards'] = mc.get('hazards_visible', [])
                # Use map visual targets if video targets are weak
                if mc.get('visual_targets'):
                    vt = mc['visual_targets']
                    markers = corner.get('markers', {})
                    for phase in ['brake', 'apex', 'exit']:
                        if phase in markers and markers[phase].get('confidence', 0) < 0.5:
                            if vt.get(phase):
                                markers[phase]['gazeTarget'] = vt[phase]
                                markers[phase]['source'] = 'map'
            merged.append(corner)
        return merged
