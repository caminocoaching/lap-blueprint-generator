"""
Conditioning Player — Play and manage conditioning videos.
Offers both single-lap rendering and full 5-lap protocol MP4 for web delivery.
"""
import streamlit as st

st.markdown("# ▶️ Conditioning Player")

blueprint = st.session_state.get('blueprint')
video_path = st.session_state.get('video_path')

if not blueprint:
    st.info("No blueprint loaded. Go to Builder or Library to create/load one.")
    st.stop()

st.markdown(f"**{blueprint.get('trackName', 'Unknown Track')}** — "
            f"{blueprint.get('cornerCount', '?')} corners")

# Show existing protocol video if already rendered
conditioning_video = st.session_state.get('conditioning_video')
if conditioning_video:
    st.markdown("### Full Protocol Video")
    st.video(conditioning_video)

    track = blueprint.get('trackName', 'protocol').replace(' ', '_')
    with open(conditioning_video, 'rb') as f:
        st.download_button(
            "⬇️ Download Protocol MP4 (web-ready)",
            data=f.read(),
            file_name=f"QE_Protocol_{track}.mp4",
            mime="video/mp4"
        )
    st.caption("H.264 + AAC MP4 with faststart — load this on any webpage for the driver.")

elif video_path:
    from src.conditioning_renderer import ConditioningRenderer

    st.markdown("### Render Options")

    render_col1, render_col2 = st.columns(2)

    with render_col1:
        st.markdown("**Full Protocol (recommended)**")
        st.caption("All 5 laps in one MP4 — ready for web delivery.")

        if st.button("🎬 Render Full 5-Lap Protocol", type="primary"):
            progress = st.progress(0)
            status = st.status("Rendering 5-lap protocol...")

            try:
                track = blueprint.get('trackName', 'protocol').replace(' ', '_')
                output = ConditioningRenderer.render_full_protocol(
                    video_path, blueprint,
                    progress_cb=lambda p, m: (progress.progress(p), status.update(label=m))
                )
                st.session_state['conditioning_video'] = output
                status.update(label="Protocol video ready!", state="complete")
                st.rerun()
            except Exception as e:
                st.error(f"Rendering failed: {e}")

    with render_col2:
        st.markdown("**Single Lap Preview**")
        st.caption("Render one lap tier to preview before building the full protocol.")

        lap_descriptions = {
            1: "L1 — FULL PAUSE (5s pauses)",
            2: "L2 — FULL PAUSE (reinforcement)",
            3: "L3 — SLOW LAP (0.9x, full cues)",
            4: "L4 — NORMAL PACE (awareness only)",
            5: "L5 — FAST LAP (markers only)",
        }

        selected_lap = st.selectbox(
            "Lap Tier",
            options=[1, 2, 3, 4, 5],
            format_func=lambda x: lap_descriptions[x],
        )

        if st.button(f"▶ Preview Lap {selected_lap}"):
            progress = st.progress(0)

            try:
                output = ConditioningRenderer.render_single_lap(
                    video_path, blueprint, selected_lap,
                    progress_cb=lambda p, m: progress.progress(p)
                )
                st.video(output)
            except Exception as e:
                st.error(f"Preview failed: {e}")

else:
    st.warning("No video uploaded. Go to Builder to upload your onboard video.")

# Protocol structure reference
st.divider()
st.markdown("### The 5-Lap Protocol")
st.markdown("""
**L1-L2 — Full Pause:** 5s pauses at each of the 4 gaze points per corner. Full Eyes + Aware cues displayed.

**L3 — Slow Lap:** Full cues, no pauses, 0.9x speed. Eyes and Aware overlays guide you through.

**L4 — Normal Pace:** 1.0x speed, Awareness cues only. Your eyes should know where to go.

**L5 — Fast Lap:** 1.1x speed, marker icons only. Trust the pattern — it's automatic now.
""")

st.markdown("### The Four Cues")
st.markdown("""
1. **Eyes Braking Marker** — Aware Apex
2. **Eyes Apex** — Aware Exit
3. **Eyes Exit** — Aware Straight
4. **Eyes Straight** — Aware Braking Marker
""")
