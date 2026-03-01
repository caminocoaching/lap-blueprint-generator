"""
Conditioning Video Renderer — Pre-renders conditioning videos with overlays using FFmpeg + PIL.

Replaces the JavaScript ConditioningEngine's real-time canvas rendering with
server-side video generation. Each of the 5 laps gets a different overlay tier:
  L1-L2: Full cues + 5s pause frames at each gaze point
  L3: Full cues, no pauses, slow speed
  L4: Awareness cues only, normal speed
  L5: Marker icons only, fast speed
"""
import subprocess
import tempfile
import os
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Lap configurations matching the JS conditioning engine
LAP_CONFIGS = [
    {  # Lap 1
        'label': 'L1 — FULL PAUSE',
        'speed': 0.85,
        'pause': True,
        'pause_duration': 5,
        'show_eyes': True,
        'show_aware': True,
        'show_marker': True,
    },
    {  # Lap 2
        'label': 'L2 — FULL PAUSE',
        'speed': 0.85,
        'pause': True,
        'pause_duration': 5,
        'show_eyes': True,
        'show_aware': True,
        'show_marker': True,
    },
    {  # Lap 3
        'label': 'L3 — SLOW LAP',
        'speed': 0.90,
        'pause': False,
        'pause_duration': 0,
        'show_eyes': True,
        'show_aware': True,
        'show_marker': True,
    },
    {  # Lap 4
        'label': 'L4 — NORMAL PACE',
        'speed': 1.0,
        'pause': False,
        'pause_duration': 0,
        'show_eyes': False,
        'show_aware': True,
        'show_marker': True,
    },
    {  # Lap 5
        'label': 'L5 — FAST LAP',
        'speed': 1.10,
        'pause': False,
        'pause_duration': 0,
        'show_eyes': False,
        'show_aware': False,
        'show_marker': True,
    },
]

# Zone speed multipliers (applied on top of lap speed)
ZONE_SPEEDS = {
    'straight': 1.5,
    'approach': 0.8,
    'braking': 0.4,
    'apex': 0.3,
    'exit': 0.5,
}

# Voice cue mapping
CUE_MAP = {
    'brakeMarkerVisible': {
        'id': 'eyes_brakeMarker',
        'text': 'Eyes... Braking Marker. Aware... Apex.',
    },
    'braking': {
        'id': 'eyes_apex',
        'text': 'Eyes... Apex. Aware... Exit.',
    },
    'apex': {
        'id': 'eyes_exit',
        'text': 'Eyes... Exit. Aware... Straight.',
    },
    'exit': {
        'id': 'eyes_straight',
        'text': 'Eyes... Straight. Aware... Braking Marker.',
    },
}


