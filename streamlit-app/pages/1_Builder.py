"""
Builder — Main workflow page for creating Quiet Eye blueprints.

PIPELINE ORDER:
  Step 1: Data Collection — Track name, map, guide (understand the layout FIRST)
  Step 2: Track Analysis  — GPT-4o reads map, Claude reads guide → track model
  Step 3: Upload & Trim   — Bring in the onboard video
  Step 4: Video Analysis   — Gemini forward pass WITH track context → reverse run
  Step 5: Generate Blueprint — Claude builds QE gaze markers
  Step 6: View & Export
"""
import streamlit as st
import json
import base64
import tempfile
import os

st.markdown("# 🔧 Blueprint Builder")

# Check API keys
gemini_key = st.session_state.get('gemini_key', '')
claude_key = st.session_state.get('claude_key', '')

if not gemini_key or not claude_key:
    st.warning("Please enter your API keys in the sidebar before starting.")
    st.stop()

# Initialize API engine
from src.api_engine import APIEngine
from src.video_processor import VideoProcessor
from src.blueprint_pipeline import BlueprintPipeline
from src.ruapuna_blueprint import is_ruapuna, get_blueprint as get_ruapuna
from src.conditioning_renderer import ConditioningRenderer
from src.pdf_generator import generate_blueprint_pdf

api = APIEngine(
    gemini_key=gemini_key,
    claude_key=claude_key,
    openai_key=st.session_state.get('openai_key', ''),
    gemini_model=st.session_state.get('gemini_model', 'gemini-2.5-flash'),
    claude_model=st.session_state.get('claude_model', 'claude-sonnet-4-5-20250929'),
)


# ═══════════════════════════════════════════════════════════
# STEP 1: DATA COLLECTION — Track name, map, guide
# ═══════════════════════════════════════════════════════════
st.markdown("### Step 1 — Track Data Collection")
st.caption("The AI needs to understand the track layout BEFORE it watches the video.")

track_name = st.text_input(
    "Track Name",
    value=st.session_state.get('track_name', ''),
    placeholder="e.g. Ruapuna Park, Brands Hatch, Misano..."
)
st.session_state['track_name'] = track_name

# Check for Ruapuna pre-built blueprint (shortcut)
if track_name and is_ruapuna(track_name):
    st.success("🎯 Ruapuna detected! Pre-built QE blueprint available.")
    if st.button("Load Ruapuna Blueprint", type="primary"):
        ruapuna = get_ruapuna()
        st.session_state['blueprint'] = ruapuna
        st.session_state['corners'] = ruapuna.get('sections', [])
        st.session_state['track_model'] = {'trackName': track_name, 'prebuilt': True}
        st.rerun()

# Track Map and Track Guide uploads
map_col, guide_col = st.columns(2)

with map_col:
    st.markdown("**Track Map** *(bird's-eye layout)*")
    track_map = st.file_uploader(
        "Upload a track map image",
        type=["jpg", "jpeg", "png", "webp"],
        help="GPT-4o will analyze this map to identify corners, visual targets, geometry, and hazards.",
        key="track_map_upload"
    )
    if track_map:
        st.session_state['track_map'] = track_map
        st.image(track_map, caption="Track Map", use_container_width=True)

with guide_col:
    st.markdown("**Track Guide** *(corner notes, racing line info)*")
    track_guide = st.file_uploader(
        "Upload a track guide (PDF, image, or text)",
        type=["pdf", "jpg", "jpeg", "png", "txt", "md"],
        help="Corner names, racing lines, elevation, camber — anything that helps the AI understand the track.",
        key="track_guide_upload"
    )
    if track_guide:
        st.session_state['track_guide'] = track_guide
        if track_guide.type and track_guide.type.startswith('image'):
            st.image(track_guide, caption="Track Guide", use_container_width=True)
        else:
            st.success(f"Loaded: {track_guide.name}")

        # Extract text from guide
        guide_name = track_guide.name.lower()
        if guide_name.endswith('.txt') or guide_name.endswith('.md'):
            guide_text = track_guide.getvalue().decode('utf-8', errors='ignore')
            st.session_state['track_guide_text'] = guide_text
        elif guide_name.endswith(('.jpg', '.jpeg', '.png')):
            st.session_state['track_guide_text'] = f"[Track guide image uploaded: {track_guide.name}]"
        else:
            st.session_state['track_guide_text'] = f"[Track guide uploaded: {track_guide.name}]"


# ═══════════════════════════════════════════════════════════
# STEP 2: TRACK ANALYSIS — Build the track model BEFORE video
# ═══════════════════════════════════════════════════════════
if track_name and not st.session_state.get('track_model'):
    st.markdown("### Step 2 — Analyze Track Layout")
    st.caption("Build the AI's mental model of the track from your map, guide, and/or web research.")

    has_map = st.session_state.get('track_map') is not None
    has_guide = st.session_state.get('track_guide_text', '') != ''
    has_openai = bool(st.session_state.get('openai_key', ''))

    # Data source indicators
    col_status = st.columns(4)
    col_status[0].markdown(f"{'✅' if has_map else '⬜'} Track Map")
    col_status[1].markdown(f"{'✅' if has_guide else '⬜'} Track Guide")
    col_status[2].markdown(f"{'✅' if has_openai else '⬜'} OpenAI Key")
    col_status[3].markdown("🌐 Web Research")

    st.caption("The AI will always run deep web research on the track. "
               "Map and guide add extra detail on top.")

    if st.button("🗺️ Analyze Track Layout", type="primary"):
        progress = st.progress(0)
        status = st.status("Building track model...")

        track_model = {
            'trackName': track_name,
            'corners': [],
            'trackCharacteristics': '',
            'trackDirection': '',
            'guideNotes': st.session_state.get('track_guide_text', ''),
        }

        try:
            # ── PHASE 1: Deep web research (always runs) ──────
            status.update(label=f"Researching {track_name} online...")
            progress.progress(5)

            try:
                research_result = api.research_track(
                    track_name,
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )

                research_corners = research_result.get('corners', [])
                confidence = research_result.get('researchConfidence', 'unknown')

                if research_corners:
                    track_model['corners'] = research_corners
                    track_model['trackDirection'] = research_result.get('trackDirection', '')
                    track_model['trackCharacteristics'] = research_result.get('trackCharacteristics', '')
                    track_model['trackLength'] = research_result.get('trackLength', '')
                    track_model['country'] = research_result.get('country', '')
                    track_model['notableFeatures'] = research_result.get('notableFeatures', [])
                    track_model['researchConfidence'] = confidence
                    track_model['sourceNotes'] = research_result.get('sourceNotes', '')

                status.update(label=f"Research: {len(research_corners)} corners found (confidence: {confidence})")
                progress.progress(40)

            except Exception as e:
                st.warning(f"Web research had an issue: {e}. Continuing with uploaded data...")
                progress.progress(40)

            # ── PHASE 2: Track map analysis (if uploaded) ─────
            map_data = st.session_state.get('track_map')
            if map_data and has_openai:
                status.update(label="GPT-4o analyzing track map...")
                progress.progress(45)

                map_bytes = map_data.getvalue()
                map_b64 = base64.b64encode(map_bytes).decode()

                map_result = api.analyze_track_map(
                    map_b64, track_name,
                    existing_corners=track_model.get('corners'),
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )

                map_corners = map_result.get('corners', [])

                if map_corners:
                    if not track_model['corners']:
                        # No research data — use map corners directly
                        track_model['corners'] = map_corners
                    else:
                        # Enrich research corners with map visual targets
                        for mc in map_corners:
                            for rc in track_model['corners']:
                                if mc.get('number') == rc.get('number'):
                                    # Map has precise visual targets — prefer these
                                    if mc.get('visual_targets'):
                                        rc['visual_targets'] = mc['visual_targets']
                                    if mc.get('geometry'):
                                        rc['geometry'] = mc['geometry']
                                    if mc.get('hazards_visible'):
                                        rc['hazards_visible'] = mc['hazards_visible']

                if map_result.get('trackCharacteristics'):
                    existing = track_model.get('trackCharacteristics', '')
                    track_model['trackCharacteristics'] = (
                        f"{existing} {map_result['trackCharacteristics']}".strip()
                    )

                progress.progress(65)
            elif map_data and not has_openai:
                st.warning("Add your OpenAI API key in the sidebar to analyze the track map with GPT-4o.")

            # ── PHASE 3: Track guide extraction (if uploaded) ─
            guide_text = st.session_state.get('track_guide_text', '')
            if guide_text and not guide_text.startswith('['):
                status.update(label="Claude reading track guide...")
                progress.progress(70)

                guide_result = api.call_claude_pipeline(
                    system_prompt=f"""You extract structured track data from racing guides.
Return ONLY valid JSON with corner information.""",
                    user_prompt=f"""Extract corner data from this track guide for {track_name}:

{guide_text[:4000]}

Return JSON:
{{
  "corners": [
    {{
      "number": <int>,
      "name": "<corner name>",
      "direction": "left|right",
      "severity": "hairpin|tight|medium|fast|flat_out",
      "notes": "<key info from guide: racing line, elevation, camber, hazards>"
    }}
  ],
  "trackDirection": "clockwise|counter-clockwise",
  "trackCharacteristics": "<brief summary>"
}}"""
                )

                # Merge guide corners with existing corners
                guide_corners = guide_result.get('corners', [])
                if guide_corners and not track_model['corners']:
                    track_model['corners'] = guide_corners
                elif guide_corners and track_model['corners']:
                    # Enrich existing corners with guide-specific notes
                    for gc in guide_corners:
                        for ec in track_model['corners']:
                            if ec.get('number') == gc.get('number'):
                                ec['guideNotes'] = gc.get('notes', '')
                                # Guide corner names are often more accurate
                                if gc.get('name'):
                                    ec['name'] = gc['name']

                if guide_result.get('trackDirection') and not track_model.get('trackDirection'):
                    track_model['trackDirection'] = guide_result['trackDirection']
                if guide_result.get('trackCharacteristics'):
                    existing = track_model.get('trackCharacteristics', '')
                    track_model['trackCharacteristics'] = (
                        f"{existing} {guide_result['trackCharacteristics']}".strip()
                    )

            # ── Save track model ──────────────────────────────
            st.session_state['track_model'] = track_model
            progress.progress(100)
            n_corners = len(track_model.get('corners', []))
            status.update(label=f"Track model built: {n_corners} corners identified", state="complete")

        except Exception as e:
            st.error(f"Track analysis failed: {e}")

