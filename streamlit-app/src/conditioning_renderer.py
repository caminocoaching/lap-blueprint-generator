"""
Conditioning Video Renderer — Builds the full Quiet Eye conditioning protocol.

5-LAP PROGRESSIVE PROTOCOL:
  L1-L2: QE LOCK-IN — Video freezes 5s at each cue point with voice + overlay.
         Driver physically practises locking eyes on each target.
  L3:    FULL FLOW  — Video plays continuously. Full "Eyes X — Aware Y" voice cues.
  L4:    AWARE ONLY — Video plays. Only "Aware X" voice cues (eyes now automatic).
  L5:    MARKERS    — Video plays. Only marker names ("Apex", "Exit" etc).

Between every lap:
  - "What would a good lap feel like?" (curiosity prompt, Craig's voice)
  - 20-second silence break for mental reset

Audio cue files (Craig's voice):
  full_eyes-braking-marker_aware-apex.mp3    → Cue 1 full
  full_eyes-apex_aware-exit.mp3              → Cue 2 full
  full_eyes-exit_aware-straight.mp3          → Cue 3 full
  full_eyes-straight_aware-braking-marker.mp3→ Cue 4 full
  aware_apex.mp3                             → Cue 1 aware-only
  aware_exit.mp3                             → Cue 2 aware-only
  aware_straight.mp3                         → Cue 3 aware-only
  aware_braking-marker.mp3                   → Cue 4 aware-only
  marker_braking-marker.mp3                  → Cue 1 marker-only
  marker_apex.mp3                            → Cue 2 marker-only
  marker_exit.mp3                            → Cue 3 marker-only
  marker_straight.mp3                        → Cue 4 marker-only
"""
import subprocess
import tempfile
import os
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


# ═══════════════════════════════════════════════════════════
# LAP CONFIGURATIONS — 5-lap progressive protocol
# ═══════════════════════════════════════════════════════════

LAP_CONFIGS = [
    {   # Lap 1 — QE Lock-In
        'label': 'L1 — QE LOCK-IN',
        'tier': 'lock_in',
        'speed': 0.85,
        'pause_duration': 5,
        'audio_tier': 'full',
    },
    {   # Lap 2 — QE Lock-In
        'label': 'L2 — QE LOCK-IN',
        'tier': 'lock_in',
        'speed': 0.85,
        'pause_duration': 5,
        'audio_tier': 'full',
    },
    {   # Lap 3 — Full Flow
        'label': 'L3 — FULL FLOW',
        'tier': 'flow',
        'speed': 0.90,
        'pause_duration': 0,
        'audio_tier': 'full',
    },
    {   # Lap 4 — Aware Only
        'label': 'L4 — AWARE ONLY',
        'tier': 'flow',
        'speed': 1.0,
        'pause_duration': 0,
        'audio_tier': 'aware',
    },
    {   # Lap 5 — Markers Only
        'label': 'L5 — MARKERS ONLY',
        'tier': 'flow',
        'speed': 1.05,
        'pause_duration': 0,
        'audio_tier': 'marker',
    },
]


# ═══════════════════════════════════════════════════════════
# AUDIO CUE MAPPING — 4 cues per corner, 3 tiers each
# ═══════════════════════════════════════════════════════════