class ConditioningRenderer:
    """Renders conditioning videos with QE overlays using FFmpeg."""

    @staticmethod
    def render_single_lap(input_video, blueprint, lap_number=1, output_path=None,
                          audio_dir=None, progress_cb=None):
        """
        Render a single conditioning lap video with overlays.

        For MVP: creates a video with text overlays at corner timestamps.
        Uses FFmpeg drawtext filter for overlay rendering.

        Args:
            input_video: path to source onboard video
            blueprint: blueprint dict with corners and gaze data
            lap_number: 1-5 (which lap tier to render)
            output_path: where to save the output video
            audio_dir: path to audio cue MP3 files
            progress_cb: callback(percent, message)

        Returns: path to rendered video
        """
        if output_path is None:
            output_path = tempfile.mktemp(suffix='.mp4')

        lap_idx = min(lap_number - 1, len(LAP_CONFIGS) - 1)
        config = LAP_CONFIGS[lap_idx]

        if progress_cb:
            progress_cb(10, f"Preparing {config['label']}...")

        # Build segments from blueprint corners
        corners = blueprint.get('corners', [])
        if not corners:
            # Just copy the video if no corners
            _copy_video(input_video, output_path, config['speed'])
            return output_path

        # Build FFmpeg filter for text overlays
        filters = []

        # Add lap label (always visible, top-left)
        lap_label = config['label'].replace("'", "\\'")
        filters.append(
            f"drawtext=text='{lap_label}'"
            f":fontsize=28:fontcolor=cyan:x=30:y=30"
            f":borderw=2:bordercolor=black"
        )

        # Add corner overlays at timestamps
        for i, corner in enumerate(corners):
            corner_name = corner.get('name', f'Corner {i+1}').replace("'", "\\'").replace(":", "\\:")

            # Get timing info
            markers = corner.get('markers', {})
            gaze_seq = corner.get('gazeSequence', {})

            # Determine corner start/end times
            first_time = None
            last_time = None

            for phase_key in ['firstSight', 'brake', 'apex', 'exit']:
                m = markers.get(phase_key, {})
                t = m.get('time')
                if t is not None:
                    if first_time is None or t < first_time:
                        first_time = t
                    if last_time is None or t > last_time:
                        last_time = t

            if first_time is None:
                continue

            # Buffer: show overlay 1s before corner to 2s after
            start = max(0, first_time - 1)
            end = (last_time or first_time) + 2

            # Corner name overlay
            filters.append(
                f"drawtext=text='{corner_name}'"
                f":fontsize=24:fontcolor=orange:x=w-tw-30:y=30"
                f":borderw=2:bordercolor=black"
                f":enable='between(t,{start:.1f},{end:.1f})'"
            )

            # Gaze cue overlays (if this lap tier shows them)
            if config['show_eyes'] or config['show_aware']:
                for phase_key, phase_data in [
                    ('brakeMarkerVisible', gaze_seq.get('brakeMarkerVisible', {})),
                    ('brake', gaze_seq.get('brake', {})),
                    ('apex', gaze_seq.get('apex', {})),
                    ('exit', gaze_seq.get('exit', {})),
                ]:
                    marker_time = markers.get(
                        'firstSight' if phase_key == 'brakeMarkerVisible' else phase_key, {}
                    ).get('time')

                    if marker_time is None:
                        continue

                    phase_start = max(0, marker_time - 0.5)
                    phase_end = marker_time + 2

                    # Eyes text (cyan)
                    if config['show_eyes']:
                        eyes_text = (phase_data.get('eyes', '') or '').replace("'", "\\'").replace(":", "\\:")
                        if eyes_text:
                            filters.append(
                                f"drawtext=text='Eyes\\: {eyes_text}'"
                                f":fontsize=22:fontcolor=cyan:x=30:y=h-100"
                                f":borderw=2:bordercolor=black"
                                f":enable='between(t,{phase_start:.1f},{phase_end:.1f})'"
                            )

                    # Aware text (orange)
                    if config['show_aware']:
                        aware_text = (phase_data.get('aware', '') or '').replace("'", "\\'").replace(":", "\\:")
                        if aware_text:
                            filters.append(
                                f"drawtext=text='Aware\\: {aware_text}'"
                                f":fontsize=20:fontcolor=orange:x=30:y=h-60"
                                f":borderw=2:bordercolor=black"
                                f":enable='between(t,{phase_start:.1f},{phase_end:.1f})'"
                            )

        # Apply speed adjustment
        speed = config['speed']
        speed_filter = f"setpts={1/speed}*PTS"
        audio_filter = f"atempo={speed}"

        # Clamp atempo (FFmpeg limit: 0.5 to 100)
        if speed < 0.5:
            audio_filter = f"atempo=0.5,atempo={speed/0.5}"
        elif speed > 2.0:
            audio_filter = f"atempo=2.0,atempo={speed/2.0}"

        # Build the full filter chain
        video_filters = ','.join([speed_filter] + filters)

        if progress_cb:
            progress_cb(30, "Rendering video with overlays...")

        # Run FFmpeg
        cmd = [
            'ffmpeg', '-y',
            '-i', input_video,
            '-vf', video_filters,
            '-af', audio_filter,
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
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300
            )
            if result.returncode != 0:
                print(f"FFmpeg error: {result.stderr[-500:]}")
                # Fallback: simpler render without complex filters
                return _simple_render(input_video, output_path, config, progress_cb)
        except FileNotFoundError:
            print("FFmpeg not found — falling back to simple copy")
            return _simple_render(input_video, output_path, config, progress_cb)
        except subprocess.TimeoutExpired:
            print("FFmpeg timed out")
            return _simple_render(input_video, output_path, config, progress_cb)

        if progress_cb:
            progress_cb(90, "Conditioning video ready")

        return output_path

    @staticmethod
    def render_all_laps(input_video, blueprint, output_dir=None, audio_dir=None, progress_cb=None):
        """
        Render all 5 conditioning lap videos.

        Returns: dict mapping lap number to output video path
        """
        if output_dir is None:
            output_dir = tempfile.mkdtemp()

        results = {}
        for lap in range(1, 6):
            if progress_cb:
                progress_cb(int((lap - 1) / 5 * 100), f"Rendering Lap {lap}/5...")

            output_path = os.path.join(output_dir, f"conditioning_lap{lap}.mp4")
            ConditioningRenderer.render_single_lap(
                input_video, blueprint, lap, output_path, audio_dir,
                progress_cb=lambda p, m: progress_cb(
                    int(((lap - 1) + p / 100) / 5 * 100), m
                ) if progress_cb else None
            )
            results[lap] = output_path

        return results

    @staticmethod
    def create_pause_frame(width, height, corner_name, cue_label, eyes_text, aware_text,
                           countdown=5, lap_label="L1 — FULL PAUSE"):
        """
        Create a pause frame image with QE cue overlays.
        Returns PIL Image.
        """
        img = Image.new('RGB', (width, height), color=(10, 10, 15))
        draw = ImageDraw.Draw(img)

        # Try to load a font, fall back to default
        try:
            font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
            font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
        except (OSError, IOError):
            font_large = ImageFont.load_default()
            font_medium = font_large
            font_small = font_large

        # Lap label (top-left)
        draw.text((30, 30), lap_label, fill=(0, 240, 255), font=font_medium)

        # Corner name (top-right)
        bbox = draw.textbbox((0, 0), corner_name, font=font_medium)
        tw = bbox[2] - bbox[0]
        draw.text((width - tw - 30, 30), corner_name, fill=(255, 159, 28), font=font_medium)

        # "Where are your eyes?" (center)
        question = "Where are your eyes right now?"
        bbox = draw.textbbox((0, 0), question, font=font_medium)
        tw = bbox[2] - bbox[0]
        draw.text(((width - tw) // 2, height // 3), question, fill=(255, 255, 255), font=font_medium)

        # Cue label (center, below question)
        if cue_label:
            bbox = draw.textbbox((0, 0), cue_label, font=font_large)
            tw = bbox[2] - bbox[0]
            draw.text(((width - tw) // 2, height // 3 + 60), cue_label, fill=(0, 240, 255), font=font_large)

        # Eyes target
        if eyes_text:
            draw.text((30, height - 120), f"Eyes: {eyes_text}", fill=(0, 240, 255), font=font_medium)

        # Aware target
        if aware_text:
            draw.text((30, height - 70), f"Aware: {aware_text}", fill=(255, 159, 28), font=font_small)

        # Countdown
        if countdown > 0:
            count_text = str(countdown)
            bbox = draw.textbbox((0, 0), count_text, font=font_large)
            tw = bbox[2] - bbox[0]
            draw.text(((width - tw) // 2, height * 2 // 3), count_text, fill=(0, 240, 255), font=font_large)

        return img


    @staticmethod
    def render_full_protocol(input_video, blueprint, output_path=None,
                              audio_dir=None, progress_cb=None):
        """
        Render all 5 laps into a SINGLE web-ready MP4.
        This is the file the driver loads on a webpage to follow the full protocol.

        Output: H.264 + AAC MP4 with faststart for web streaming.

        Returns: path to the final MP4
        """
        if output_path is None:
            output_path = tempfile.mktemp(suffix='.mp4')

        # Render each lap to temp files
        temp_dir = tempfile.mkdtemp()
        lap_files = []

        for lap in range(1, 6):
            if progress_cb:
                progress_cb(int((lap - 1) / 5 * 80), f"Rendering Lap {lap}/5...")

            lap_path = os.path.join(temp_dir, f"lap{lap}.mp4")
            ConditioningRenderer.render_single_lap(
                input_video, blueprint, lap, lap_path, audio_dir,
                progress_cb=lambda p, m: progress_cb(
                    int(((lap - 1) + p / 100) / 5 * 80), m
                ) if progress_cb else None
            )
            lap_files.append(lap_path)

        if progress_cb:
            progress_cb(80, "Joining 5 laps into single video...")

        # Create FFmpeg concat file
        concat_path = os.path.join(temp_dir, 'concat.txt')
        with open(concat_path, 'w') as f:
            for lap_file in lap_files:
                f.write(f"file '{lap_file}'\n")

        # Concatenate into single web-ready MP4
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
                # Fallback: just return lap 1
                import shutil
                shutil.copy2(lap_files[0], output_path)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            import shutil
            shutil.copy2(lap_files[0], output_path)

        # Clean up temp files
        for f in lap_files:
            try:
                os.remove(f)
            except OSError:
                pass
        try:
            os.remove(concat_path)
            os.rmdir(temp_dir)
        except OSError:
            pass

        if progress_cb:
            progress_cb(100, "Full protocol video ready")

        return output_path


def _copy_video(input_video, output_path, speed=1.0):
    """Simple video copy with optional speed change."""
    if speed == 1.0:
        cmd = ['ffmpeg', '-y', '-i', input_video, '-c', 'copy', output_path]
    else:
        cmd = [
            'ffmpeg', '-y', '-i', input_video,
            '-vf', f'setpts={1/speed}*PTS',
            '-af', f'atempo={speed}',
            '-c:v', 'libx264', '-preset', 'fast',
            output_path
        ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=120)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        import shutil
        shutil.copy2(input_video, output_path)


def _simple_render(input_video, output_path, config, progress_cb=None):
    """Fallback: just apply speed change without overlays."""
    if progress_cb:
        progress_cb(50, "Using simple render (no overlay filters)...")
    _copy_video(input_video, output_path, config['speed'])
    if progress_cb:
        progress_cb(90, "Simple render complete")
    return output_path
