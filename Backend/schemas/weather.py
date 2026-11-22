from pydantic import BaseModel, Field


class WeatherProviderError(Exception):
    """Raised when fetching or parsing external weather data fails."""


class WeatherReport(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    temperature_c: float
    wind_speed_kmh: float
    precipitation_mm: float
    weather_code: int
    observed_at: str