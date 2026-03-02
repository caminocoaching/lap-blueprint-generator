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
from src.ruapuna_blueprint import is_ruapuna, get_blueprint as get_ruapuna, get_track_model as get_ruapuna_track_model
from src.track_store import (
    has_saved_data, load_track, save_track, merge_ai_research,
    merge_map_analysis, merge_guide_data, update_corner, add_corner, remove_corner
)
from src.conditioning_renderer import ConditioningRenderer
from src.pdf_generator import generate_blueprint_pdf

api = APIEngine(
    gemini_key=gemini_key,
    claude_key=claude_key,
    openai_key=st.session_state.get('openai_key', ''),
    gemini_model=st.session_state.get('gemini_model', 'gemini-2.5-flash'),
    claude_model=st.session_state.get('claude_model', 'claude-sonnet-4-5-20250929'),
)


# ── Helper: Extract marker time/target from AI detection results ──
def _extract_time(markers, *phase_keys):
    """Extract timestamp from markers dict, trying multiple phase keys."""
    if not isinstance(markers, dict):
        return None
    for key in phase_keys:
        m = markers.get(key, {})
        if isinstance(m, dict) and m.get('time') is not None:
            try:
                return float(m['time'])
            except (ValueError, TypeError):
                pass
    return None

def _extract_target(markers, *phase_keys):
    """Extract gaze target string from markers dict."""
    if not isinstance(markers, dict):
        return ''
    for key in phase_keys:
        m = markers.get(key, {})
        if isinstance(m, dict) and m.get('gazeTarget'):
            return str(m['gazeTarget'])
    return ''


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

# ── Load existing track knowledge ─────────────────────────
# The app always learns. Check for saved data first, then pre-built, then AI.
if track_name and not st.session_state.get('track_model'):
    # Priority 1: Previously saved/edited track data (the app remembered)
    saved = load_track(track_name)
    if saved:
        st.session_state['track_model'] = saved
        n = len(saved.get('corners', []))
        st.info(f"Loaded saved track data: {n} corners (last updated: {saved.get('_lastSaved', 'unknown')[:10]})")

    # Priority 2: Pre-built verified data (Ruapuna etc.)
    elif is_ruapuna(track_name):
        prebuilt = get_ruapuna_track_model()
        st.session_state['track_model'] = prebuilt
        # Save to track store so future edits persist
        save_track(prebuilt)

