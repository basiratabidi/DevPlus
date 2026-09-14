from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from transcribe import transcribe_audio
from text_to_speech import text_to_speech
from error_report import report_error

app = FastAPI(title="DevPulse AI Service")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    try:
        buffer = await file.read()
        text = transcribe_audio(buffer, file.content_type or "audio/ogg")
        return {"text": text}
    except Exception as e:
        report_error("/transcribe", e)
        raise HTTPException(status_code=500, detail=str(e))


class SpeakRequest(BaseModel):
    text: str
    known_lang: str | None = None


@app.post("/speak")
def speak(req: SpeakRequest):
    try:
        audio_bytes = text_to_speech(req.text, req.known_lang)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        report_error("/speak", e)
        raise HTTPException(status_code=500, detail=str(e))