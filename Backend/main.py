from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from schemas.ai_analysis import (
    AiProviderError,
    HiveNoteAnalysisRequest,
    HiveNoteAnalysisResponse,
)
from schemas.weather import WeatherProviderError, WeatherReport
from services.ai_service import AiService
from services.weather_service import WeatherService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    async with httpx.AsyncClient() as client:
        app.state.http_client = client
        yield


app = FastAPI(title="SmartBee API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_weather_service() -> WeatherService:
    client: httpx.AsyncClient = app.state.http_client
    return WeatherService(
        http_client=client,
        base_url=settings.open_meteo_url,
    )


def get_ai_service() -> AiService:
    return AiService(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "gemini_configured": str(bool(settings.gemini_api_key)).lower(),
    }


@app.get("/weather", response_model=WeatherReport)
async def get_weather(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> WeatherReport:
    service = get_weather_service()
    try:
        return await service.get_current_weather(latitude=lat, longitude=lon)
    except WeatherProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/ai/analyze", response_model=HiveNoteAnalysisResponse)
async def analyze_hive_note(
    payload: HiveNoteAnalysisRequest,
) -> HiveNoteAnalysisResponse:
    try:
        service = get_ai_service()
        return await service.analyze_note(payload)
    except AiProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc