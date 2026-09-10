import tempfile, os, ctypes, io, wave

# ctranslate2 (faster-whisper's backend) dlopen()s libcublas/libcudnn lazily on
# first inference. The pip nvidia-cublas-cu12/nvidia-cudnn-cu12 packages ship those
# .so files under site-packages but don't register them with the dynamic linker.
# LD_LIBRARY_PATH can't fix this from inside Python either: glibc reads it once at
# process startup, before this code runs, so mutating os.environ has no effect on
# later dlopen() calls. Preloading the .so files by absolute path puts them in the
# process's global symbol table instead, so ctranslate2's own dlopen("libcublas.so.12")
# finds them already resident regardless of search path.
import nvidia.cublas as _cublas
import nvidia.cudnn as _cudnn

ctypes.CDLL(os.path.join(_cublas.__path__[0], "lib", "libcublas.so.12"), mode=ctypes.RTLD_GLOBAL)
ctypes.CDLL(os.path.join(_cudnn.__path__[0], "lib", "libcudnn.so.9"), mode=ctypes.RTLD_GLOBAL)

from fastapi import FastAPI, UploadFile, Response
from faster_whisper import WhisperModel
from piper import PiperVoice
from pydantic import BaseModel

model = WhisperModel("small.en", device="cuda", compute_type="int8_float16")

VOICE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "piper-voices", "en_US-lessac-medium.onnx")
voice = PiperVoice.load(VOICE_MODEL_PATH, use_cuda=False)

app = FastAPI()

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        segments, _ = model.transcribe(path, language="en")
        text = "".join(seg.text for seg in segments)
        return {"text": text.strip()}
    finally:
        os.remove(path)

class SpeakRequest(BaseModel):
    text: str

@app.post("/speak")
async def speak(req: SpeakRequest):
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wav_file:
        voice.synthesize_wav(req.text, wav_file)
    return Response(content=wav_io.getvalue(), media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)