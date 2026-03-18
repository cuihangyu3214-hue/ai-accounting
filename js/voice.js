/**
 * 语音识别 — Web Speech API
 */

class VoiceService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onResult = null;
    this.onInterim = null;
    this.onStart = null;
    this.onEnd = null;
    this.onError = null;
    this._init();
  }

  _init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e) => {
      let finalText = '';
      let interimText = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (interimText && this.onInterim) {
        this.onInterim(interimText);
      }

      if (finalText && this.onResult) {
        this.onResult(finalText);
      }
    };

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onStart) this.onStart();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };

    this.recognition.onerror = (e) => {
      this.isListening = false;
      if (this.onError) this.onError(e.error);
    };
  }

  get isSupported() {
    return !!this.recognition;
  }

  start() {
    if (!this.recognition) return;
    if (this.isListening) {
      this.stop();
      return;
    }
    try {
      this.recognition.start();
    } catch (e) {
      // 已经在监听
      console.warn('Recognition already started');
    }
  }

  stop() {
    if (!this.recognition) return;
    this.recognition.stop();
  }
}

const voice = new VoiceService();
