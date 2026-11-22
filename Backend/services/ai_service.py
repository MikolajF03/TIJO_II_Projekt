import json

from google import genai
from google.genai import types
from pydantic import ValidationError

from schemas.ai_analysis import (
    AiProviderError,
    HiveNoteAnalysisRequest,
    HiveNoteAnalysisResponse,
)


class AiService:
    """Analyzes hive inspection notes with Gemini and returns structured JSON."""

    SYSTEM_INSTRUCTION = (
        "You are an assistant supporting beekeeping hive inspections. "
        "Analyze the inspector note and any optional weather metrics. "
        "Be concise, practical, and objective. "
        "Set risk_level to one of: low, medium, high."
    )

    def __init__(
        self,
        api_key: str,
        model: str,
        client: genai.Client | None = None,
    ) -> None:
        if not api_key.strip() and client is None:
            raise AiProviderError("GEMINI_API_KEY is not configured.")

        self._model = model
        self._client = client or genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(api_version="v1beta"),
        )

    def _build_prompt(self, payload: HiveNoteAnalysisRequest) -> str:
        weather_lines: list[str] = []
        if payload.temperature_c is not None:
            weather_lines.append(f"temperature_c: {payload.temperature_c}")
        if payload.wind_speed_kmh is not None:
            weather_lines.append(f"wind_speed_kmh: {payload.wind_speed_kmh}")
        if payload.precipitation_mm is not None:
            weather_lines.append(f"precipitation_mm: {payload.precipitation_mm}")

        weather_section = (
            "\n".join(weather_lines) if weather_lines else "not provided"
        )
        return (
            f"Inspection note:\n{payload.note.strip()}\n\n"
            f"Weather context:\n{weather_section}"
        )

    async def analyze_note(
        self,
        payload: HiveNoteAnalysisRequest,
    ) -> HiveNoteAnalysisResponse:
        prompt = self._build_prompt(payload)
        config = types.GenerateContentConfig(
            system_instruction=self.SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=HiveNoteAnalysisResponse,
            temperature=0.2,
        )

        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config,
            )
        except Exception as exc:
            raise AiProviderError(
                f"Failed to generate analysis from Gemini API: {exc}"
            ) from exc

        raw_text = response.text
        if not raw_text:
            raise AiProviderError("Empty response received from Gemini API.")

        try:
            parsed = json.loads(raw_text)
            return HiveNoteAnalysisResponse.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise AiProviderError(
                f"Failed to parse structured JSON from Gemini response: {exc}"
            ) from exc