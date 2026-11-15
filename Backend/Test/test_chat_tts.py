import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from app.api.endpoints.chat_ai import synthesize_chat_audio
from app.schemas.chat_ai import TTSRequest


class ChatTtsEndpointTests(unittest.IsolatedAsyncioTestCase):
    @patch("app.api.endpoints.chat_ai.httpx.AsyncClient")
    @patch("app.api.endpoints.chat_ai.settings")
    async def test_proxies_audio_using_the_language_voice_and_server_key(
        self,
        settings,
        async_client,
    ):
        settings.EDGE_TTS_BASE_URL = "http://tts.local/"
        settings.EDGE_TTS_API_KEY = "service-secret"
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.__aexit__.return_value = False
        client.post.return_value = httpx.Response(
            200,
            content=b"mp3-audio",
            headers={"content-type": "audio/mpeg"},
            request=httpx.Request("POST", "http://tts.local/v1/audio/speech"),
        )
        async_client.return_value = client

        response = await synthesize_chat_audio(
            TTSRequest(text="  Hello there!  ", language="English"),
            {"id": "learner-id"},
        )

        self.assertEqual(response.body, b"mp3-audio")
        self.assertEqual(response.media_type, "audio/mpeg")
        client.post.assert_awaited_once_with(
            "http://tts.local/v1/audio/speech",
            headers={
                "Accept": "audio/mpeg",
                "Authorization": "Bearer service-secret",
            },
            json={
                "model": "tts-1",
                "input": "Hello there!",
                "voice": "en-US-AriaNeural",
                "response_format": "mp3",
                "speed": 1.0,
            },
        )

    @patch("app.api.endpoints.chat_ai.httpx.AsyncClient")
    @patch("app.api.endpoints.chat_ai.settings")
    async def test_returns_service_unavailable_when_tts_is_not_configured(
        self,
        settings,
        async_client,
    ):
        settings.EDGE_TTS_BASE_URL = ""

        with self.assertRaises(HTTPException) as raised:
            await synthesize_chat_audio(
                TTSRequest(text="こんにちは", language="Japanese"),
                {"id": "learner-id"},
            )

        self.assertEqual(raised.exception.status_code, 503)
        async_client.assert_not_called()

    @patch("app.api.endpoints.chat_ai.httpx.AsyncClient")
    @patch("app.api.endpoints.chat_ai.settings")
    async def test_maps_upstream_failure_to_gateway_error(self, settings, async_client):
        settings.EDGE_TTS_BASE_URL = "http://tts.local"
        settings.EDGE_TTS_API_KEY = ""
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.__aexit__.return_value = False
        client.post.return_value = httpx.Response(
            401,
            request=httpx.Request("POST", "http://tts.local/v1/audio/speech"),
        )
        async_client.return_value = client

        with self.assertRaises(HTTPException) as raised:
            await synthesize_chat_audio(
                TTSRequest(text="こんにちは", language="Japanese"),
                {"id": "learner-id"},
            )

        self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