if track_name and is_ruapuna(track_name) and not st.session_state.get('blueprint'):
    st.success("🎯 Ruapuna — verified track model loaded. You can edit any corner below.")
    if st.button("Load Full Ruapuna QE Blueprint", type="primary"):
        ruapuna = get_ruapuna()
        st.session_state['blueprint'] = ruapuna
        st.session_state['corners'] = ruapuna.get('sections', [])
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
# STEP 2: TRACK ANALYSIS — Two-Sweep Pipeline
#   Sweep 1: Track Map → Template (corners, directions, severity)
#   Sweep 2: Track Guide → Enrich Template (visual references, racing line)
# The app is always learning. Every sweep adds knowledge, never replaces.
# ═══════════════════════════════════════════════════════════
if track_name and not st.session_state.get('track_model'):
    st.markdown("### Step 2 — Analyze Track Layout")
    st.caption("Two sweeps: first the map gives us the corner template, then the guide fills in the detail.")

    has_map = st.session_state.get('track_map') is not None
    has_guide = st.session_state.get('track_guide_text', '') != ''
    has_openai = bool(st.session_state.get('openai_key', ''))
    has_claude = bool(st.session_state.get('claude_key', ''))

    # Source indicators
    col_status = st.columns(3)
    col_status[0].markdown(f"{'✅' if has_map and has_openai else '⬜'} Sweep 1: Track Map → Template")
    col_status[1].markdown(f"{'✅' if has_guide and has_claude else '⬜'} Sweep 2: Guide → Visual References")
    col_status[2].markdown("🌐 Web Research (fallback)")

    if not has_map:
        st.caption("Upload a track map to get the best template. "
                   "Without a map, the AI will use web research as a fallback.")

    if st.button("🗺️ Build Track Model", type="primary"):
        progress = st.progress(0)
        status = st.status("Building track model...")

        track_model = {
            'trackName': track_name,
            'corners': [],
            'trackCharacteristics': '',
            'trackDirection': '',
        }

        try:
            # ═══ SWEEP 1: Map → Template ═══════════════════════
            # The map gives us the STRUCTURE — how many corners, left/right, severity.
            # This is the skeleton everything else hangs on.

            map_data = st.session_state.get('track_map')

            if map_data and has_openai:
                # ── Primary: GPT-4o reads the map ─────────────
                status.update(label="Sweep 1: GPT-4o reading track map for corner template...")
                progress.progress(5)

                map_bytes = map_data.getvalue()
                map_b64 = base64.b64encode(map_bytes).decode()

                template = api.extract_track_template(
                    map_b64, track_name,
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )

                template_corners = template.get('corners', [])
                if template_corners:
                    track_model['corners'] = template_corners
                    track_model['trackDirection'] = template.get('trackDirection', '')
                    track_model['layoutNotes'] = template.get('layoutNotes', '')
                    n = len(template_corners)
                    left = sum(1 for c in template_corners if c.get('direction') == 'left')
                    right = n - left
                    status.update(label=f"Sweep 1: Template — {n} corners ({left}L, {right}R)")

                progress.progress(40)

            elif map_data and not has_openai:
                st.warning("Add your OpenAI API key to analyze the track map.")
                progress.progress(10)

            if not track_model['corners']:
                # ── Fallback: Web research for template ───────
                status.update(label=f"Sweep 1 fallback: Researching {track_name} online...")
                progress.progress(10)

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
                        track_model['researchConfidence'] = confidence
                        track_model['sourceNotes'] = research_result.get('sourceNotes', '')

                    status.update(label=f"Sweep 1 (research): {len(research_corners)} corners (confidence: {confidence})")
                    progress.progress(40)

                except Exception as e:
                    st.warning(f"Web research issue: {e}")
                    progress.progress(40)

            # ═══ SWEEP 2: Guide → Enrich Template ═════════════
            # The guide has the DETAIL — specific physical references the
            # driver can see. We map those onto the template from Sweep 1.

            guide_text = st.session_state.get('track_guide_text', '')

            if guide_text and not guide_text.startswith('[') and track_model['corners']:

                if has_claude:
                    # ── Primary: Claude enriches with guide ───────
                    status.update(label="Sweep 2: Mapping guide detail onto corner template...")
                    progress.progress(50)

                    try:
                        enriched = api.enrich_template_with_guide(
                            track_model, guide_text, track_name,
                            progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                        )

                        # Merge enrichment INTO existing template
                        enriched_corners = enriched.get('corners', [])
                        for ec in enriched_corners:
                            for tc in track_model['corners']:
                                if ec.get('number') == tc.get('number'):
                                    # Guide name takes priority
                                    if ec.get('name'):
                                        tc['name'] = ec['name']
                                    # Visual targets from guide
                                    if ec.get('visual_targets'):
                                        tc['visual_targets'] = ec['visual_targets']
                                    # Racing line notes
                                    if ec.get('racingLineNotes'):
                                        tc['racingLineNotes'] = ec['racingLineNotes']
                                    # Hazards
                                    if ec.get('hazards'):
                                        tc['hazards'] = ec['hazards']
                                    # Guide notes
                                    if ec.get('guideNotes'):
                                        tc['guideNotes'] = ec['guideNotes']
                                    # Track characteristics per corner
                                    if ec.get('elevation'):
                                        tc.setdefault('geometry', {})['elevation'] = ec['elevation']
                                    if ec.get('camber'):
                                        tc.setdefault('geometry', {})['camber'] = ec['camber']

                        if enriched.get('trackCharacteristics'):
                            track_model['trackCharacteristics'] = enriched['trackCharacteristics']
                        if enriched.get('trackDirection'):
                            track_model['trackDirection'] = enriched['trackDirection']

                        enriched_count = sum(1 for c in track_model['corners']
                                             if c.get('visual_targets', {}).get('braking'))
                        total = len(track_model['corners'])
                        status.update(label=f"Sweep 2: {enriched_count}/{total} corners have visual references")

                    except Exception as e:
                        st.warning(f"Guide enrichment issue: {e}. Template still valid.")

                    progress.progress(80)

                else:
                    st.warning("Add your Claude API key to enrich the template with guide data.")

            elif guide_text and not track_model['corners']:
                st.warning("Need a template first (track map or web research) before the guide can enrich it.")

            # ═══ Save ═════════════════════════════════════════
            st.session_state['track_model'] = track_model
            save_track(track_model)
            progress.progress(100)
            n_corners = len(track_model.get('corners', []))
            enriched_count = sum(1 for c in track_model.get('corners', [])
                                 if c.get('visual_targets', {}).get('braking'))
            status.update(
                label=f"Track model: {n_corners} corners, {enriched_count} with visual references — saved",
                state="complete"
            )

        except Exception as e:
            st.error(f"Track analysis failed: {e}")