# Display track model if it exists
track_model = st.session_state.get('track_model')
if track_model and track_model.get('corners') and not track_model.get('skipped'):
    st.markdown(f"**Track Model: {len(track_model['corners'])} corners identified**")
    if track_model.get('trackCharacteristics'):
        st.caption(track_model['trackCharacteristics'])

    for c in track_model['corners']:
        name = c.get('name', f"Corner {c.get('number', '?')}")
        direction = c.get('direction', '')
        severity = c.get('severity', '')
        with st.expander(f"Corner {c.get('number', '?')}: {name} ({direction} {severity})"):
            vt = c.get('visual_targets', {})
            if vt:
                st.markdown(f"**Braking target:** {vt.get('braking', '—')}")
                st.markdown(f"**Apex target:** {vt.get('apex', '—')}")
                st.markdown(f"**Exit target:** {vt.get('exit', '—')}")
            notes = c.get('notes', c.get('guideNotes', ''))
            if notes:
                st.markdown(f"*{notes}*")


# ═══════════════════════════════════════════════════════════
# STEP 3: UPLOAD & TRIM VIDEO
# ═══════════════════════════════════════════════════════════
if st.session_state.get('track_model') and not st.session_state.get('blueprint'):
    st.markdown("### Step 3 — Upload Onboard Video")

    uploaded = st.file_uploader(
        "Drag your onboard video here",
        type=["mp4", "mov", "avi", "mkv", "webm"],
        help="Upload an onboard lap video from your car, bike, or kart"
    )

    if uploaded:
        # Save to temp
        if 'video_path' not in st.session_state or st.session_state.get('video_name') != uploaded.name:
            video_path = VideoProcessor.save_uploaded_video(uploaded)
            st.session_state['video_path'] = video_path
            st.session_state['video_name'] = uploaded.name
            meta = VideoProcessor.get_metadata(video_path)
            st.session_state['video_meta'] = meta

        video_path = st.session_state['video_path']
        meta = st.session_state['video_meta']

        st.video(uploaded)
        st.caption(f"Duration: {meta['duration']:.1f}s | FPS: {meta['fps']:.0f} | "
                   f"Resolution: {meta['width']}x{meta['height']}")

        # Trim controls
        st.markdown("**Trim to single lap**")
        duration = meta['duration']
        col1, col2 = st.columns(2)
        with col1:
            start_time = st.number_input("Lap Start (seconds)", 0.0, duration, 0.0, 0.5)
        with col2:
            end_time = st.number_input("Lap End (seconds)", 0.0, duration, min(duration, 120.0), 0.5)

        st.session_state['start_time'] = start_time
        st.session_state['end_time'] = end_time
        st.caption(f"Lap duration: {end_time - start_time:.1f}s")


