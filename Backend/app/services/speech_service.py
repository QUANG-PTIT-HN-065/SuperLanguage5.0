import logging
import subprocess
import threading
from functools import lru_cache

import httpx

from app.core.config import settings

try:
    import imageio_ffmpeg  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - not installed on Render lightweight image
    imageio_ffmpeg = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
_MODEL_LOCK = threading.Lock()
_GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


class InvalidAudioError(ValueError):
    """Raised when an uploaded audio file cannot be decoded."""


class SpeechNotRecognizedError(RuntimeError):
    """Raised when the model cannot find speech in the recording."""


class SpeechServiceUnavailableError(RuntimeError):
    """Raised when speech recognition cannot be loaded or run."""


def is_local_whisper_available() -> bool:
    try:
        import whisper  # noqa: F401
        return True
    except ImportError:
        return False


def is_whisper_loaded() -> bool:
    return _load_model.cache_info().currsize > 0


@lru_cache(maxsize=1)
def _load_model():
    try:
        import whisper  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SpeechServiceUnavailableError(
            "Local Whisper is not installed in this environment."
        ) from exc
    return whisper.load_model("base")


def preload_local_model() -> bool:
    """Eagerly load local Whisper model (used by local_worker.py)."""
    try:
        with _MODEL_LOCK:
            _load_model()
        return True
    except Exception as exc:
        logger.warning("Could not preload local Whisper model: %s", exc)
        return False


def _convert_audio(audio_bytes: bytes, output_format: str) -> bytes:
    if imageio_ffmpeg is None:
        raise SpeechServiceUnavailableError(
            "imageio_ffmpeg is not installed in this environment."
        )
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
    """Transcribe audio using local Whisper model (for Windows 11 local worker)."""
    try:
        import numpy as np  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SpeechServiceUnavailableError(
            "numpy is not installed in this environment."
        ) from exc

    pcm_audio = _convert_audio(audio_bytes, "s16le")

    audio = np.frombuffer(pcm_audio, dtype="<i2").astype(np.float32) / 32768.0
    try:
        with _MODEL_LOCK:
            result = _load_model().transcribe(
                audio,
                task="transcribe",
                language=language,
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


def _groq_keys() -> list[str]:
    raw = ",".join(
        part for part in (settings.GROQ_API_KEYS, settings.GROQ_API_KEY) if part
    )
    return list(dict.fromkeys(k.strip() for k in raw.split(",") if k.strip()))


def _gemini_keys() -> list[str]:
    raw = ",".join(
        part for part in (settings.GEMINI_API_KEYS, settings.GEMINI_API_KEY) if part
    )
    return list(dict.fromkeys(k.strip() for k in raw.split(",") if k.strip()))


async def _transcribe_with_groq(
    audio_bytes: bytes,
    language: str | None,
    filename: str,
    content_type: str,
) -> str | None:
    keys = _groq_keys()
    if not keys:
        return None

    model = (settings.GROQ_WHISPER_MODEL or "").strip() or "whisper-large-v3-turbo"
    form_data: dict[str, str] = {
        "model": model,
        "response_format": "json",
    }
    if language:
        form_data["language"] = language

    for key_idx, key in enumerate(keys, start=1):
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=45.0) as client:
                response = await client.post(
                    _GROQ_TRANSCRIPTION_URL,
                    headers={"Authorization": f"Bearer {key}"},
                    data=form_data,
                    files={"file": (filename, audio_bytes, content_type)},
                )
            if response.status_code == 400:
                logger.warning("Groq Whisper rejected audio (HTTP 400): %s", response.text[:200])
                raise InvalidAudioError("Uploaded audio could not be decoded by Groq.")
            if response.status_code in {401, 403, 429}:
                logger.warning(
                    "Groq Whisper key %d/%d rejected or rate-limited (HTTP %d).",
                    key_idx,
                    len(keys),
                    response.status_code,
                )
                continue
            response.raise_for_status()
            payload = response.json()
            text = str(payload.get("text") or "").strip()
            if not text:
                raise SpeechNotRecognizedError
            return text
        except (InvalidAudioError, SpeechNotRecognizedError):
            raise
        except httpx.HTTPError as exc:
            logger.warning("Groq Whisper request failed (%s).", type(exc).__name__)
            continue
    return None


async def _transcribe_with_gemini(
    audio_bytes: bytes,
    language: str | None,
    content_type: str,
) -> str | None:
    keys = _gemini_keys()
    if not keys:
        return None

    from google import genai
    from google.genai import types

    model = (settings.GEMINI_CHAT_MODEL or "").strip() or "gemini-3.5-flash-lite"
    lang_hint = f" The spoken language is '{language}'." if language else ""
    instruction = (
        "Transcribe the user's speech in the audio verbatim."
        f"{lang_hint} Output ONLY the exact transcribed text with no commentary, "
        "quotes, or markdown. If no intelligible speech is present, output EMPTY."
    )

    for key_idx, key in enumerate(keys, start=1):
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part.from_text(text=instruction),
                            types.Part.from_bytes(
                                data=audio_bytes,
                                mime_type=content_type or "audio/webm",
                            ),
                        ],
                    )
                ],
            )
            text = (response.text or "").strip() if response else ""
            if not text or text.upper() == "EMPTY":
                raise SpeechNotRecognizedError
            return text
        except SpeechNotRecognizedError:
            raise
        except Exception as exc:
            logger.warning(
                "Gemini audio transcription failed (key_slot=%d, error=%s).",
                key_idx,
                type(exc).__name__,
            )
            continue
    return None


async def transcribe_audio_cloud(
    audio_bytes: bytes,
    language: str | None = None,
    filename: str = "voice.webm",
    content_type: str = "audio/webm",
) -> str:
    """Cloud API fallback (Groq whisper-large-v3-turbo -> Gemini Audio) for Render 512MB RAM."""
    text = await _transcribe_with_groq(audio_bytes, language, filename, content_type)
    if text is not None:
        return text

    text = await _transcribe_with_gemini(audio_bytes, language, content_type)
    if text is not None:
        return text

    raise SpeechServiceUnavailableError(
        "No cloud speech recognition provider (GROQ_API_KEY / GEMINI_API_KEYS) succeeded."
    )
