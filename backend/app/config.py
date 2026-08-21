from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./archviz.db"
    jwt_secret: str = "dev-only-secret-change-me-in-production-0123456789"
    jwt_expires_minutes: int = 60 * 24
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_prefix": "ARCHVIZ_", "env_file": ".env"}


settings = Settings()