# ═══════════════════════════════════════════════════════════
# STEP 4: VIDEO ANALYSIS — Forward pass + Reverse run
# ═══════════════════════════════════════════════════════════
if (st.session_state.get('video_path') and st.session_state.get('track_model')
        and not st.session_state.get('corners')):
    st.markdown("### Step 4 — Analyze Video (Forward + Reverse)")
    st.caption("Forward pass detects corners using the track model. "
               "Reverse run validates each gaze chain from exit → entry.")

    if st.button("🔍 Analyze Video", type="primary"):
        progress = st.progress(0)
        status = st.status("Uploading video to Gemini...")

        try:
            # Upload video
            video_file = api.upload_video_gemini(
                st.session_state['video_path'],
                progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
            )

            # FORWARD PASS — with track context
            status.update(label="Forward pass: detecting corners with track context...")
            forward_result = api.analyze_video_forward(
                video_file,
                start_time=st.session_state.get('start_time', 0),
                end_time=st.session_state.get('end_time'),
                track_model=st.session_state.get('track_model'),
                progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
            )

            forward_corners = forward_result.get('corners', [])

            if not forward_corners:
                st.error("No corners detected in forward pass. Try adjusting trim bounds or sensitivity.")
                st.stop()

            status.update(label=f"Forward: {len(forward_corners)} corners. Starting reverse run...")

            # REVERSE RUN — validate gaze chain exit→entry
            reverse_result = api.analyze_video_reverse(
                video_file,
                forward_corners,
                start_time=st.session_state.get('start_time', 0),
                end_time=st.session_state.get('end_time'),
                progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
            )

            corners = reverse_result.get('corners', forward_corners)
            reverse_notes = reverse_result.get('reverseRunNotes', '')

            # Merge with track model data if available
            track_model = st.session_state.get('track_model', {})
            map_corners = track_model.get('corners', [])
            if map_corners:
                corners = APIEngine.merge_corner_data(corners, map_corners)

            st.session_state['corners'] = corners
            st.session_state['track_notes'] = forward_result.get('trackNotes', '')
            st.session_state['reverse_notes'] = reverse_notes

            progress.progress(100)
            valid = sum(1 for c in corners if c.get('gazeChainValid', True))
            status.update(
                label=f"Done: {len(corners)} corners, {valid} clean gaze chains",
                state="complete"
            )

        except Exception as e:
            st.error(f"Video analysis failed: {e}")

