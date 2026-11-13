import logging
import subprocess
import threading
from functools import lru_cache

import imageio_ffmpeg
import numpy as np
import whisper

logger = logging.getLogger(__name__)
_MODEL_LOCK = threading.Lock()


class InvalidAudioError(ValueError):
    """Raised when an uploaded audio file cannot be decoded."""


class SpeechNotRecognizedError(RuntimeError):
    """Raised when the model cannot find speech in the recording."""


class SpeechServiceUnavailableError(RuntimeError):
    """Raised when Whisper cannot be loaded or run."""


@lru_cache(maxsize=1)
def _load_model():
    return whisper.load_model("base")


def transcribe_audio(audio_bytes: bytes) -> str:
    try:
        decoded = subprocess.run(
            [
                imageio_ffmpeg.get_ffmpeg_exe(),
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-ac",
                "1",
                "-ar",
                "16000",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            check=False,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.exception("Could not decode audio with the bundled FFmpeg.")
        raise SpeechServiceUnavailableError from exc

    if decoded.returncode != 0 or not decoded.stdout:
        raise InvalidAudioError("Uploaded audio could not be decoded.")

    audio = np.frombuffer(decoded.stdout, dtype="<i2").astype(np.float32) / 32768.0
    try:
        with _MODEL_LOCK:
            result = _load_model().transcribe(
                audio,
                task="transcribe",
                fp16=False,
                verbose=False,
            )
    except Exception as exc:
        logger.exception("Whisper transcription failed.")
        raise SpeechServiceUnavailableError from exc

    transcript = result.get("text", "").strip()
    if not transcript:
        raise SpeechNotRecognizedError
    return transcript