# The 4 QE cues for each corner (in order)
CUE_SEQUENCE = [
    {
        'phase': 'brake',
        'label': 'Eyes Braking Marker — Aware Apex',
        'eyes_label': 'Eyes: Braking Marker',
        'aware_label': 'Aware: Apex',
        'marker_label': 'Braking Marker',
        'audio': {
            'full':   'full_eyes-braking-marker_aware-apex.mp3',
            'aware':  'aware_apex.mp3',
            'marker': 'marker_braking-marker.mp3',
        },
    },
    {
        'phase': 'apex',
        'label': 'Eyes Apex — Aware Exit',
        'eyes_label': 'Eyes: Apex',
        'aware_label': 'Aware: Exit',
        'marker_label': 'Apex',
        'audio': {
            'full':   'full_eyes-apex_aware-exit.mp3',
            'aware':  'aware_exit.mp3',
            'marker': 'marker_apex.mp3',
        },
    },
    {
        'phase': 'exit',
        'label': 'Eyes Exit — Aware Straight',
        'eyes_label': 'Eyes: Exit',
        'aware_label': 'Aware: Straight',
        'marker_label': 'Exit',
        'audio': {
            'full':   'full_eyes-exit_aware-straight.mp3',
            'aware':  'aware_straight.mp3',
            'marker': 'marker_exit.mp3',
        },
    },
    {
        'phase': 'straight',
        'label': 'Eyes Straight — Aware Braking Marker',
        'eyes_label': 'Eyes: Straight',
        'aware_label': 'Aware: Braking Marker',
        'marker_label': 'Straight',
        'audio': {
            'full':   'full_eyes-straight_aware-braking-marker.mp3',
            'aware':  'aware_braking-marker.mp3',
            'marker': 'marker_straight.mp3',
        },
    },
]


