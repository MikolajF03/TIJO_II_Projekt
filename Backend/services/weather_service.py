import httpx

from schemas.weather import WeatherProviderError, WeatherReport


class WeatherService:
    """Fetches and normalizes current weather data from Open-Meteo."""

    CURRENT_PARAMS = (
        "temperature_2m,wind_speed_10m,precipitation,weather_code"
    )

    def __init__(self, http_client: httpx.AsyncClient, base_url: str) -> None:
        self._http_client = http_client
        self._base_url = base_url

    async def get_current_weather(
        self,
        latitude: float,
        longitude: float,
    ) -> WeatherReport:
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "current": self.CURRENT_PARAMS,
        }

        try:
            response = await self._http_client.get(
                self._base_url,
                params=params,
                timeout=10.0,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
            raise WeatherProviderError(
                "Failed to fetch weather data from external provider."
            ) from exc

        current = payload.get("current")
        if not isinstance(current, dict):
            raise WeatherProviderError(
                "Unexpected weather payload structure."
            )

        try:
            return WeatherReport(
                latitude=latitude,
                longitude=longitude,
                temperature_c=float(current["temperature_2m"]),
                wind_speed_kmh=float(current["wind_speed_10m"]),
                precipitation_mm=float(current["precipitation"]),
                weather_code=int(current["weather_code"]),
                observed_at=str(current["time"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise WeatherProviderError(
                "Missing or invalid fields in weather response."
            ) from exc