# ── Display and Edit Track Model ──────────────────────────
track_model = st.session_state.get('track_model')
if track_model and track_model.get('corners') and not track_model.get('skipped'):
    n_corners = len(track_model['corners'])
    left_count = sum(1 for c in track_model['corners'] if c.get('direction') == 'left')
    right_count = n_corners - left_count
    source_tag = ""
    if track_model.get('prebuilt'):
        source_tag = " (verified)"
    elif track_model.get('_lastSaved'):
        source_tag = " (saved)"

    st.markdown(f"**Track Model: {n_corners} corners ({left_count}L, {right_count}R){source_tag}**")
    if track_model.get('trackCharacteristics'):
        st.caption(track_model['trackCharacteristics'])

    # ── Re-run sweeps to update ──────────────────────────
    sweep_col1, sweep_col2, sweep_col3 = st.columns(3)
    with sweep_col1:
        map_data = st.session_state.get('track_map')
        has_openai = bool(st.session_state.get('openai_key', ''))
        if map_data and has_openai:
            if st.button("🗺️ Re-run Sweep 1 (Map)", help="Re-read the track map to update the template"):
                with st.spinner("Re-reading track map..."):
                    try:
                        map_bytes = map_data.getvalue()
                        map_b64 = base64.b64encode(map_bytes).decode()
                        template = api.extract_track_template(map_b64, track_name)
                        # Update corner structure but keep any existing enrichments
                        new_corners = template.get('corners', [])
                        old_corners = track_model.get('corners', [])
                        # Carry over enrichments from old corners by number
                        for nc in new_corners:
                            for oc in old_corners:
                                if nc.get('number') == oc.get('number'):
                                    # Keep enrichments
                                    for key in ['visual_targets', 'racingLineNotes', 'guideNotes',
                                                'hazards', 'geometry', '_userEdited']:
                                        if oc.get(key):
                                            nc[key] = oc[key]
                                    if oc.get('name') and oc.get('_userEdited'):
                                        nc['name'] = oc['name']
                        track_model['corners'] = new_corners
                        track_model['trackDirection'] = template.get('trackDirection', track_model.get('trackDirection', ''))
                        st.session_state['track_model'] = track_model
                        save_track(track_model)
                        st.success(f"Template updated: {len(new_corners)} corners")
                        st.rerun()
                    except Exception as e:
                        st.warning(f"Map re-read issue: {e}")
    with sweep_col2:
        guide_text = st.session_state.get('track_guide_text', '')
        has_claude = bool(st.session_state.get('claude_key', ''))
        if guide_text and not guide_text.startswith('[') and has_claude:
            if st.button("📖 Re-run Sweep 2 (Guide)", help="Re-read the guide to update visual references"):
                with st.spinner("Re-reading track guide..."):
                    try:
                        enriched = api.enrich_template_with_guide(track_model, guide_text, track_name)
                        enriched_corners = enriched.get('corners', [])
                        for ec in enriched_corners:
                            for tc in track_model['corners']:
                                if ec.get('number') == tc.get('number'):
                                    if ec.get('name'):
                                        tc['name'] = ec['name']
                                    if ec.get('visual_targets'):
                                        tc['visual_targets'] = ec['visual_targets']
                                    if ec.get('racingLineNotes'):
                                        tc['racingLineNotes'] = ec['racingLineNotes']
                                    if ec.get('guideNotes'):
                                        tc['guideNotes'] = ec['guideNotes']
                        st.session_state['track_model'] = track_model
                        save_track(track_model)
                        st.success("Visual references updated from guide")
                        st.rerun()
                    except Exception as e:
                        st.warning(f"Guide enrichment issue: {e}")
    with sweep_col3:
        if st.button("🌐 Enrich with AI Research", help="Run web research and merge into existing data"):
            with st.spinner("Running AI research..."):
                try:
                    research_result = api.research_track(track_name)
                    enriched = merge_ai_research(track_model, research_result)
                    st.session_state['track_model'] = enriched
                    save_track(enriched)
                    st.success("AI research merged")
                    st.rerun()
                except Exception as e:
                    st.warning(f"AI research issue: {e}")

    # ── Editable corner list ──────────────────────────────
    for c in track_model['corners']:
        c_num = c.get('number', '?')
        name = c.get('name', f"Corner {c_num}")
        direction = c.get('direction', '')
        severity = c.get('severity', '')
        edited_tag = " ✏️" if c.get('_userEdited') else ""
        with st.expander(f"Corner {c_num}: {name} ({direction} {severity}){edited_tag}"):
            vt = c.get('visual_targets', {})
            if vt:
                st.markdown(f"**Braking target:** {vt.get('braking', '—')}")
                st.markdown(f"**Apex target:** {vt.get('apex', '—')}")
                st.markdown(f"**Exit target:** {vt.get('exit', '—')}")
            notes = c.get('notes', c.get('guideNotes', ''))
            if notes:
                st.markdown(f"*{notes}*")

            # Edit controls
            st.markdown("---")
            st.caption("Edit this corner:")
            edit_cols = st.columns(3)
            new_name = edit_cols[0].text_input("Name", value=name, key=f"edit_name_{c_num}")
            new_dir = edit_cols[1].selectbox(
                "Direction",
                options=['left', 'right'],
                index=0 if direction == 'left' else 1,
                key=f"edit_dir_{c_num}"
            )
            new_sev = edit_cols[2].selectbox(
                "Severity",
                options=['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin'],
                index=['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin'].index(severity)
                    if severity in ['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin'] else 2,
                key=f"edit_sev_{c_num}"
            )
            new_notes = st.text_area("Notes", value=notes, key=f"edit_notes_{c_num}", height=68)

            save_col, delete_col = st.columns([3, 1])
            with save_col:
                if st.button(f"Save Changes", key=f"save_corner_{c_num}"):
                    updated = update_corner(
                        st.session_state['track_model'], c_num,
                        {'name': new_name, 'direction': new_dir, 'severity': new_sev, 'notes': new_notes}
                    )
                    st.session_state['track_model'] = updated
                    save_track(updated)
                    st.success(f"Corner {c_num} updated and saved")
                    st.rerun()
            with delete_col:
                if st.button(f"🗑️ Remove", key=f"del_corner_{c_num}", type="secondary"):
                    updated = remove_corner(st.session_state['track_model'], c_num)
                    st.session_state['track_model'] = updated
                    save_track(updated)
                    st.rerun()

    # ── Add new corner ────────────────────────────────────
    with st.expander("➕ Add a new corner"):
        add_cols = st.columns(3)
        add_num = add_cols[0].number_input("Corner number", min_value=1, max_value=30, value=n_corners + 1, key="add_num")
        add_name = add_cols[1].text_input("Name", placeholder="e.g. Turn 12 – Chicane", key="add_name")
        add_dir = add_cols[2].selectbox("Direction", options=['left', 'right'], key="add_dir")
        add_cols2 = st.columns(2)
        add_sev = add_cols2[0].selectbox("Severity", options=['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin'], key="add_sev")
        add_notes = add_cols2[1].text_input("Notes", placeholder="Racing line info, landmarks...", key="add_notes")
        if st.button("Add Corner"):
            if add_name:
                new_corner = {
                    'number': add_num,
                    'name': add_name,
                    'direction': add_dir,
                    'severity': add_sev,
                    'notes': add_notes,
                    '_userEdited': True,
                }
                updated = add_corner(st.session_state['track_model'], new_corner)
                st.session_state['track_model'] = updated
                save_track(updated)
                st.success(f"Corner {add_num} added")
                st.rerun()
            else:
                st.warning("Give the corner a name")


