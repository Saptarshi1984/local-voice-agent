# Sid — Local Voice Agent

A fully local, privacy-first voice assistant. Talk to it like a phone call: it transcribes your speech, reasons about it with a local LLM, and speaks the answer back — no cloud APIs, no data leaving your machine.

Built as "Sid," an email & calendar assistant persona, on a Next.js frontend backed by a local Ollama model and a Python speech sidecar.

## How it works

```
Browser (mic)                Next.js app (:3000)              Python voice-service (:8001)
   │  record speech   ──►  /api/transcribe  ───────────────►   faster-whisper (STT, CUDA)
   │                            │
   │                            ▼
   │                       /api/agentChatRes  ──►  Ollama (local LLM, "sid" model)
   │                            │
   │  play audio      ◄──  /api/speak       ◄────────────────  Piper (TTS)
```

- **Frontend** ([src/components/chat-interface.jsx](src/components/chat-interface.jsx)) — records mic audio, runs simple voice-activity detection (RMS + silence timeout) to auto-segment speech, and drives the call UI.
- **Chat** ([src/app/api/agentChatRes/route.ts](src/app/api/agentChatRes/route.ts)) — forwards conversation history to a local [Ollama](https://ollama.com) model.
- **Speech** ([voice-service/server.py](voice-service/server.py)) — a small FastAPI service that transcribes audio with [faster-whisper](https://github.com/SYSTRAN/faster-whisper) and synthesizes replies with [Piper](https://github.com/rhasspy/piper).

## Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.10+
- **[Ollama](https://ollama.com/download)** installed and running
- **NVIDIA GPU + CUDA** — the speech-to-text model runs on `cuda` by default ([voice-service/server.py](voice-service/server.py)). Without a GPU, edit `device="cuda"` to `device="cpu"` in that file (slower, but works).

## Setup

### 1. Clone

```bash
git clone https://github.com/Saptarshi1984/local-voice-agent.git
cd local-voice-agent
```

### 2. Set up the local LLM

Pull the base model and build the "sid" persona on top of it using the included [Modelfile](Modelfile):

```bash
ollama pull llama3.2:3b
ollama create sid -f Modelfile
```

### 3. Set up the voice service (speech-to-text + text-to-speech)

```bash
cd voice-service
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Download the Piper voice model (not included in the repo — see [Notes](#notes)):

```bash
python -m piper.download_voices en_US-lessac-medium --data-dir piper-voices
```

This should produce `piper-voices/en_US-lessac-medium.onnx` and `piper-voices/en_US-lessac-medium.onnx.json`.

Start the service (from `voice-service/`, with the venv active):

```bash
python server.py
```

It listens on `http://127.0.0.1:8001`.

### 4. Set up the frontend

In a separate terminal, from the project root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

Click the green phone button to start a call — the mic stays open and auto-detects when you start/stop talking (no push-to-talk needed). Speak, wait for the pause to be detected, and Sid transcribes, thinks, and replies out loud. Click the red button to hang up. You can also type into the text box instead of talking.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) + [React](https://react.dev) 19, in TypeScript (API routes) and JSX (components)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) components, plain CSS for global styles
- [Ollama](https://ollama.com) for local LLM inference
- Python microservice ([FastAPI](https://fastapi.tiangolo.com)) for speech-to-text and text-to-speech:
  - [faster-whisper](https://github.com/SYSTRAN/faster-whisper) for speech-to-text
  - [Piper](https://github.com/rhasspy/piper) for text-to-speech

## Notes

- The Piper voice model (`voice-service/piper-voices/`) and the Python virtual environment (`voice-service/.venv/`) are gitignored — they're large binary/generated artifacts, not source. Follow the setup steps above to regenerate them locally.
- Everything runs on `localhost`; nothing is sent to a third-party service.
