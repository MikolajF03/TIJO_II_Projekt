from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()