# ═══════════════════════════════════════════════════════════
# STEP 3: UPLOAD & TRIM VIDEO
# ═══════════════════════════════════════════════════════════
if st.session_state.get('track_model') and not st.session_state.get('blueprint'):
    st.markdown("### Step 3 — Upload & Trim Onboard Video")
    st.caption("Upload your full video, then scrub through to find where the lap starts and ends.")

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
        duration = meta['duration']

        st.video(uploaded)
        st.caption(f"Duration: {meta['duration']:.1f}s | FPS: {meta['fps']:.0f} | "
                   f"Resolution: {meta['width']}x{meta['height']}")

        # ── Interactive Trim Controls ─────────────────────────
        st.markdown("---")
        st.markdown("#### Trim to Single Lap")

        import cv2

        # Show frame preview at current scrub position (above the controls)
        scrub_time = st.session_state.get('scrub_time', 0.0)
        frame = VideoProcessor.get_frame_at_time(video_path, scrub_time)
        if frame is not None:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            st.image(frame_rgb, caption=f"Frame at {scrub_time:.1f}s", use_container_width=True)

        # Scrubber slider — directly under the frame preview
        scrub_time = st.slider(
            "Scrub through video",
            min_value=0.0,
            max_value=duration,
            value=scrub_time,
            step=0.1,
            format="%.1fs",
            key="scrubber"
        )
        st.session_state['scrub_time'] = scrub_time

        # Buttons right below the scrubber
        btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 1])

        with btn_col1:
            if st.button("🟢 Set as LAP START", type="primary", use_container_width=True):
                st.session_state['start_time'] = scrub_time
                st.rerun()

        with btn_col2:
            if st.button("🔴 Set as LAP END", type="primary", use_container_width=True):
                st.session_state['end_time'] = scrub_time
                st.rerun()

        with btn_col3:
            if st.button("↩️ Reset Trim", use_container_width=True):
                st.session_state['start_time'] = 0.0
                st.session_state['end_time'] = duration
                st.rerun()

        # Show current trim points with frame previews
        start_time = st.session_state.get('start_time', 0.0)
        end_time = st.session_state.get('end_time', duration)

        # Validate
        if start_time >= end_time:
            st.error("Lap start must be before lap end. Adjust your trim points.")
        else:
            lap_dur = end_time - start_time
            st.markdown(f"**Lap: {start_time:.1f}s → {end_time:.1f}s** ({lap_dur:.1f}s)")

            # Show start and end frame previews side by side
            prev_col1, prev_col2 = st.columns(2)

            with prev_col1:
                start_frame = VideoProcessor.get_frame_at_time(video_path, start_time)
                if start_frame is not None:
                    start_rgb = cv2.cvtColor(start_frame, cv2.COLOR_BGR2RGB)
                    st.image(start_rgb, caption=f"🟢 Lap Start: {start_time:.1f}s", use_container_width=True)

            with prev_col2:
                end_frame = VideoProcessor.get_frame_at_time(video_path, end_time)
                if end_frame is not None:
                    end_rgb = cv2.cvtColor(end_frame, cv2.COLOR_BGR2RGB)
                    st.image(end_rgb, caption=f"🔴 Lap End: {end_time:.1f}s", use_container_width=True)

            # Trim & Confirm button — actually cuts the video file
            if lap_dur > 5 and not st.session_state.get('trimmed_video_path'):
                st.markdown("---")
                if st.button("✂️ Trim & Confirm Lap", type="primary", use_container_width=True):
                    with st.spinner(f"Trimming video to {lap_dur:.1f}s..."):
                        try:
                            trimmed_path = VideoProcessor.trim_video(
                                video_path, start_time, end_time
                            )
                            st.session_state['trimmed_video_path'] = trimmed_path
                            trimmed_meta = VideoProcessor.get_metadata(trimmed_path)
                            st.session_state['trimmed_meta'] = trimmed_meta
                            # Reset start/end to 0 and full duration of trimmed clip
                            st.session_state['start_time'] = 0.0
                            st.session_state['end_time'] = trimmed_meta['duration']
                            st.rerun()
                        except Exception as e:
                            st.error(f"Trim failed: {e}")

            # Show trimmed video if ready
            if st.session_state.get('trimmed_video_path'):
                trimmed_path = st.session_state['trimmed_video_path']
                trimmed_meta = st.session_state.get('trimmed_meta', {})
                st.success(
                    f"Lap video trimmed: {trimmed_meta.get('duration', 0):.1f}s "
                    f"({trimmed_meta.get('width', '?')}x{trimmed_meta.get('height', '?')})"
                )
                st.video(trimmed_path)

                # Option to re-trim
                if st.button("🔄 Re-trim (choose different start/end)"):
                    VideoProcessor.cleanup_temp_file(trimmed_path)
                    st.session_state.pop('trimmed_video_path', None)
                    st.session_state.pop('trimmed_meta', None)
                    st.rerun()


