"""
Builder — Main workflow page for creating Quiet Eye blueprints.

PIPELINE ORDER:
  Step 1: Data Collection — Track name, map, guide (understand the layout FIRST)
  Step 2: Track Analysis  — Gemini reads map, Claude reads guide → track model
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
from src.track_store import (
    save_track, merge_ai_research,
    merge_map_analysis, merge_guide_data, update_corner, add_corner, remove_corner
)
from src.conditioning_renderer import ConditioningRenderer
from src.pdf_generator import generate_blueprint_pdf

api = APIEngine(
    gemini_key=gemini_key,
    claude_key=claude_key,
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

# ═══════════════════════════════════════════════════════════
# STEP 2: TRACK ANALYSIS — Guided Two-Sweep Pipeline
#
# Same process every time:
#   2A. Upload Track Map → Run Sweep 1 (corner template)
#   2B. Review Template → Confirm or edit corners
#   2C. Upload Track Guide → Run Sweep 2 (visual references)
#   2D. Review enriched model → Confirm and proceed to video
#
# The app is always learning. Pre-built data (Ruapuna) enters
# at 2B as a pre-filled template. New data always welcome.
# ═══════════════════════════════════════════════════════════

# ── Step 2 header and progress ────────────────────────────
# Every blueprint starts from zero. Upload map → confirm → upload guide → go.
if track_name and not st.session_state.get('blueprint'):
    st.markdown("### Step 2 — Build Track Model")

    # Full reset button — clears everything and starts fresh
    reset_col1, reset_col2 = st.columns([4, 1])
    with reset_col2:
        if st.button("🔄 Reset All", help="Clear everything and start from scratch"):
            # Clean up trimmed video temp file
            trimmed = st.session_state.get('trimmed_video_path')
            if trimmed:
                VideoProcessor.cleanup_temp_file(trimmed)
            for key in ['blueprint', 'corners', 'track_model', 'video_path', 'video_name',
                         'video_meta', 'conditioning_video', 'reverse_notes', 'track_notes',
                         'trimmed_video_path', 'trimmed_meta', 'start_time', 'end_time', 'scrub_time',
                         'detected_corners', 'confirmed_markers', 'markers_confirmed',
                         'reverse_done', 'gemini_video_file', 'analysis_start', 'analysis_end',
                         'sweep1_done', 'template_confirmed', 'sweep2_done',
                         'track_map', 'track_guide', 'track_guide_text']:
                st.session_state.pop(key, None)
            st.rerun()

    sweep1_done = st.session_state.get('sweep1_done', False)
    template_confirmed = st.session_state.get('template_confirmed', False)
    sweep2_done = st.session_state.get('sweep2_done', False)

    # Progress bar
    step_col = st.columns(4)
    step_col[0].markdown(f"{'✅' if sweep1_done else '👉' if not sweep1_done else '⬜'} **2A** Map → Template")
    step_col[1].markdown(f"{'✅' if template_confirmed else '👉' if sweep1_done and not template_confirmed else '⬜'} **2B** Confirm Template")
    step_col[2].markdown(f"{'✅' if sweep2_done else '👉' if template_confirmed and not sweep2_done else '⬜'} **2C** Guide → References")
    step_col[3].markdown(f"{'✅' if sweep2_done else '⬜'} **2D** Ready for Video")

    # ═══════════════════════════════════════════════════════
    # 2A: UPLOAD MAP → RUN SWEEP 1
    # ═══════════════════════════════════════════════════════
    if not sweep1_done:
        st.markdown("#### 2A — Upload Track Map")
        st.caption("The track map gives us the corner template: how many corners, left or right, how tight.")

        track_map = st.file_uploader(
            "Upload a track map image (bird's-eye layout)",
            type=["jpg", "jpeg", "png", "webp"],
            key="track_map_upload"
        )
        if track_map:
            st.session_state['track_map'] = track_map
            st.image(track_map, caption="Track Map", use_container_width=True)

        has_map = st.session_state.get('track_map') is not None

        btn_col1, btn_col2 = st.columns(2)
        with btn_col1:
            if has_map:
                if st.button("🗺️ Run Sweep 1 — Extract Template from Map", type="primary"):
                    progress = st.progress(0)
                    status = st.status("Sweep 1: Reading track map with Gemini...")

                    try:
                        map_bytes = st.session_state['track_map'].getvalue()
                        map_b64 = base64.b64encode(map_bytes).decode()

                        template = api.extract_track_template(
                            map_b64, track_name,
                            progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                        )

                        corners = template.get('corners', [])
                        if corners:
                            track_model = {
                                'trackName': track_name,
                                'corners': corners,
                                'trackDirection': template.get('trackDirection', ''),
                                'cornerSummary': template.get('cornerSummary', ''),
                                'directionEvidence': template.get('directionEvidence', ''),
                                'layoutNotes': template.get('layoutNotes', ''),
                                'trackCharacteristics': '',
                            }
                            st.session_state['track_model'] = track_model
                            st.session_state['sweep1_done'] = True
                            n = len(corners)
                            left = sum(1 for c in corners if c.get('direction') == 'left')
                            status.update(label=f"Template: {n} corners ({left}L, {n-left}R)", state="complete")
                            progress.progress(100)
                            st.rerun()
                        else:
                            status.update(label="No corners detected — try a clearer map image", state="error")

                    except Exception as e:
                        st.error(f"Sweep 1 failed: {e}")

        with btn_col2:
            if st.button("🌐 No map — use AI Research instead"):
                progress = st.progress(0)
                status = st.status(f"Researching {track_name} online...")

                try:
                    research_result = api.research_track(
                        track_name,
                        progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                    )
                    corners = research_result.get('corners', [])
                    if corners:
                        track_model = {
                            'trackName': track_name,
                            'corners': corners,
                            'trackDirection': research_result.get('trackDirection', ''),
                            'trackCharacteristics': research_result.get('trackCharacteristics', ''),
                            'trackLength': research_result.get('trackLength', ''),
                            'country': research_result.get('country', ''),
                            'researchConfidence': research_result.get('researchConfidence', 'unknown'),
                        }
                        st.session_state['track_model'] = track_model
                        st.session_state['sweep1_done'] = True
                        n = len(corners)
                        left = sum(1 for c in corners if c.get('direction') == 'left')
                        status.update(label=f"Research: {n} corners ({left}L, {n-left}R)", state="complete")
                        progress.progress(100)
                        st.rerun()
                    else:
                        status.update(label="No corners found — try uploading a map", state="error")

                except Exception as e:
                    st.error(f"Research failed: {e}")

    # ═══════════════════════════════════════════════════════
    # 2B: REVIEW & CONFIRM TEMPLATE
    # ═══════════════════════════════════════════════════════
    elif sweep1_done and not template_confirmed:
        st.markdown("#### 2B — Review Corner Template")
        st.caption("Check the corners are right. Edit any that are wrong, then confirm.")

        track_model = st.session_state.get('track_model', {})
        corners = track_model.get('corners', [])
        n_corners = len(corners)
        left_count = sum(1 for c in corners if c.get('direction') == 'left')
        right_count = n_corners - left_count

        st.markdown(f"**{n_corners} corners detected ({left_count} left, {right_count} right)**")
        if track_model.get('trackDirection'):
            st.markdown(f"**Direction:** {track_model['trackDirection']}")
        if track_model.get('directionEvidence'):
            st.caption(f"Evidence: {track_model['directionEvidence']}")
        if track_model.get('layoutNotes'):
            st.caption(f"Layout: {track_model['layoutNotes']}")

        # Show each corner with inline edit
        for c in corners:
            c_num = c.get('number', '?')
            name = c.get('name', '') or f"Corner {c_num}"
            direction = c.get('direction', 'left')
            severity = c.get('severity', 'medium')

            with st.expander(f"Corner {c_num}: {name} ({direction} {severity})", expanded=False):
                edit_cols = st.columns(3)
                new_name = edit_cols[0].text_input("Name", value=name, key=f"t_name_{c_num}")
                new_dir = edit_cols[1].selectbox(
                    "Direction", options=['left', 'right'],
                    index=0 if direction == 'left' else 1,
                    key=f"t_dir_{c_num}"
                )
                sev_options = ['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin']
                new_sev = edit_cols[2].selectbox(
                    "Severity", options=sev_options,
                    index=sev_options.index(severity) if severity in sev_options else 2,
                    key=f"t_sev_{c_num}"
                )

                if st.button(f"Update Corner {c_num}", key=f"t_save_{c_num}"):
                    updated = update_corner(
                        st.session_state['track_model'], c_num,
                        {'name': new_name, 'direction': new_dir, 'severity': new_sev}
                    )
                    st.session_state['track_model'] = updated
                    st.rerun()

        # Add / remove controls
        add_rm_col1, add_rm_col2 = st.columns(2)
        with add_rm_col1:
            with st.expander("➕ Add a corner"):
                a_num = st.number_input("Number", min_value=1, max_value=30, value=n_corners + 1, key="ta_num")
                a_name = st.text_input("Name", key="ta_name")
                a_dir = st.selectbox("Direction", ['left', 'right'], key="ta_dir")
                a_sev = st.selectbox("Severity", ['kink', 'fast_sweeper', 'medium', 'tight', 'hairpin'], key="ta_sev")
                if st.button("Add"):
                    if a_name:
                        updated = add_corner(st.session_state['track_model'],
                                             {'number': a_num, 'name': a_name, 'direction': a_dir,
                                              'severity': a_sev, '_userEdited': True})
                        st.session_state['track_model'] = updated
                        st.rerun()
        with add_rm_col2:
            with st.expander("🗑️ Remove a corner"):
                rm_num = st.number_input("Corner number to remove", min_value=1, max_value=30, key="trm_num")
                if st.button("Remove"):
                    updated = remove_corner(st.session_state['track_model'], rm_num)
                    st.session_state['track_model'] = updated
                    st.rerun()

        st.markdown("---")
        confirm_col1, confirm_col2 = st.columns([3, 1])
        with confirm_col1:
            if st.button("✅ Template is correct — proceed to Track Guide", type="primary"):
                save_track(st.session_state['track_model'])
                st.session_state['template_confirmed'] = True
                st.rerun()
        with confirm_col2:
            if st.button("🔄 Re-run Sweep 1"):
                st.session_state['sweep1_done'] = False
                if 'track_model' in st.session_state:
                    del st.session_state['track_model']
                st.rerun()

    # ═══════════════════════════════════════════════════════
    # 2C: UPLOAD GUIDE → RUN SWEEP 2
    # ═══════════════════════════════════════════════════════
    elif template_confirmed and not sweep2_done:
        st.markdown("#### 2C — Upload Track Guide")
        st.caption("The guide fills in the detail: braking markers, apex references, racing lines. "
                   "This is what the video AI will look for.")

        # Show confirmed template summary
        track_model = st.session_state.get('track_model', {})
        corners = track_model.get('corners', [])
        n = len(corners)
        left = sum(1 for c in corners if c.get('direction') == 'left')
        existing_refs = sum(1 for c in corners if c.get('visual_targets', {}).get('braking'))

        st.info(f"Template: {n} corners ({left}L, {n-left}R) — {existing_refs} already have visual references")

        # Show existing references so user can see what's there
        if existing_refs > 0:
            with st.expander(f"Current visual references ({existing_refs}/{n} corners)", expanded=False):
                for c in corners:
                    vt = c.get('visual_targets', {})
                    if vt.get('braking'):
                        st.markdown(f"**C{c.get('number')}** {c.get('name', '')}: "
                                    f"Brake={vt.get('braking', '—')} | "
                                    f"Apex={vt.get('apex', '—')} | "
                                    f"Exit={vt.get('exit', '—')}")
                    else:
                        st.markdown(f"**C{c.get('number')}** {c.get('name', '')}: *no references yet*")
            st.caption("Upload a track guide to update or improve these references.")

        track_guide = st.file_uploader(
            "Upload a track guide (PDF, image, or text)",
            type=["pdf", "jpg", "jpeg", "png", "txt", "md"],
            key="track_guide_upload"
        )
        if track_guide:
            st.session_state['track_guide'] = track_guide
            if track_guide.type and track_guide.type.startswith('image'):
                st.image(track_guide, caption="Track Guide", use_container_width=True)
            else:
                st.success(f"Loaded: {track_guide.name}")

            # Extract text
            guide_name = track_guide.name.lower()
            if guide_name.endswith('.txt') or guide_name.endswith('.md'):
                guide_text = track_guide.getvalue().decode('utf-8', errors='ignore')
                st.session_state['track_guide_text'] = guide_text
            elif guide_name.endswith(('.jpg', '.jpeg', '.png')):
                st.session_state['track_guide_text'] = f"[Track guide image uploaded: {track_guide.name}]"
            else:
                st.session_state['track_guide_text'] = f"[Track guide uploaded: {track_guide.name}]"

        has_guide = st.session_state.get('track_guide_text', '') != ''
        has_claude = bool(st.session_state.get('claude_key', ''))

        guide_btn_col1, guide_btn_col2 = st.columns(2)
        with guide_btn_col1:
            if has_guide and has_claude:
                if st.button("📖 Run Sweep 2 — Map Guide onto Template", type="primary"):
                    progress = st.progress(0)
                    status = st.status("Sweep 2: Reading track guide...")
                    guide_text = st.session_state.get('track_guide_text', '')

                    try:
                        enriched = api.enrich_template_with_guide(
                            track_model, guide_text, track_name,
                            progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                        )

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
                                    if ec.get('hazards'):
                                        tc['hazards'] = ec['hazards']
                                    if ec.get('guideNotes'):
                                        tc['guideNotes'] = ec['guideNotes']
                                    if ec.get('elevation'):
                                        tc.setdefault('geometry', {})['elevation'] = ec['elevation']
                                    if ec.get('camber'):
                                        tc.setdefault('geometry', {})['camber'] = ec['camber']

                        if enriched.get('trackCharacteristics'):
                            track_model['trackCharacteristics'] = enriched['trackCharacteristics']

                        st.session_state['track_model'] = track_model
                        st.session_state['sweep2_done'] = True
                        save_track(track_model)

                        enriched_count = sum(1 for c in corners if c.get('visual_targets', {}).get('braking'))
                        status.update(label=f"Sweep 2 done: {enriched_count}/{n} corners enriched", state="complete")
                        progress.progress(100)
                        st.rerun()

                    except Exception as e:
                        st.error(f"Sweep 2 failed: {e}")

            elif has_guide and not has_claude:
                st.warning("Add your **Claude API key** in the sidebar for guide enrichment.")

        with guide_btn_col2:
            skip_label = "Skip — use existing references" if existing_refs > 0 else "Skip — no guide, proceed to video"
            if st.button(skip_label):
                st.session_state['sweep2_done'] = True
                save_track(st.session_state['track_model'])
                st.rerun()

    # ═══════════════════════════════════════════════════════
    # 2D: REVIEW ENRICHED MODEL
    # ═══════════════════════════════════════════════════════
    elif sweep2_done:
        st.markdown("#### 2D — Track Model Ready")

        track_model = st.session_state.get('track_model', {})
        corners = track_model.get('corners', [])
        n_corners = len(corners)
        left_count = sum(1 for c in corners if c.get('direction') == 'left')
        right_count = n_corners - left_count
        enriched_count = sum(1 for c in corners if c.get('visual_targets', {}).get('braking'))

        st.success(f"**{n_corners} corners ({left_count}L, {right_count}R) — "
                   f"{enriched_count} with visual references**")
        if track_model.get('trackCharacteristics'):
            st.caption(track_model['trackCharacteristics'])

        for c in corners:
            c_num = c.get('number', '?')
            name = c.get('name', '') or f"Corner {c_num}"
            direction = c.get('direction', '')
            severity = c.get('severity', '')
            vt = c.get('visual_targets', {})
            has_refs = bool(vt.get('braking'))

            with st.expander(f"{'✅' if has_refs else '⬜'} Corner {c_num}: {name} ({direction} {severity})"):
                if vt:
                    st.markdown(f"**Brake:** {vt.get('braking', '—')}")
                    st.markdown(f"**Apex:** {vt.get('apex', '—')}")
                    st.markdown(f"**Exit:** {vt.get('exit', '—')}")
                notes = c.get('racingLineNotes', c.get('guideNotes', c.get('notes', '')))
                if notes:
                    st.markdown(f"*{notes}*")
                if not has_refs:
                    st.caption("No visual references yet — the video AI will use generic detection for this corner.")

        st.caption("This model will be passed to the video AI so it knows what to look for at each corner.")


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
                     'reverse_done', 'gemini_video_file', 'analysis_start', 'analysis_end',
                     'sweep1_done', 'template_confirmed', 'sweep2_done',
                     'track_map', 'track_guide', 'track_guide_text']:
            st.session_state.pop(key, None)
        st.rerun()
