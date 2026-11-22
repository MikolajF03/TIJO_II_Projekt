from google import genai
from google.genai import types

client = genai.Client(
    api_key="",
    http_options=types.HttpOptions(api_version="v1beta"),
)

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Odpowiedz jednym słowem: ok",
    config=types.GenerateContentConfig(
        system_instruction="",
    ),
)
print(resp.text)