class ConditioningRenderer:
    """Renders conditioning videos with QE overlays using FFmpeg."""

    # ─────────────────────────────────────────────────────
    # EXTRACT CUE TIMESTAMPS from blueprint corners
    # ─────────────────────────────────────────────────────

    @staticmethod
    def _get_cue_times(blueprint):
        """
        Extract a flat list of (time, corner_name, cue_index) for every
        cue point across all corners. Sorted by time.
        """
        corners = blueprint.get('corners', blueprint.get('sections', []))
        cue_points = []

        for i, corner in enumerate(corners):
            corner_name = corner.get('name', f'Corner {i+1}')

            # Try to get timestamps from markers dict
            markers = corner.get('markers', {})
            cues = corner.get('cues', [])

            # Phase keys in order: brake, apex, exit, straight/firstSight
            phase_map = {
                0: ['firstSight', 'brake'],    # Cue 1: braking marker
                1: ['apex'],                    # Cue 2: apex
                2: ['exit'],                    # Cue 3: exit
                3: [],                          # Cue 4: straight (derived)
            }

            times = [None, None, None, None]

            if isinstance(markers, dict) and markers:
                # AI-detected corners with timestamps
                for phase_key in ['firstSight', 'brake']:
                    m = markers.get(phase_key, {})
                    t = m.get('time')
                    if t is not None:
                        times[0] = float(t)
                        break

                m = markers.get('apex', {})
                if isinstance(m, dict) and m.get('time') is not None:
                    times[1] = float(m['time'])

                m = markers.get('exit', {})
                if isinstance(m, dict) and m.get('time') is not None:
                    times[2] = float(m['time'])

                # Straight cue: 2s after exit, or interpolate
                if times[2] is not None:
                    times[3] = times[2] + 2.0

            elif cues:
                # Pre-built blueprint (Ruapuna) — no timestamps
                # Will be populated by the caller using even spacing
                pass

            # Add cue points that have timestamps
            for cue_idx in range(4):
                if times[cue_idx] is not None:
                    cue_points.append({
                        'time': times[cue_idx],
                        'corner_name': corner_name,
                        'corner_idx': i,
                        'cue_idx': cue_idx,
                    })

        cue_points.sort(key=lambda x: x['time'])
        return cue_points

    # ─────────────────────────────────────────────────────
    # LOCK-IN LAP (L1-L2): Freeze + audio at each cue
    # ─────────────────────────────────────────────────────

    @staticmethod
    def _render_lock_in_lap(input_video, blueprint, config, audio_dir,
                             output_path, progress_cb=None):
        """
        Render a QE Lock-In lap: video plays between cues, then FREEZES
        for 5 seconds at each cue point with overlay text + voice audio.
        """
        import cv2

        temp_dir = tempfile.mkdtemp()
        segments = []
        audio_tier = config['audio_tier']

        # Get video properties
        cap = cv2.VideoCapture(input_video)
        vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_dur = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        cap.release()

        vid_w = vid_w if vid_w % 2 == 0 else vid_w + 1
        vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1

        cue_points = ConditioningRenderer._get_cue_times(blueprint)

        if not cue_points:
            # No timestamps — just render with overlays
            return ConditioningRenderer._render_flow_lap(
                input_video, blueprint, config, audio_dir, output_path, progress_cb
            )

        if progress_cb:
            progress_cb(10, f"Building {config['label']}: {len(cue_points)} cue points...")

        # Build segments: video → freeze → video → freeze → ...
        current_time = 0.0
        seg_idx = 0

        for cp_idx, cp in enumerate(cue_points):
            cue_time = cp['time']
            cue_idx = cp['cue_idx']
            corner_name = cp['corner_name']
            cue_def = CUE_SEQUENCE[cue_idx]

            # 1. Video segment from current_time to cue_time
            if cue_time > current_time + 0.5:
                seg_path = os.path.join(temp_dir, f"seg_{seg_idx:03d}_video.mp4")
                dur = cue_time - current_time
                vf = f"scale={vid_w}:{vid_h},{_lap_label_filter(config['label'])}"
                cmd = [
                    'ffmpeg', '-y',
                    '-ss', f'{current_time:.2f}',
                    '-i', input_video,
                    '-t', f'{dur:.2f}',
                    '-vf', vf,
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                    '-c:a', 'aac', '-b:a', '128k',
                    '-pix_fmt', 'yuv420p',
                    seg_path
                ]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if result.returncode == 0:
                    segments.append(seg_path)
                seg_idx += 1

            # 2. Freeze frame at cue_time with overlay + audio
            pause_dur = config['pause_duration']
            freeze_path = os.path.join(temp_dir, f"seg_{seg_idx:03d}_freeze.mp4")

            # Get the audio file for this cue + tier
            audio_file = os.path.join(audio_dir, cue_def['audio'][audio_tier])

            # Build overlay text based on tier
            if audio_tier == 'full':
                overlay_lines = [
                    corner_name,
                    '',
                    cue_def['eyes_label'],
                    cue_def['aware_label'],
                ]
            elif audio_tier == 'aware':
                overlay_lines = [corner_name, '', cue_def['aware_label']]
            else:
                overlay_lines = [corner_name, '', cue_def['marker_label']]

            # Create freeze: extract frame → make 5s video + audio
            _create_freeze_segment(
                input_video, cue_time, pause_dur,
                overlay_lines, config['label'],
                audio_file, vid_w, vid_h,
                freeze_path
            )
            if os.path.exists(freeze_path):
                segments.append(freeze_path)
            seg_idx += 1

            current_time = cue_time + 0.1  # Skip just past the cue

            if progress_cb:
                pct = 10 + int((cp_idx / len(cue_points)) * 70)
                progress_cb(pct, f"Lock-in: {corner_name} — {cue_def['label']}")

        # 3. Final video segment after last cue to end
        if current_time < total_dur - 0.5:
            seg_path = os.path.join(temp_dir, f"seg_{seg_idx:03d}_video.mp4")
            vf = f"scale={vid_w}:{vid_h},{_lap_label_filter(config['label'])}"
            cmd = [
                'ffmpeg', '-y',
                '-ss', f'{current_time:.2f}',
                '-i', input_video,
                '-vf', vf,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '128k',
                '-pix_fmt', 'yuv420p',
                seg_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                segments.append(seg_path)

        # Concatenate all segments
        if progress_cb:
            progress_cb(85, "Joining lock-in segments...")

        _concat_segments(segments, output_path, temp_dir)

        # Cleanup
        for s in segments:
            try:
                os.remove(s)
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass

        if progress_cb:
            progress_cb(95, f"{config['label']} complete")

        return output_path

    # ─────────────────────────────────────────────────────
    # FLOW LAP (L3-L5): Video + audio cues, no freezes
    # ─────────────────────────────────────────────────────

    @staticmethod
    def _render_flow_lap(input_video, blueprint, config, audio_dir,
                          output_path, progress_cb=None):
        """
        Render a flowing lap: video plays continuously with text overlays
        and audio cues mixed in at cue timestamps.
        """
        import cv2

        cap = cv2.VideoCapture(input_video)
        vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        vid_w = vid_w if vid_w % 2 == 0 else vid_w + 1
        vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1

        audio_tier = config['audio_tier']
        speed = config['speed']
        cue_points = ConditioningRenderer._get_cue_times(blueprint)

        if progress_cb:
            progress_cb(10, f"Building {config['label']}...")

        # Build drawtext filters for overlays
        vfilters = [
            f"scale={vid_w}:{vid_h}",
            f"setpts={1/speed}*PTS",
            _lap_label_filter(config['label']),
        ]

        # Add cue overlays at each timestamp — black box, white text, no corner names
        for cp in cue_points:
            cue_time = cp['time']
            cue_def = CUE_SEQUENCE[cp['cue_idx']]

            # Adjust time for speed change
            display_time = cue_time / speed
            show_start = max(0, display_time - 0.3)
            show_end = display_time + 2.5

            # Build cue text based on tier
            if audio_tier == 'full':
                cue_text = f"{cue_def['eyes_label']}  |  {cue_def['aware_label']}"
            elif audio_tier == 'aware':
                cue_text = cue_def['aware_label']
            else:  # marker
                cue_text = cue_def['marker_label']

            # Black box + white text at bottom
            bar_filters = _bottom_bar_filters(
                cue_text, text_line_2=None,
                show_start=show_start, show_end=show_end
            )
            vfilters.extend(bar_filters)

        # Build audio: mix voice cues at timestamps over the video audio
        # We need to: speed-adjust original audio + overlay cue clips
        audio_inputs = []
        audio_filter_parts = []

        # Input 0 is the video (has audio)
        # We'll add cue audio files as additional inputs
        extra_inputs = []
        for cp_idx, cp in enumerate(cue_points):
            cue_def = CUE_SEQUENCE[cp['cue_idx']]
            audio_file = os.path.join(audio_dir, cue_def['audio'][audio_tier])
            if os.path.exists(audio_file):
                extra_inputs.append(audio_file)
                # Delay this audio to the cue timestamp (adjusted for speed)
                delay_ms = int((cp['time'] / speed) * 1000)
                input_idx = len(extra_inputs)  # +1 because input 0 is video
                audio_filter_parts.append(
                    f"[{input_idx}:a]adelay={delay_ms}|{delay_ms}[cue{cp_idx}]"
                )

        # Speed-adjust original video audio
        atempo = f"atempo={speed}"
        if speed < 0.5:
            atempo = f"atempo=0.5,atempo={speed/0.5}"
        elif speed > 2.0:
            atempo = f"atempo=2.0,atempo={speed/2.0}"

        if extra_inputs:
            # Mix original audio (speed-adjusted) with all cue audios
            audio_filter_parts.insert(0, f"[0:a]{atempo}[base]")
            mix_inputs = "[base]" + "".join(f"[cue{i}]" for i in range(len(extra_inputs)))
            audio_filter_parts.append(
                f"{mix_inputs}amix=inputs={1+len(extra_inputs)}"
                f":duration=first:dropout_transition=2[aout]"
            )
            audio_filter = ";".join(audio_filter_parts)
        else:
            audio_filter = f"[0:a]{atempo}[aout]"

        video_filter = ','.join(vfilters)

        if progress_cb:
            progress_cb(30, f"Rendering {config['label']} with {len(cue_points)} voice cues...")

        # Build FFmpeg command
        cmd = ['ffmpeg', '-y', '-i', input_video]
        for ef in extra_inputs:
            cmd.extend(['-i', ef])

        cmd.extend([
            '-filter_complex', f"[0:v]{video_filter}[vout];{audio_filter}",
            '-map', '[vout]', '-map', '[aout]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            output_path
        ])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                print(f"Flow render error: {result.stderr[-500:]}")
                # Fallback: render without audio mixing
                return _fallback_render(input_video, config, vfilters, output_path, progress_cb)
        except (FileNotFoundError, subprocess.TimeoutExpired) as e:
            print(f"Flow render exception: {e}")
            return _fallback_render(input_video, config, vfilters, output_path, progress_cb)

        if progress_cb:
            progress_cb(95, f"{config['label']} complete")

        return output_path

    # ─────────────────────────────────────────────────────
    # PUBLIC: Render a single lap
    # ─────────────────────────────────────────────────────

    @staticmethod
    def render_single_lap(input_video, blueprint, lap_number=1, output_path=None,
                          audio_dir=None, progress_cb=None):
        """Render a single conditioning lap (1-5)."""
        if output_path is None:
            output_path = tempfile.mktemp(suffix='.mp4')

        if audio_dir is None:
            src_dir = os.path.dirname(os.path.abspath(__file__))
            audio_dir = os.path.join(os.path.dirname(src_dir), 'data', 'audio')

        lap_idx = min(lap_number - 1, len(LAP_CONFIGS) - 1)
        config = LAP_CONFIGS[lap_idx]

        if config['tier'] == 'lock_in':
            return ConditioningRenderer._render_lock_in_lap(
                input_video, blueprint, config, audio_dir, output_path, progress_cb
            )
        else:
            return ConditioningRenderer._render_flow_lap(
                input_video, blueprint, config, audio_dir, output_path, progress_cb
            )

    # ─────────────────────────────────────────────────────
    # PUBLIC: Render all 5 laps
    # ─────────────────────────────────────────────────────

    @staticmethod
    def render_all_laps(input_video, blueprint, output_dir=None, audio_dir=None, progress_cb=None):
        """Render all 5 conditioning lap videos as separate files."""
        if output_dir is None:
            output_dir = tempfile.mkdtemp()

        results = {}
        for lap in range(1, 6):
            if progress_cb:
                progress_cb(int((lap - 1) / 5 * 100), f"Rendering Lap {lap}/5...")

            output_path = os.path.join(output_dir, f"conditioning_lap{lap}.mp4")
            ConditioningRenderer.render_single_lap(
                input_video, blueprint, lap, output_path,
                progress_cb=lambda p, m: progress_cb(
                    int(((lap - 1) + p / 100) / 5 * 100), m
                ) if progress_cb else None
            )
            results[lap] = output_path

        return results

    # ─────────────────────────────────────────────────────
    # PAUSE FRAME (used by lock-in laps)
    # ─────────────────────────────────────────────────────

    @staticmethod
    def create_pause_frame(width, height, corner_name, cue_label, eyes_text, aware_text,
                           countdown=5, lap_label="L1 — QE LOCK-IN"):
        """Create a pause frame image with QE cue overlays. Returns PIL Image."""
        img = Image.new('RGB', (width, height), color=(10, 10, 15))
        draw = ImageDraw.Draw(img)

        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
            font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        except (OSError, IOError):
            font_large = ImageFont.load_default()
            font_medium = font_large
            font_small = font_large

        draw.text((30, 30), lap_label, fill=(0, 240, 255), font=font_medium)

        bbox = draw.textbbox((0, 0), corner_name, font=font_medium)
        tw = bbox[2] - bbox[0]
        draw.text((width - tw - 30, 30), corner_name, fill=(255, 159, 28), font=font_medium)

        question = "Lock your eyes on the target"
        bbox = draw.textbbox((0, 0), question, font=font_medium)
        tw = bbox[2] - bbox[0]
        draw.text(((width - tw) // 2, height // 3), question, fill=(255, 255, 255), font=font_medium)

        if cue_label:
            bbox = draw.textbbox((0, 0), cue_label, font=font_large)
            tw = bbox[2] - bbox[0]
            draw.text(((width - tw) // 2, height // 3 + 60), cue_label, fill=(0, 240, 255), font=font_large)

        if eyes_text:
            draw.text((30, height - 120), f"Eyes: {eyes_text}", fill=(0, 240, 255), font=font_medium)

        if aware_text:
            draw.text((30, height - 70), f"Aware: {aware_text}", fill=(255, 159, 28), font=font_small)

        if countdown > 0:
            count_text = str(countdown)
            bbox = draw.textbbox((0, 0), count_text, font=font_large)
            tw = bbox[2] - bbox[0]
            draw.text(((width - tw) // 2, height * 2 // 3), count_text, fill=(0, 240, 255), font=font_large)

        return img

    # ─────────────────────────────────────────────────────
    # INTERSTITIAL (break/curiosity cards between laps)
    # ─────────────────────────────────────────────────────

    @staticmethod
    def _create_interstitial(audio_path, duration, text_lines, temp_dir,
                              width=1280, height=720, name="interstitial"):
        """Create a short video clip with text on black background + audio."""
        output = os.path.join(temp_dir, f"{name}.mp4")

        filters = []
        total_lines = len(text_lines)
        line_height = 50
        start_y = (height - total_lines * line_height) // 2

        for i, line in enumerate(text_lines):
            safe_text = line.replace("'", "\\'").replace(":", "\\:")
            y_pos = start_y + i * line_height
            filters.append(
                f"drawtext=text='{safe_text}'"
                f":fontsize=36:fontcolor=white"
                f":x=(w-tw)/2:y={y_pos}"
                f":borderw=2:bordercolor=black"
            )

        vf = ','.join(filters) if filters else 'null'

        if audio_path and os.path.exists(audio_path):
            cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', f'color=c=black:s={width}x{height}:d={duration}:r=25',
                '-i', audio_path,
                '-vf', vf,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '128k',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-t', str(duration),
                output
            ]
        else:
            cmd = [
                'ffmpeg', '-y',
                '-f', 'lavfi', '-i', f'color=c=black:s={width}x{height}:d={duration}:r=25',
                '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo',
                '-vf', vf,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '128k',
                '-pix_fmt', 'yuv420p',
                '-t', str(duration),
                output
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"Interstitial error: {result.stderr[-300:]}")
            return None

        return output

    # ─────────────────────────────────────────────────────
    # FULL PROTOCOL: All 5 laps + interstitials
    # ─────────────────────────────────────────────────────

    @staticmethod
    def render_full_protocol(input_video, blueprint, output_path=None,
                              audio_dir=None, progress_cb=None):
        """
        Render the full 5-lap Quiet Eye conditioning protocol:

        For each lap:
          1. "What would a good lap feel like?" (curiosity prompt)
          2. Lap video with appropriate tier rendering
          3. "Take a break" + 20s silence (reset) — except after L5

        Returns: path to single web-ready MP4
        """
        if output_path is None:
            output_path = tempfile.mktemp(suffix='.mp4')

        if audio_dir is None:
            src_dir = os.path.dirname(os.path.abspath(__file__))
            audio_dir = os.path.join(os.path.dirname(src_dir), 'data', 'audio')

        curiosity_audio = os.path.join(audio_dir, 'what_would_a_good_lap_feel_like.mp3')
        break_audio = os.path.join(audio_dir, 'take_a_break_20s.mp3')

        # Get video dimensions
        import cv2
        cap = cv2.VideoCapture(input_video)
        vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        vid_w = vid_w if vid_w % 2 == 0 else vid_w + 1
        vid_h = vid_h if vid_h % 2 == 0 else vid_h + 1

        temp_dir = tempfile.mkdtemp()
        all_segments = []

        for lap in range(1, 6):
            if progress_cb:
                progress_cb(int((lap - 1) / 5 * 70), f"Rendering Lap {lap}/5...")

            lap_config = LAP_CONFIGS[lap - 1]

            # ── PRE-LAP: "What would a good lap feel like?" ──
            curiosity_clip = ConditioningRenderer._create_interstitial(
                audio_path=curiosity_audio,
                duration=5,
                text_lines=[
                    "What would a good lap feel like?",
                    "",
                    f"Lap {lap} — {lap_config['label']}"
                ],
                temp_dir=temp_dir,
                width=vid_w, height=vid_h,
                name=f"curiosity_lap{lap}"
            )
            if curiosity_clip:
                all_segments.append(curiosity_clip)

            # ── LAP VIDEO ──
            lap_path = os.path.join(temp_dir, f"lap{lap}.mp4")
            ConditioningRenderer.render_single_lap(
                input_video, blueprint, lap, lap_path, audio_dir,
                progress_cb=lambda p, m: progress_cb(
                    int(((lap - 1) + p / 100) / 5 * 70), m
                ) if progress_cb else None
            )
            all_segments.append(lap_path)

            # ── POST-LAP: 20-second break (not after last lap) ──
            if lap < 5:
                break_clip = ConditioningRenderer._create_interstitial(
                    audio_path=break_audio,
                    duration=20,
                    text_lines=[
                        "Take a break",
                        "",
                        "Reset. Breathe.",
                        "",
                        f"Next: Lap {lap + 1} — {LAP_CONFIGS[lap]['label']}"
                    ],
                    temp_dir=temp_dir,
                    width=vid_w, height=vid_h,
                    name=f"break_lap{lap}"
                )
                if break_clip:
                    all_segments.append(break_clip)

        if progress_cb:
            progress_cb(75, "Joining all segments into single video...")

        _concat_segments(all_segments, output_path, temp_dir)

        # Cleanup
        for f in all_segments:
            try:
                os.remove(f)
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass

        if progress_cb:
            progress_cb(100, "Full protocol video ready")

        return output_path


# ═══════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════

def _safe(text):
    """Escape text for FFmpeg drawtext filter."""
    return text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")


# ── BLACK BOX OVERLAY STYLE ──────────────────────────────
# All cue overlays use: semi-transparent black bar at bottom,
# thick white text, doesn't obscure the track view.
#
# Box height: 80px for single line, 120px for two lines
# Font: bold, 32-36px for cues, 24px for lap label

def _bottom_bar_filters(text_line_1, text_line_2=None, bar_height=None,
                         show_start=None, show_end=None):
    """
    Build FFmpeg drawtext filters for a black box at the bottom of the screen
    with thick white text. Returns a list of filter strings.

    Args:
        text_line_1: main cue text (e.g. "Eyes Braking Marker — Aware Apex")
        text_line_2: optional second line (e.g. corner name)
        bar_height: override bar height (default: 80 or 120 if two lines)
        show_start/show_end: if set, add enable='between(t,start,end)'
    """
    filters = []
    h = bar_height or (120 if text_line_2 else 80)

    enable = ""
    if show_start is not None and show_end is not None:
        enable = f":enable='between(t,{show_start:.1f},{show_end:.1f})'"

    # Semi-transparent black box at bottom
    filters.append(
        f"drawbox=x=0:y=ih-{h}:w=iw:h={h}"
        f":color=black@0.75:t=fill"
        f"{enable}"
    )

    if text_line_2:
        # Line 2 (smaller, corner name) — above main cue
        filters.append(
            f"drawtext=text='{_safe(text_line_2)}'"
            f":fontsize=24:fontcolor=white@0.8"
            f":x=(w-tw)/2:y=h-{h-10}"
            f":borderw=1:bordercolor=black"
            f"{enable}"
        )
        # Line 1 (main cue) — large bold white
        filters.append(
            f"drawtext=text='{_safe(text_line_1)}'"
            f":fontsize=36:fontcolor=white"
            f":x=(w-tw)/2:y=h-{h-45}"
            f":borderw=2:bordercolor=black"
            f"{enable}"
        )
    else:
        # Single line — centered in the bar
        filters.append(
            f"drawtext=text='{_safe(text_line_1)}'"
            f":fontsize=36:fontcolor=white"
            f":x=(w-tw)/2:y=h-{h-22}"
            f":borderw=2:bordercolor=black"
            f"{enable}"
        )

    return filters


def _lap_label_filter(label):
    """Small lap label top-left (always visible, doesn't need the black box)."""
    return (
        f"drawtext=text='{_safe(label)}'"
        f":fontsize=22:fontcolor=white@0.7"
        f":x=20:y=20"
        f":borderw=1:bordercolor=black"
    )


def _create_freeze_segment(input_video, freeze_time, duration,
                            text_lines, lap_label, audio_path,
                            width, height, output_path):
    """
    Create a freeze-frame segment: extract one frame from the video,
    hold it for `duration` seconds, overlay black box + white cue text + audio.
    """
    temp_dir = os.path.dirname(output_path)
    frame_path = os.path.join(temp_dir, f"frame_{freeze_time:.2f}.jpg")

    # Extract the frame
    cmd_frame = [
        'ffmpeg', '-y',
        '-ss', f'{freeze_time:.2f}',
        '-i', input_video,
        '-frames:v', '1',
        '-q:v', '2',
        frame_path
    ]
    subprocess.run(cmd_frame, capture_output=True, timeout=30)

    if not os.path.exists(frame_path):
        return None

    # Build overlay: black box at bottom with cue text (no corner name)
    filters = [f"scale={width}:{height}"]

    # Lap label (small, top-left)
    filters.append(_lap_label_filter(lap_label))

    # Get the cue text from text_lines — skip corner name (first line) and empties
    cue_lines = [l for l in text_lines if l and l != text_lines[0]]
    if cue_lines:
        cue_text = '  |  '.join(cue_lines)
    else:
        cue_text = ' | '.join(l for l in text_lines if l)

    # Black box + white text at bottom
    bar_filters = _bottom_bar_filters(cue_text)
    filters.extend(bar_filters)

    vf = ','.join(filters)

    # Build FFmpeg: loop the frame for `duration` seconds + audio
    if audio_path and os.path.exists(audio_path):
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', frame_path,
            '-i', audio_path,
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-t', str(duration),
            output_path
        ]
    else:
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', frame_path,
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            '-vf', vf,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-t', str(duration),
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    # Cleanup frame
    try:
        os.remove(frame_path)
    except OSError:
        pass

    if result.returncode != 0:
        print(f"Freeze error: {result.stderr[-300:]}")
        return None

    return output_path


def _concat_segments(segments, output_path, temp_dir):
    """Concatenate multiple video segments into one MP4."""
    concat_path = os.path.join(temp_dir, 'concat.txt')
    with open(concat_path, 'w') as f:
        for seg in segments:
            f.write(f"file '{seg}'\n")

    cmd = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', concat_path,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        output_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"Concat error: {result.stderr[-500:]}")
            # Fallback: copy first real segment
            import shutil
            for s in segments:
                if os.path.exists(s):
                    shutil.copy2(s, output_path)
                    break
    except (FileNotFoundError, subprocess.TimeoutExpired):
        import shutil
        for s in segments:
            if os.path.exists(s):
                shutil.copy2(s, output_path)
                break

    try:
        os.remove(concat_path)
    except OSError:
        pass


def _fallback_render(input_video, config, vfilters, output_path, progress_cb=None):
    """Fallback: render with overlays but without audio mixing."""
    if progress_cb:
        progress_cb(50, "Fallback render (overlays only, no audio cues)...")

    speed = config['speed']
    video_filter = ','.join(vfilters)

    atempo = f"atempo={speed}"
    if speed < 0.5:
        atempo = f"atempo=0.5,atempo={speed/0.5}"
    elif speed > 2.0:
        atempo = f"atempo=2.0,atempo={speed/2.0}"

    cmd = [
        'ffmpeg', '-y',
        '-i', input_video,
        '-vf', video_filter,
        '-af', atempo,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        output_path
    ]

    try:
        subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        import shutil
        shutil.copy2(input_video, output_path)

    if progress_cb:
        progress_cb(95, "Fallback render complete")

    return output_path
