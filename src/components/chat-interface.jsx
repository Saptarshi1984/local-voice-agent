'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Phone, Plus, Settings } from 'lucide-react';

import { Message, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';

const SILENCE_MS = 1500;
const VOICE_THRESHOLD = 0.02;

function computeRms(analyser) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / data.length);
}

// Lives outside the component so its rAF-driven, non-idempotent timing
// (performance.now(), recursive scheduling) is never in the render path.
function monitorSilence(refs, onSilenceCut) {
  if (!refs.isInCallRef.current) return;

  if (refs.isSpeakingRef.current) {
    refs.vadFrameRef.current = requestAnimationFrame(() => monitorSilence(refs, onSilenceCut));
    return;
  }

  const rms = computeRms(refs.analyserRef.current);
  const now = performance.now();

  if (rms > VOICE_THRESHOLD) {
    refs.lastVoiceTimeRef.current = now;
    refs.hasSpeechRef.current = true;
  } else if (refs.hasSpeechRef.current && now - refs.lastVoiceTimeRef.current > SILENCE_MS) {
    refs.hasSpeechRef.current = false;
    refs.mediaRecorderRef.current.stop();
    onSilenceCut();
  }

  refs.vadFrameRef.current = requestAnimationFrame(() => monitorSilence(refs, onSilenceCut));
}

export function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [cardState, setCardState] = useState('Ready');
  const [agentState, setAgentState] = useState('Sleeping...');
  const [isInCall, setIsInCall] = useState(false);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const vadFrameRef = useRef(null);
  const lastVoiceTimeRef = useRef(null);
  const hasSpeechRef = useRef(false);
  const isInCallRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const transcriptRef = useRef(null);
  const messagesRef = useRef([]);

  useEffect(() => {
    messagesRef.current = messages;
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e, overrideText) {
    e.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text) return;

    const userMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const chatHistory = [...messagesRef.current, userMessage];
    setMessages(chatHistory);
    setAgentState('Thinking...');
    setCardState('Busy...');
    setInput('');

    try {
      const res = await fetch('/api/agentChatRes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const data = await res.json();
      const replyText = data.message?.content ?? '';
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: replyText },
      ]);
      setCardState('Ready');
      setAgentState('Awake...');
      if (replyText.trim()) {
        await speak(replyText);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, something went wrong talking to Sid.',
        },
      ]);
    }
  }

  function startSegment() {
    const recorder = new MediaRecorder(streamRef.current);
    audioChunksRef.current = [];
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    recorder.onstop = handleSegmentStop;
    recorder.start();
    mediaRecorderRef.current = recorder;
  }

  async function handleSegmentStop() {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (blob.size < 4000) return; // near-silent clip, skip the round-trip

    setCardState('Transcribing...');
    try {
      const formData = new FormData();
      formData.append('audio', blob);
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
      const { text } = await res.json();
      if (text && text.trim()) {
        handleSend({ preventDefault() {} }, text);
      } else {
        setCardState('Listening...');
      }
    } catch (err) {
      setCardState('Listening...');
    }
  }

  async function speak(text) {
    if (!text || !text.trim()) return;

    const wasInCall = isInCallRef.current;
    if (wasInCall) {
      isSpeakingRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null; // don't trigger handleSegmentStop for this stop
        recorder.stop();
      }
    }

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`Speak failed: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(resolve);
      });

      URL.revokeObjectURL(url);
    } catch (err) {
      // playback failure shouldn't break the chat flow
    } finally {
      if (wasInCall && isInCallRef.current) {
        isSpeakingRef.current = false;
        hasSpeechRef.current = false;
        lastVoiceTimeRef.current = performance.now();
        setCardState('Listening...');
        startSegment();
      } else {
        isSpeakingRef.current = false;
      }
    }
  }

  async function startCall() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    hasSpeechRef.current = false;
    lastVoiceTimeRef.current = performance.now();
    isInCallRef.current = true;
    setIsInCall(true);
    setAgentState('Awake...');
    setCardState('Listening...');

    startSegment();
    const refs = {
      isInCallRef,
      analyserRef,
      lastVoiceTimeRef,
      hasSpeechRef,
      mediaRecorderRef,
      vadFrameRef,
      isSpeakingRef,
    };
    vadFrameRef.current = requestAnimationFrame(() => monitorSilence(refs, startSegment));
  }

  function endCall() {
    isInCallRef.current = false;
    setIsInCall(false);
    if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();

    setCardState('Ready');
    setAgentState('Sleeping...');
  }

  function toggleCall() {
    if (isInCall) {
      endCall();
    } else {
      startCall();
    }
  }

  return (
    <div className="flex h-screen flex-col gap-4 p-4">
      <div className="mx-auto flex w-full max-w-4xl gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-md font-semibold">Transcripts:</CardTitle>
          </CardHeader>
          <CardContent
            ref={transcriptRef}
            className="scrollbar-hover flex h-100 flex-col gap-4 overflow-y-auto border-t border-b border-border p-4"
          >
            {messages.length === 0 ? (
              <>
                <h1 className="m-auto w-100 text-sm text-muted-foreground">
                  This is your caht history with Sid. Ask Sid to read emails, schedule meetings, and
                  more...
                </h1>
              </>
            ) : (
              messages.map((message) => (
                <Message key={message.id} align={message.role === 'user' ? 'end' : 'start'}>
                  <MessageContent>
                    <Bubble variant={message.role === 'user' ? 'default' : 'secondary'}>
                      <BubbleContent>{message.content}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              ))
            )}
          </CardContent>
          <CardFooter>
            <p className="text-sm text-muted-foreground">{cardState}</p>
          </CardFooter>
        </Card>
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Avatar>
                <AvatarFallback className="relative overflow-hidden">
                  <span className="avatar-orb avatar-orb-1" />
                  <span className="avatar-orb avatar-orb-2" />
                  <span className="avatar-orb avatar-orb-3" />
                </AvatarFallback>
              </Avatar>
              Sid
            </CardTitle>
            <CardDescription>Email & Calendar agent</CardDescription>
            <CardAction className="text-sm text-muted-foreground">{agentState}</CardAction>
          </CardHeader>
          <CardContent>
            <p>Card Content</p>
          </CardContent>
        </Card>
      </div>
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2">
        <form onSubmit={handleSend} className="flex w-[75%] items-center gap-2">
          <InputGroup>
            <InputGroupTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleSend(e);
                }
              }}
              id="block-end-textarea"
              placeholder="Ask Sid to read emails, schedule meetings, and more..."
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Add attachment"
              >
                <Plus />
              </InputGroupButton>
              <InputGroupButton
                type="submit"
                variant="default"
                size="sm"
                className="ml-auto cursor-pointer"
              >
                Post
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <div
          id="speech-pad"
          className="grid w-[25%] grid-cols-2 place-content-center justify-items-center gap-2 rounded-2xl border-2 border-border p-4"
        >
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-full border border-border cursor-pointer"
            aria-label="Toggle microphone"
          >
            <Mic className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={toggleCall}
            className={`rounded-full border-2 text-white cursor-pointer ${
              isInCall
                ? 'bg-red-500 border-red-600 animate-pulse'
                : 'bg-green-500 border-green-600'
            }`}
            aria-label={isInCall ? 'End call' : 'Start call'}
          >
            <Phone className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-full border border-border cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="size-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