# ═══════════════════════════════════════════════════════════
# STEP 4: VIDEO ANALYSIS — AI Detection + Interactive Review
# ═══════════════════════════════════════════════════════════
# Use trimmed video if available, otherwise fall back to original
_analysis_video = st.session_state.get('trimmed_video_path', st.session_state.get('video_path'))
if (_analysis_video and st.session_state.get('track_model')
        and not st.session_state.get('corners')):

    # ── Sub-step 4A: AI Corner Detection ──────────────────
    # Only show detection button if we haven't detected yet
    if not st.session_state.get('detected_corners'):
        st.markdown("### Step 4A — AI Corner Detection")
        st.caption("The AI watches your lap video and detects the braking marker, apex, and exit "
                   "for each corner. You'll review and confirm each one next.")

        if st.button("🔍 Detect Corners", type="primary"):
            progress = st.progress(0)
            status = st.status("Uploading video to Gemini...")

            try:
                upload_path = st.session_state.get('trimmed_video_path', st.session_state['video_path'])
                video_file = api.upload_video_gemini(
                    upload_path,
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )
                st.session_state['gemini_video_file'] = video_file

                if st.session_state.get('trimmed_video_path'):
                    analysis_start = 0
                    analysis_end = st.session_state.get('trimmed_meta', {}).get('duration')
                else:
                    analysis_start = st.session_state.get('start_time', 0)
                    analysis_end = st.session_state.get('end_time')

                status.update(label="Forward pass: detecting corners with track context...")
                forward_result = api.analyze_video_forward(
                    video_file,
                    start_time=analysis_start,
                    end_time=analysis_end,
                    track_model=st.session_state.get('track_model'),
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )

                forward_corners = forward_result.get('corners', [])

                if not forward_corners:
                    st.error("No corners detected. Try adjusting trim bounds or check your video.")
                    st.stop()

                # Store detected corners for review
                st.session_state['detected_corners'] = forward_corners
                st.session_state['track_notes'] = forward_result.get('trackNotes', '')
                st.session_state['analysis_start'] = analysis_start
                st.session_state['analysis_end'] = analysis_end

                # Initialise confirmed markers dict — all start as unconfirmed
                confirmed = {}
                for i, c in enumerate(forward_corners):
                    markers = c.get('markers', {})
                    confirmed[i] = {
                        'corner_name': c.get('name', f'Corner {i+1}'),
                        'direction': c.get('direction', ''),
                        'severity': c.get('severity', ''),
                        'brake': {
                            'time': _extract_time(markers, 'brake', 'firstSight'),
                            'confirmed': False,
                            'gazeTarget': _extract_target(markers, 'brake', 'firstSight'),
                        },
                        'apex': {
                            'time': _extract_time(markers, 'apex'),
                            'confirmed': False,
                            'gazeTarget': _extract_target(markers, 'apex'),
                        },
                        'exit': {
                            'time': _extract_time(markers, 'exit'),
                            'confirmed': False,
                            'gazeTarget': _extract_target(markers, 'exit'),
                        },
                        'firstSight': {
                            'time': None,  # Will be detected in reverse pass
                            'confirmed': False,
                            'gazeTarget': '',
                        },
                    }
                st.session_state['confirmed_markers'] = confirmed

                progress.progress(100)
                n = len(forward_corners)
                status.update(label=f"Detected {n} corners — review them below", state="complete")
                st.rerun()

            except Exception as e:
                st.error(f"Video analysis failed: {e}")

    # ── Sub-step 4B: Interactive Marker Review ────────────
    if st.session_state.get('detected_corners') and not st.session_state.get('markers_confirmed'):
        st.markdown("### Step 4B — Review & Confirm Markers")
        st.caption("For each corner the AI detected, check the frame preview. "
                   "If it's right, confirm it. If it's wrong, use the slider to move the marker "
                   "to the correct spot, then confirm.")

        confirmed_markers = st.session_state.get('confirmed_markers', {})
        review_video = st.session_state.get('trimmed_video_path', st.session_state['video_path'])
        review_meta = st.session_state.get('trimmed_meta', st.session_state.get('video_meta', {}))
        review_duration = review_meta.get('duration', 60)

        total_points = 0
        total_confirmed = 0

        for corner_idx in sorted(confirmed_markers.keys(), key=int):
            cm = confirmed_markers[corner_idx]
            corner_name = cm['corner_name']
            direction = cm['direction']
            severity = cm['severity']

            # Count progress
            for phase in ['brake', 'apex', 'exit']:
                total_points += 1
                if cm[phase]['confirmed']:
                    total_confirmed += 1

            # Corner header
            all_confirmed = all(cm[p]['confirmed'] for p in ['brake', 'apex', 'exit'])
            icon = "✅" if all_confirmed else "🔍"
            with st.expander(f"{icon} Corner {int(corner_idx)+1}: {corner_name} ({direction} {severity})",
                             expanded=not all_confirmed):

                for phase in ['brake', 'apex', 'exit']:
                    phase_data = cm[phase]
                    phase_label = {'brake': 'Braking Marker', 'apex': 'Apex', 'exit': 'Exit'}[phase]
                    detected_time = phase_data.get('time')
                    is_confirmed = phase_data.get('confirmed', False)
                    gaze_target = phase_data.get('gazeTarget', '')

                    st.markdown(f"**{phase_label}** {'✅' if is_confirmed else '⏳'}")
                    if gaze_target:
                        st.caption(f"AI detected: {gaze_target}")

                    if detected_time is not None:
                        # Slider for adjusting the timestamp
                        slider_key = f"marker_{corner_idx}_{phase}"
                        adjusted_time = st.slider(
                            f"Timestamp for {phase_label}",
                            min_value=0.0,
                            max_value=review_duration,
                            value=float(detected_time),
                            step=0.1,
                            format="%.1fs",
                            key=slider_key,
                            disabled=is_confirmed,
                        )

                        # Show frame preview at this timestamp
                        frame = VideoProcessor.get_frame_at_time(review_video, adjusted_time)
                        if frame is not None:
                            import cv2
                            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            st.image(frame_rgb, caption=f"{phase_label} at {adjusted_time:.1f}s",
                                     use_container_width=True)

                        # Confirm / Re-adjust buttons
                        btn_cols = st.columns([1, 1])
                        if not is_confirmed:
                            with btn_cols[0]:
                                if st.button(f"✅ Confirm {phase_label}",
                                             key=f"confirm_{corner_idx}_{phase}",
                                             type="primary", use_container_width=True):
                                    confirmed_markers[corner_idx][phase]['time'] = adjusted_time
                                    confirmed_markers[corner_idx][phase]['confirmed'] = True
                                    st.session_state['confirmed_markers'] = confirmed_markers
                                    st.rerun()
                        else:
                            with btn_cols[0]:
                                st.success(f"Confirmed at {phase_data['time']:.1f}s")
                            with btn_cols[1]:
                                if st.button(f"↩️ Re-adjust {phase_label}",
                                             key=f"readjust_{corner_idx}_{phase}",
                                             use_container_width=True):
                                    confirmed_markers[corner_idx][phase]['confirmed'] = False
                                    st.session_state['confirmed_markers'] = confirmed_markers
                                    st.rerun()
                    else:
                        st.warning(f"AI could not detect {phase_label} for this corner. "
                                   "Use the slider to set it manually.")
                        manual_time = st.slider(
                            f"Set {phase_label} timestamp",
                            min_value=0.0,
                            max_value=review_duration,
                            value=review_duration / 2,
                            step=0.1,
                            format="%.1fs",
                            key=f"manual_{corner_idx}_{phase}",
                        )
                        frame = VideoProcessor.get_frame_at_time(review_video, manual_time)
                        if frame is not None:
                            import cv2
                            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            st.image(frame_rgb, caption=f"{phase_label} at {manual_time:.1f}s",
                                     use_container_width=True)
                        if st.button(f"✅ Set {phase_label} here",
                                     key=f"setmanual_{corner_idx}_{phase}",
                                     type="primary"):
                            confirmed_markers[corner_idx][phase]['time'] = manual_time
                            confirmed_markers[corner_idx][phase]['confirmed'] = True
                            st.session_state['confirmed_markers'] = confirmed_markers
                            st.rerun()

                    st.markdown("---")

        # Progress bar
        if total_points > 0:
            st.progress(total_confirmed / total_points,
                       text=f"{total_confirmed}/{total_points} markers confirmed")

        # All confirmed → move to reverse pass
        if total_confirmed == total_points and total_points > 0:
            st.success("All forward markers confirmed! Now running reverse validation...")
            if st.button("🔄 Run Reverse Pass (detect first-sight of braking markers)",
                         type="primary"):
                st.session_state['markers_confirmed'] = True
                st.rerun()

    # ── Sub-step 4C: Reverse Pass — First Sight Detection ─
    if st.session_state.get('markers_confirmed') and not st.session_state.get('reverse_done'):
        st.markdown("### Step 4C — Reverse Validation")
        st.caption("The AI now re-watches the video backwards from each corner's exit "
                   "to find when the braking marker FIRST becomes visible. "
                   "This completes the 4-cue chain for the Quiet Eye protocol.")

        if st.button("🔄 Run Reverse Analysis", type="primary"):
            progress = st.progress(0)
            status = st.status("Running reverse gaze chain validation...")

            try:
                # Re-upload video if needed (Gemini files expire)
                video_file = st.session_state.get('gemini_video_file')
                if video_file is None:
                    upload_path = st.session_state.get('trimmed_video_path', st.session_state['video_path'])
                    video_file = api.upload_video_gemini(
                        upload_path,
                        progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                    )

                # Build corner data from confirmed markers
                confirmed_markers = st.session_state['confirmed_markers']
                forward_corners = []
                for idx in sorted(confirmed_markers.keys(), key=int):
                    cm = confirmed_markers[idx]
                    forward_corners.append({
                        'number': int(idx) + 1,
                        'name': cm['corner_name'],
                        'direction': cm['direction'],
                        'severity': cm['severity'],
                        'markers': {
                            'brake': {
                                'time': cm['brake']['time'],
                                'gazeTarget': cm['brake'].get('gazeTarget', ''),
                            },
                            'apex': {
                                'time': cm['apex']['time'],
                                'gazeTarget': cm['apex'].get('gazeTarget', ''),
                            },
                            'exit': {
                                'time': cm['exit']['time'],
                                'gazeTarget': cm['exit'].get('gazeTarget', ''),
                            },
                        }
                    })

                status.update(label="Reverse pass: validating gaze chain exit → entry...")
                reverse_result = api.analyze_video_reverse(
                    video_file,
                    forward_corners,
                    start_time=st.session_state.get('analysis_start', 0),
                    end_time=st.session_state.get('analysis_end'),
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )

                reverse_corners = reverse_result.get('corners', forward_corners)
                reverse_notes = reverse_result.get('reverseRunNotes', '')

                # Store first-sight times from reverse pass
                for rc in reverse_corners:
                    idx = rc.get('number', 1) - 1
                    if idx in confirmed_markers:
                        fs = rc.get('markers', {}).get('firstSight', {})
                        if isinstance(fs, dict) and fs.get('time') is not None:
                            confirmed_markers[idx]['firstSight']['time'] = float(fs['time'])
                            confirmed_markers[idx]['firstSight']['gazeTarget'] = fs.get('gazeTarget', '')
                        # Also update gaze chain validation info
                        confirmed_markers[idx]['gazeChainValid'] = rc.get('gazeChainValid', True)
                        confirmed_markers[idx]['gazeChainIssues'] = rc.get('gazeChainIssues', 'clean')

                st.session_state['confirmed_markers'] = confirmed_markers
                st.session_state['reverse_notes'] = reverse_notes
                st.session_state['reverse_done'] = True

                progress.progress(100)
                status.update(label="Reverse pass complete — review first-sight markers", state="complete")
                st.rerun()

            except Exception as e:
                st.error(f"Reverse analysis failed: {e}")

    # ── Sub-step 4D: Review First-Sight + Final Confirm ───
    if st.session_state.get('reverse_done') and not st.session_state.get('corners'):
        st.markdown("### Step 4D — Review First-Sight Markers & Finalise")
        st.caption("Check when the braking marker first becomes visible for each corner. "
                   "Once confirmed, the AI memorises all markers and builds the conditioning video.")

        confirmed_markers = st.session_state.get('confirmed_markers', {})
        review_video = st.session_state.get('trimmed_video_path', st.session_state['video_path'])
        review_meta = st.session_state.get('trimmed_meta', st.session_state.get('video_meta', {}))
        review_duration = review_meta.get('duration', 60)

        reverse_notes = st.session_state.get('reverse_notes', '')
        if reverse_notes:
            st.info(f"Reverse pass notes: {reverse_notes}")

        all_fs_confirmed = True

        for corner_idx in sorted(confirmed_markers.keys(), key=int):
            cm = confirmed_markers[corner_idx]
            corner_name = cm['corner_name']
            fs = cm['firstSight']
            fs_time = fs.get('time')
            is_confirmed = fs.get('confirmed', False)
            chain_valid = cm.get('gazeChainValid', True)
            chain_icon = "✅" if chain_valid else "⚠️"

            with st.expander(
                f"{chain_icon} Corner {int(corner_idx)+1}: {corner_name} — First Sight "
                f"{'✅' if is_confirmed else '⏳'}",
                expanded=not is_confirmed
            ):
                if fs.get('gazeTarget'):
                    st.caption(f"AI detected: {fs['gazeTarget']}")

                chain_issues = cm.get('gazeChainIssues', '')
                if chain_issues and chain_issues != 'clean':
                    st.warning(f"Gaze chain issue: {chain_issues}")

                # Show confirmed brake/apex/exit for context
                st.markdown(f"Brake: **{cm['brake']['time']:.1f}s** | "
                           f"Apex: **{cm['apex']['time']:.1f}s** | "
                           f"Exit: **{cm['exit']['time']:.1f}s**")

                if fs_time is not None:
                    slider_key = f"fs_{corner_idx}"
                    adjusted_fs = st.slider(
                        "First-sight timestamp",
                        min_value=0.0,
                        max_value=review_duration,
                        value=float(fs_time),
                        step=0.1,
                        format="%.1fs",
                        key=slider_key,
                        disabled=is_confirmed,
                    )

                    frame = VideoProcessor.get_frame_at_time(review_video, adjusted_fs)
                    if frame is not None:
                        import cv2
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        st.image(frame_rgb, caption=f"First sight at {adjusted_fs:.1f}s",
                                 use_container_width=True)

                    btn_cols = st.columns([1, 1])
                    if not is_confirmed:
                        all_fs_confirmed = False
                        with btn_cols[0]:
                            if st.button(f"✅ Confirm First Sight",
                                         key=f"confirm_fs_{corner_idx}",
                                         type="primary", use_container_width=True):
                                confirmed_markers[corner_idx]['firstSight']['time'] = adjusted_fs
                                confirmed_markers[corner_idx]['firstSight']['confirmed'] = True
                                st.session_state['confirmed_markers'] = confirmed_markers
                                st.rerun()
                    else:
                        with btn_cols[0]:
                            st.success(f"Confirmed at {fs['time']:.1f}s")
                        with btn_cols[1]:
                            if st.button(f"↩️ Re-adjust",
                                         key=f"readjust_fs_{corner_idx}",
                                         use_container_width=True):
                                confirmed_markers[corner_idx]['firstSight']['confirmed'] = False
                                st.session_state['confirmed_markers'] = confirmed_markers
                                st.rerun()
                else:
                    all_fs_confirmed = False
                    st.warning("Reverse pass couldn't detect first sight. Set it manually.")
                    # Default to 3s before brake
                    default_fs = max(0, cm['brake']['time'] - 3.0)
                    manual_fs = st.slider(
                        "Set first-sight timestamp",
                        min_value=0.0,
                        max_value=review_duration,
                        value=default_fs,
                        step=0.1,
                        format="%.1fs",
                        key=f"manual_fs_{corner_idx}",
                    )
                    frame = VideoProcessor.get_frame_at_time(review_video, manual_fs)
                    if frame is not None:
                        import cv2
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        st.image(frame_rgb, caption=f"First sight at {manual_fs:.1f}s",
                                 use_container_width=True)
                    if st.button(f"✅ Set First Sight here",
                                 key=f"setmanual_fs_{corner_idx}",
                                 type="primary"):
                        confirmed_markers[corner_idx]['firstSight']['time'] = manual_fs
                        confirmed_markers[corner_idx]['firstSight']['confirmed'] = True
                        st.session_state['confirmed_markers'] = confirmed_markers
                        st.rerun()

        # All first-sight confirmed → finalise corners
        if all_fs_confirmed:
            st.success("All markers confirmed and memorised!")
            if st.button("🧠 Finalise Corners & Build Blueprint", type="primary"):
                # Convert confirmed markers into the corners format for the pipeline
                corners = []
                for idx in sorted(confirmed_markers.keys(), key=int):
                    cm = confirmed_markers[idx]

                    # Merge with track model data if available
                    track_model = st.session_state.get('track_model', {})
                    map_corners = track_model.get('corners', [])
                    extra = {}
                    if int(idx) < len(map_corners):
                        mc = map_corners[int(idx)]
                        extra = {
                            'geometry': mc.get('geometry', {}),
                            'hazards': mc.get('hazards_visible', []),
                        }

                    corners.append({
                        'number': int(idx) + 1,
                        'name': cm['corner_name'],
                        'direction': cm['direction'],
                        'severity': cm['severity'],
                        'markers': {
                            'firstSight': {
                                'time': cm['firstSight']['time'],
                                'gazeTarget': cm['firstSight'].get('gazeTarget', ''),
                                'confirmed': True,
                            },
                            'brake': {
                                'time': cm['brake']['time'],
                                'gazeTarget': cm['brake'].get('gazeTarget', ''),
                                'confirmed': True,
                            },
                            'apex': {
                                'time': cm['apex']['time'],
                                'gazeTarget': cm['apex'].get('gazeTarget', ''),
                                'confirmed': True,
                            },
                            'exit': {
                                'time': cm['exit']['time'],
                                'gazeTarget': cm['exit'].get('gazeTarget', ''),
                                'confirmed': True,
                            },
                        },
                        'gazeChainValid': cm.get('gazeChainValid', True),
                        'gazeChainIssues': cm.get('gazeChainIssues', 'clean'),
                        **extra,
                    })

                st.session_state['corners'] = corners
                st.session_state['track_notes'] = st.session_state.get('track_notes', '')
                st.rerun()

