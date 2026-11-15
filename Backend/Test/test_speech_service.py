import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from app.services.speech_service import (
    InvalidAudioError,
    SpeechNotRecognizedError,
    SpeechServiceUnavailableError,
    transcribe_audio,
)


class SpeechServiceTests(unittest.TestCase):
    @patch("app.services.speech_service._load_model")
    @patch("app.services.speech_service.subprocess.run")
    @patch("app.services.speech_service.imageio_ffmpeg.get_ffmpeg_exe", return_value="ffmpeg")
    def test_transcribes_audio_with_whisper_language_detection(
        self,
        _ffmpeg,
        ffmpeg_run,
        load_model,
    ):
        pcm = np.array([0, 1000, -1000], dtype="<i2").tobytes()
        ffmpeg_run.return_value = SimpleNamespace(returncode=0, stdout=pcm)
        load_model.return_value.transcribe.return_value = {"text": "  Nice to meet you.  "}

        transcript = transcribe_audio(b"webm-audio")

        self.assertEqual(transcript, "Nice to meet you.")
        ffmpeg_run.assert_called_once()
        self.assertEqual(ffmpeg_run.call_args.kwargs["input"], b"webm-audio")
        audio = load_model.return_value.transcribe.call_args.args[0]
        self.assertEqual(audio.dtype, np.float32)
        self.assertEqual(audio.shape, (3,))
        self.assertEqual(
            load_model.return_value.transcribe.call_args.kwargs,
            {"task": "transcribe", "fp16": False, "verbose": False},
        )

    @patch("app.services.speech_service.subprocess.run")
    @patch("app.services.speech_service.imageio_ffmpeg.get_ffmpeg_exe", return_value="ffmpeg")
    def test_rejects_audio_that_ffmpeg_cannot_decode(self, _ffmpeg, ffmpeg_run):
        ffmpeg_run.return_value = SimpleNamespace(returncode=1, stdout=b"")

        with self.assertRaises(InvalidAudioError):
            transcribe_audio(b"invalid")

    @patch("app.services.speech_service._load_model")
    @patch("app.services.speech_service.subprocess.run")
    @patch("app.services.speech_service.imageio_ffmpeg.get_ffmpeg_exe", return_value="ffmpeg")
    def test_reports_audio_without_recognized_speech(self, _ffmpeg, ffmpeg_run, load_model):
        ffmpeg_run.return_value = SimpleNamespace(
            returncode=0,
            stdout=np.array([0], dtype="<i2").tobytes(),
        )
        load_model.return_value.transcribe.return_value = {"text": " "}

        with self.assertRaises(SpeechNotRecognizedError):
            transcribe_audio(b"audio")

    @patch("app.services.speech_service._load_model", side_effect=RuntimeError("model failed"))
    @patch("app.services.speech_service.subprocess.run")
    @patch("app.services.speech_service.imageio_ffmpeg.get_ffmpeg_exe", return_value="ffmpeg")
    def test_reports_whisper_model_failures(self, _ffmpeg, ffmpeg_run, _load_model):
        ffmpeg_run.return_value = SimpleNamespace(
            returncode=0,
            stdout=np.array([0], dtype="<i2").tobytes(),
        )

        with self.assertRaises(SpeechServiceUnavailableError):
            transcribe_audio(b"audio")

    @patch(
        "app.services.speech_service.subprocess.run",
        side_effect=subprocess.TimeoutExpired("ffmpeg", 60),
    )
    @patch("app.services.speech_service.imageio_ffmpeg.get_ffmpeg_exe", return_value="ffmpeg")
    def test_reports_ffmpeg_timeout(self, _ffmpeg, _ffmpeg_run):
        with self.assertRaises(SpeechServiceUnavailableError):
            transcribe_audio(b"audio")


if __name__ == "__main__":
    unittest.main()
