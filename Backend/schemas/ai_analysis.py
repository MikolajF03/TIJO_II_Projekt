from pydantic import BaseModel, Field


class AiProviderError(Exception):
    """Raised when AI configuration, request, or response parsing fails."""


class HiveNoteAnalysisRequest(BaseModel):
    note: str = Field(..., min_length=1, max_length=4000)
    temperature_c: float | None = None
    wind_speed_kmh: float | None = None
    precipitation_mm: float | None = None


class HiveNoteAnalysisResponse(BaseModel):
    summary: str
    risk_level: str
    recommended_actions: list[str]
    weather_impact: str