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


def _convert_audio(audio_bytes: bytes, output_format: str) -> bytes:
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
                output_format,
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
    return decoded.stdout


def convert_audio_to_wav(audio_bytes: bytes) -> bytes:
    return _convert_audio(audio_bytes, "wav")


def transcribe_audio(audio_bytes: bytes, language: str | None = None) -> str:
    pcm_audio = _convert_audio(audio_bytes, "s16le")

    audio = np.frombuffer(pcm_audio, dtype="<i2").astype(np.float32) / 32768.0
    # Không truyền language khi trống -> Whisper tự nhận diện, chép nguyên văn ngôn ngữ đang nói.
    options: dict = {"task": "transcribe", "fp16": False, "verbose": False}
    if language:
        options["language"] = language
    try:
        with _MODEL_LOCK:
            result = _load_model().transcribe(audio, **options)
    except Exception as exc:
        logger.exception("Whisper transcription failed.")
        raise SpeechServiceUnavailableError from exc

    transcript = result.get("text", "").strip()
    if not transcript:
        raise SpeechNotRecognizedError
    return transcript