# Display detected corners
corners = st.session_state.get('corners', [])
if corners and not st.session_state.get('blueprint'):
    st.markdown(f"**{len(corners)} corners detected and reverse-validated**")

    reverse_notes = st.session_state.get('reverse_notes', '')
    if reverse_notes:
        st.info(f"Reverse run notes: {reverse_notes}")

    for i, corner in enumerate(corners):
        name = corner.get('name', f'Corner {i+1}')
        direction = corner.get('direction', '')
        severity = corner.get('severity', '')
        chain_valid = corner.get('gazeChainValid', True)
        chain_icon = "✅" if chain_valid else "⚠️"

        with st.expander(f"{chain_icon} Corner {i+1}: {name} ({direction} {severity})"):
            markers = corner.get('markers', corner.get('cues', []))
            if isinstance(markers, dict):
                for phase in ['firstSight', 'brake', 'apex', 'exit']:
                    data = markers.get(phase, {})
                    if isinstance(data, dict) and data.get('gazeTarget'):
                        validated = "✓" if data.get('reverseValidated') else ""
                        st.markdown(
                            f"**{phase}** (t={data.get('time', '?')}s): "
                            f"{data['gazeTarget']} {validated}"
                        )
                        # Show gaze chain connectivity
                        if phase == 'brake' and 'canSeeApexFromHere' in data:
                            can_see = data['canSeeApexFromHere']
                            st.caption(f"  → Can see apex from here: {'yes' if can_see else 'NO'}")
                        elif phase == 'apex' and 'canSeeExitFromHere' in data:
                            can_see = data['canSeeExitFromHere']
                            st.caption(f"  → Can see exit from here: {'yes' if can_see else 'NO'}")

            elif isinstance(markers, list):
                for cue in markers:
                    st.markdown(f"**{cue.get('label', '')}**")
                    st.markdown(f"  Eyes: {cue.get('eyes', '')}")
                    st.markdown(f"  Aware: {cue.get('aware', '')}")

            chain_issues = corner.get('gazeChainIssues', '')
            if chain_issues and chain_issues != 'clean':
                st.warning(f"Chain issue: {chain_issues}")


# ═══════════════════════════════════════════════════════════
# STEP 5: GENERATE QE BLUEPRINT
# ═══════════════════════════════════════════════════════════
if st.session_state.get('corners') and not st.session_state.get('blueprint'):
    st.markdown("### Step 5 — Generate QE Blueprint")

    if st.button("🧠 Generate Blueprint", type="primary"):
        pipeline = BlueprintPipeline(api)
        progress = st.progress(0)
        status = st.status("Building Quiet Eye blueprint...")

        try:
            track_config = {
                'trackName': st.session_state.get('track_name', 'Unknown Track'),
                'vehicleType': st.session_state.get('vehicle_type', 'car'),
                'corners': st.session_state['corners'],
                'trackGuide': st.session_state.get('track_guide_text', ''),
                'trackNotes': st.session_state.get('track_notes', ''),
                'reverseNotes': st.session_state.get('reverse_notes', ''),
            }

            blueprint = pipeline.generate_blueprint(
                track_config,
                progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
            )

            st.session_state['blueprint'] = blueprint
            progress.progress(100)
            status.update(label="Blueprint complete!", state="complete")
            st.rerun()

        except Exception as e:
            st.error(f"Blueprint generation failed: {e}")


