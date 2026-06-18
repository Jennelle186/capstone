import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from google import genai

client = genai.Client(
    vertexai=True,
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location="global",
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Say hello in Tagalog",
)
print(response.text)