# Display confirmed corners summary (if corners are set but blueprint not yet generated)
corners = st.session_state.get('corners', [])
if corners and not st.session_state.get('blueprint'):
    st.markdown(f"**{len(corners)} corners — all markers confirmed**")

    for i, corner in enumerate(corners):
        name = corner.get('name', f'Corner {i+1}')
        direction = corner.get('direction', '')
        severity = corner.get('severity', '')
        chain_valid = corner.get('gazeChainValid', True)
        chain_icon = "✅" if chain_valid else "⚠️"

        with st.expander(f"{chain_icon} Corner {i+1}: {name} ({direction} {severity})"):
            markers = corner.get('markers', {})
            if isinstance(markers, dict):
                for phase in ['firstSight', 'brake', 'apex', 'exit']:
                    data = markers.get(phase, {})
                    if isinstance(data, dict) and data.get('time') is not None:
                        confirmed = "✅" if data.get('confirmed') else ""
                        target = data.get('gazeTarget', '')
                        st.markdown(
                            f"**{phase}** (t={data['time']:.1f}s): "
                            f"{target} {confirmed}"
                        )

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
        # Use trimmed video if available, otherwise original
        _protocol_video = st.session_state.get('trimmed_video_path', st.session_state.get('video_path'))
        if _protocol_video:
            if st.button("🎬 Build Full Protocol Video (5 laps)"):
                progress = st.progress(0)
                status = st.status("Rendering 5-lap conditioning protocol...")

                try:
                    track = blueprint.get('trackName', 'track').replace(' ', '_')
                    output = ConditioningRenderer.render_full_protocol(
                        _protocol_video,
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
        # Clean up trimmed video temp file
        trimmed = st.session_state.get('trimmed_video_path')
        if trimmed:
            VideoProcessor.cleanup_temp_file(trimmed)
        for key in ['blueprint', 'corners', 'track_model', 'video_path', 'video_name',
                     'video_meta', 'conditioning_video', 'reverse_notes', 'track_notes',
                     'trimmed_video_path', 'trimmed_meta', 'start_time', 'end_time', 'scrub_time',
                     'detected_corners', 'confirmed_markers', 'markers_confirmed',
                     'reverse_done', 'gemini_video_file', 'analysis_start', 'analysis_end']:
            st.session_state.pop(key, None)
        st.rerun()
