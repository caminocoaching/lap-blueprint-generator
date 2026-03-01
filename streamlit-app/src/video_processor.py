"""
Video Processor — OpenCV-based frame extraction and video utilities.
Provides frame extraction, thumbnails, metadata retrieval, and base64 encoding for video content.
"""

import cv2
import numpy as np
import base64
import tempfile
import os
from pathlib import Path


class VideoProcessor:
    """Handles video file operations: frame extraction, thumbnails, metadata."""

    @staticmethod
    def get_metadata(video_path):
        """
        Get video duration, fps, resolution.

        Args:
            video_path (str): Path to video file.

        Returns:
            dict: Dictionary with duration, fps, frame_count, width, height.

        Raises:
            ValueError: If video cannot be opened.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = frame_count / fps if fps > 0 else 0
        cap.release()

        return {
            'duration': duration,
            'fps': fps,
            'frame_count': frame_count,
            'width': width,
            'height': height
        }

    @staticmethod
    def extract_frames(video_path, start_sec=0, end_sec=None, sample_interval_ms=500,
                       image_size=512, quality=60, progress_cb=None):
        """
        Extract frames from video at regular intervals.

        Args:
            video_path (str): Path to video file.
            start_sec (float): Start time in seconds. Default 0.
            end_sec (float): End time in seconds. Default None (use video duration).
            sample_interval_ms (int): Interval between frames in milliseconds. Default 500.
            image_size (int): Target width for resized frames. Default 512.
            quality (int): JPEG compression quality (1-100). Default 60.
            progress_cb (callable): Optional callback function for progress updates.
                                   Called with (percentage, message).

        Returns:
            list: List of frame dicts with keys: index, time, data (base64 JPEG).
        """
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps

        if end_sec is None:
            end_sec = duration

        frames = []
        interval_sec = sample_interval_ms / 1000.0
        current_time = start_sec
        index = 0

        while current_time <= end_sec:
            frame_num = int(current_time * fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame = cap.read()

            if not ret:
                break

            # Resize maintaining aspect ratio
            h, w = frame.shape[:2]
            scale = image_size / w
            new_w = image_size
            new_h = int(h * scale)
            resized = cv2.resize(frame, (new_w, new_h))

            # Encode to JPEG base64
            _, buffer = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
            b64 = base64.b64encode(buffer).decode('utf-8')

            frames.append({
                'index': index,
                'time': current_time,
                'data': b64
            })

            if progress_cb:
                if end_sec > start_sec:
                    pct = int(((current_time - start_sec) / (end_sec - start_sec)) * 100)
                else:
                    pct = 0
                progress_cb(pct, f"Extracting frame {index + 1}...")

            current_time += interval_sec
            index += 1

        cap.release()
        return frames

    @staticmethod
    def get_frame_at_time(video_path, time_sec, width=640):
        """
        Get a single frame at a specific time.

        Args:
            video_path (str): Path to video file.
            time_sec (float): Time in seconds.
            width (int): Target width for resizing. Default 640.

        Returns:
            numpy.ndarray or None: Frame as numpy array (BGR), or None if frame cannot be extracted.
        """
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_num = int(time_sec * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        cap.release()

        if not ret:
            return None

        h, w = frame.shape[:2]
        scale = width / w
        new_h = int(h * scale)
        return cv2.resize(frame, (width, new_h))

    @staticmethod
    def get_frame_as_jpeg_b64(video_path, time_sec, width=320, quality=70):
        """
        Get a single frame as base64 JPEG string.

        Args:
            video_path (str): Path to video file.
            time_sec (float): Time in seconds.
            width (int): Target width for resizing. Default 320.
            quality (int): JPEG compression quality (1-100). Default 70.

        Returns:
            str or None: Base64-encoded JPEG string, or None if frame cannot be extracted.
        """
        frame = VideoProcessor.get_frame_at_time(video_path, time_sec, width)
        if frame is None:
            return None
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return base64.b64encode(buffer).decode('utf-8')

    @staticmethod
    def generate_thumbnails(video_path, times, width=320):
        """
        Generate thumbnail images at specified times.

        Args:
            video_path (str): Path to video file.
            times (list): List of times in seconds to extract thumbnails from.
            width (int): Target width for thumbnails. Default 320.

        Returns:
            list: List of thumbnail dicts with keys: time, image (numpy array RGB).
        """
        thumbnails = []
        for t in times:
            frame = VideoProcessor.get_frame_at_time(video_path, t, width)
            if frame is not None:
                # Convert BGR to RGB for display
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                thumbnails.append({'time': t, 'image': rgb})
        return thumbnails

    @staticmethod
    def save_uploaded_video(uploaded_file):
        """
        Save Streamlit UploadedFile to temporary path.

        Args:
            uploaded_file: Streamlit UploadedFile object.

        Returns:
            str: Path to the temporary file.
        """
        suffix = Path(uploaded_file.name).suffix or '.mp4'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(uploaded_file.getbuffer())
            return tmp.name

    @staticmethod
    def get_frame_dimensions(video_path):
        """
        Get video frame dimensions without loading full frame.

        Args:
            video_path (str): Path to video file.

        Returns:
            tuple or None: (width, height) or None if video cannot be opened.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        return (width, height)

    @staticmethod
    def extract_frame_range(video_path, start_sec, end_sec, num_frames, image_size=512, quality=60):
        """
        Extract a specific number of frames evenly distributed across a time range.

        Args:
            video_path (str): Path to video file.
            start_sec (float): Start time in seconds.
            end_sec (float): End time in seconds.
            num_frames (int): Number of frames to extract.
            image_size (int): Target width for resized frames. Default 512.
            quality (int): JPEG compression quality (1-100). Default 60.

        Returns:
            list: List of frame dicts with keys: index, time, data (base64 JPEG).
        """
        if num_frames <= 0:
            return []

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)

        frames = []
        time_step = (end_sec - start_sec) / (num_frames - 1) if num_frames > 1 else 0

        for i in range(num_frames):
            current_time = start_sec + (i * time_step)
            frame_num = int(current_time * fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame = cap.read()

            if not ret:
                continue

            # Resize maintaining aspect ratio
            h, w = frame.shape[:2]
            scale = image_size / w
            new_w = image_size
            new_h = int(h * scale)
            resized = cv2.resize(frame, (new_w, new_h))

            # Encode to JPEG base64
            _, buffer = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
            b64 = base64.b64encode(buffer).decode('utf-8')

            frames.append({
                'index': i,
                'time': current_time,
                'data': b64
            })

        cap.release()
        return frames

    @staticmethod
    def trim_video(video_path, start_sec, end_sec, output_path=None):
        """
        Trim a video file to the specified time range using FFmpeg.
        Produces a web-ready MP4 (H.264 + AAC, faststart).

        Args:
            video_path (str): Path to source video file.
            start_sec (float): Start time in seconds.
            end_sec (float): End time in seconds.
            output_path (str): Optional output path. If None, creates a temp file.

        Returns:
            str: Path to the trimmed video file.

        Raises:
            RuntimeError: If FFmpeg fails.
        """
        import subprocess

        if output_path is None:
            suffix = Path(video_path).suffix or '.mp4'
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            output_path = tmp.name
            tmp.close()

        duration = end_sec - start_sec

        cmd = [
            'ffmpeg', '-y',
            '-ss', str(start_sec),
            '-i', video_path,
            '-t', str(duration),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg trim failed: {result.stderr[-500:]}")

        return output_path

    @staticmethod
    def cleanup_temp_file(file_path):
        """
        Delete a temporary video file.

        Args:
            file_path (str): Path to file to delete.

        Returns:
            bool: True if successful, False otherwise.
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
        except Exception:
            pass
        return False