# ═══════════════════════════════════════════════════════════
# STEP 6: VIEW BLUEPRINT & EXPORT
# ═══════════════════════════════════════════════════════════
blueprint = st.session_state.get('blueprint')
if blueprint:
    st.markdown("### Step 6 — Your Quiet Eye Blueprint")

    st.markdown(f"**{blueprint.get('trackName', 'Unknown')}** | "
                f"{blueprint.get('vehicleType', 'car').title()} | "
                f"{blueprint.get('cornerCount', '?')} corners")

    # Display corners
    bp_corners = blueprint.get('corners', blueprint.get('sections', []))
    for i, corner in enumerate(bp_corners):
        name = corner.get('name', f'Corner {i+1}')
        is_weak = corner.get('isWeakCorner', corner.get('isWeak', False))
        weak_flag = " ⚠️ WEAK" if is_weak else ""

        with st.expander(f"Corner {i+1}: {name}{weak_flag}"):
            gaze = corner.get('gazeSequence', {})
            cues = corner.get('cues', [])

            if gaze:
                for phase, data in gaze.items():
                    if isinstance(data, dict):
                        col1, col2 = st.columns(2)
                        col1.markdown(
                            f"<span style='color:#00f0ff'>Eyes:</span> {data.get('eyes', '')}",
                            unsafe_allow_html=True
                        )
                        col2.markdown(
                            f"<span style='color:#ff9f1c'>Aware:</span> {data.get('aware', '')}",
                            unsafe_allow_html=True
                        )
            elif cues:
                for cue in cues:
                    st.markdown(f"**{cue.get('label', '')}**")
                    col1, col2 = st.columns(2)
                    col1.markdown(
                        f"<span style='color:#00f0ff'>Eyes:</span> {cue.get('eyes', '')}",
                        unsafe_allow_html=True
                    )
                    col2.markdown(
                        f"<span style='color:#ff9f1c'>Aware:</span> {cue.get('aware', '')}",
                        unsafe_allow_html=True
                    )

            qe_cue = corner.get('quietEyeCue', '')
            if qe_cue:
                st.info(f"💡 {qe_cue}")

    # Protocol summary
    protocol = blueprint.get('protocol', blueprint.get('trainingProtocol', {}))
    if protocol:
        strategy = protocol.get('overallStrategy', '')
        if strategy:
            st.markdown(f"**Strategy:** {strategy}")

    # Export buttons
    st.markdown("### Export")

    col1, col2, col3 = st.columns(3)

    with col1:
        try:
            pdf_bytes = generate_blueprint_pdf(blueprint)
            track = blueprint.get('trackName', 'blueprint').replace(' ', '_')
            st.download_button(
                "📄 Download PDF Blueprint",
                data=pdf_bytes,
                file_name=f"QE_Blueprint_{track}.pdf",
                mime="application/pdf"
            )
        except Exception as e:
            st.error(f"PDF generation failed: {e}")

    with col2:
        json_str = json.dumps(blueprint, indent=2, default=str)
        track = blueprint.get('trackName', 'blueprint').replace(' ', '_')
        st.download_button(
            "💾 Download JSON Blueprint",
            data=json_str,
            file_name=f"QE_Blueprint_{track}.json",
            mime="application/json"
        )

    with col3:
        if st.session_state.get('video_path'):
            if st.button("🎬 Build Full Protocol Video (5 laps)"):
                progress = st.progress(0)
                status = st.status("Rendering 5-lap conditioning protocol...")

                try:
                    track = blueprint.get('trackName', 'track').replace(' ', '_')
                    output = ConditioningRenderer.render_full_protocol(
                        st.session_state['video_path'],
                        blueprint,
                        progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                    )
                    st.session_state['conditioning_video'] = output
                    status.update(label="Protocol video ready!", state="complete")
                    st.rerun()
                except Exception as e:
                    st.error(f"Video rendering failed: {e}")

            if st.session_state.get('conditioning_video'):
                output = st.session_state['conditioning_video']
                st.video(output)
                track = blueprint.get('trackName', 'protocol').replace(' ', '_')
                with open(output, 'rb') as f:
                    st.download_button(
                        "⬇️ Download Protocol MP4",
                        data=f.read(),
                        file_name=f"QE_Protocol_{track}.mp4",
                        mime="video/mp4"
                    )
                st.caption("Web-ready MP4 (H.264 + AAC, faststart). "
                           "Load this on any webpage for the driver to follow the protocol.")

    # Reset button
    st.divider()
    if st.button("🔄 Start New Blueprint"):
        for key in ['blueprint', 'corners', 'track_model', 'video_path', 'video_name',
                     'video_meta', 'conditioning_video', 'reverse_notes', 'track_notes']:
            st.session_state.pop(key, None)
        st.rerun()
