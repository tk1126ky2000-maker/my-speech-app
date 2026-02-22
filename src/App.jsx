import { useState, useEffect, useRef } from "react";
import {
  Box, Button, Typography, Paper, Stack, IconButton, CircularProgress, TextField
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

const SPLIT_TIME_MS = 5 * 60 * 1000;

// --- 認証用コンポーネント ---
function AuthGate({ onAuthSuccess }) {
  const [input, setInput] = useState("");
  // ★ここで好きなパスワードを設定してください
  const SECRET_PASSWORD = "sugano1111"; 

  const handleCheck = () => {
    if (input === SECRET_PASSWORD) {
      sessionStorage.setItem("app_is_authorized", "true");
      onAuthSuccess();
    } else {
      alert("合言葉が違います");
      setInput("");
    }
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f0f2f5" }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: "20px", textAlign: "center", width: "100%", maxWidth: "350px" }}>
        <LockOutlinedIcon sx={{ fontSize: 40, color: "#3182ce", mb: 2 }} />
        <Typography variant="h6" fontWeight="bold" gutterBottom>認証が必要です</Typography>
        <TextField 
          fullWidth 
          type="password" 
          label="合言葉" 
          variant="outlined" 
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          sx={{ mb: 2, mt: 2 }}
        />
        <Button fullWidth variant="contained" onClick={handleCheck} sx={{ borderRadius: "10px", py: 1.5, backgroundColor: "#3182ce" }}>
          入室する
        </Button>
      </Paper>
    </Box>
  );
}

// --- メインのアプリコンテンツ（元の App の中身） ---
function AppContent() {
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("minutes_history_v12");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentText, setCurrentText] = useState(""); 
  const [interimText, setInterimText] = useState(""); 
  const [lastSplitTime, setLastSplitTime] = useState(Date.now());
  const [progress, setProgress] = useState(0);

  const recognitionRef = useRef(null);
  const historyEndRef = useRef(null);
  const mainScrollRef = useRef(null);
  const processedIndexRef = useRef(-1);
  const isRestartingRef = useRef(false);

  const currentTextRef = useRef(currentText);
  useEffect(() => { currentTextRef.current = currentText; }, [currentText]);

  const lastSplitTimeRef = useRef(lastSplitTime);
  useEffect(() => { lastSplitTimeRef.current = lastSplitTime; }, [lastSplitTime]);

  const isRecordingRef = useRef(isRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => {
    localStorage.setItem("minutes_history_v12", JSON.stringify(history));
    historyEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [history]);

  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({
        top: mainScrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [currentText, interimText]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isRecording) {
        setProgress(0);
        return;
      }
      const elapsed = Date.now() - lastSplitTime;
      const newProgress = Math.min((elapsed / SPLIT_TIME_MS) * 100, 100);
      setProgress(newProgress);
    }, 100);
    return () => clearInterval(timer);
  }, [lastSplitTime, isRecording]);

  const moveToHistory = (text) => {
    if (!text.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setHistory((prev) => [...prev, { text, time }]);
    setCurrentText(""); 
    setInterimText("");
    setLastSplitTime(Date.now()); 
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      if (isRestartingRef.current || !isRecordingRef.current) return;

      let newFinalText = "";
      let currentInterim = "";
      let latestPhrase = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const cleanTranscript = event.results[i][0].transcript.replace(/。/g, '');
        if (event.results[i].isFinal) {
          if (i <= processedIndexRef.current) continue;
          newFinalText += cleanTranscript;
          latestPhrase += cleanTranscript;
          processedIndexRef.current = i;
        } else {
          currentInterim += cleanTranscript;
          latestPhrase += cleanTranscript;
        }
      }

      if (newFinalText) setCurrentText(prev => prev + newFinalText);
      setInterimText(currentInterim);

      const now = Date.now();
      if (now - lastSplitTimeRef.current >= SPLIT_TIME_MS) {
        const pattern = /[！？]|です|ます|でした|ました|思う|思った|思いました/;
        if (pattern.test(latestPhrase)) {
          const fullContent = (currentTextRef.current + newFinalText + currentInterim).trim();
          moveToHistory(fullContent);
          isRestartingRef.current = true;
          recognition.stop(); 
          return;
        }
      }
    };

    recognition.onstart = () => { isRestartingRef.current = false; processedIndexRef.current = -1; };
    recognition.onend = () => { if (isRecordingRef.current) recognition.start(); };
    recognitionRef.current = recognition;

    return () => recognition.stop();
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      const leftover = (currentText + interimText).trim();
      if (leftover) moveToHistory(leftover);
      isRecordingRef.current = false; 
      recognitionRef.current?.stop();
    } else {
      setLastSplitTime(Date.now());
      setCurrentText("");
      setInterimText("");
      isRestartingRef.current = false;
      processedIndexRef.current = -1;
      isRecordingRef.current = true;
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  const handleDownloadTxt = () => {
    if (history.length === 0) return alert("ログがありません。");
    const textData = history.map(h => `[${h.time}] ${h.text}`).join('\n\n');
    const blob = new Blob([textData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    a.download = `minutes_${now.getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box sx={{ width: "100vw", height: "100vh", display: "flex", backgroundColor: "#f0f2f5", overflow: "hidden" }}>
      {/* 左：履歴エリア */}
      <Box sx={{ width: "350px", backgroundColor: "#fff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle1" fontWeight="800">履歴</Typography>
          <Box>
            <IconButton size="small" onClick={handleDownloadTxt}><DownloadIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={() => {
              navigator.clipboard.writeText(history.map(h => `[${h.time}] ${h.text}`).join('\n\n'));
            }}><ContentCopyIcon fontSize="small" /></IconButton>
            <IconButton size="small" color="error" onClick={() => window.confirm("全消去？") && setHistory([])}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
          <Stack spacing={2}>
            {history.map((msg, i) => (
              <Paper key={i} elevation={0} sx={{ p: 2, borderRadius: "12px", border: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">{msg.time}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>{msg.text}</Typography>
              </Paper>
            ))}
            <div ref={historyEndRef} />
          </Stack>
        </Box>
      </Box>

      {/* 右：メインエリア */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh" }}>
        <Box sx={{ flex: 1, p: 4, display: "flex", justifyContent: "center", overflow: "hidden" }}>
          <Paper ref={mainScrollRef} elevation={0} sx={{ width: "100%", maxWidth: "700px", height: "100%", p: 4, borderRadius: "24px", border: "2px solid", borderColor: progress >= 100 ? "#ed8936" : "#eee", backgroundColor: "#fff", overflowY: "auto", transition: "border-color 0.3s" }}>
            <Typography sx={{ fontSize: "1.5rem", lineHeight: 1.8, color: "#1a202c", whiteSpace: "pre-wrap" }}>
              {currentText}<span style={{ color: "#a0aec0" }}>{interimText}</span>
            </Typography>
          </Paper>
        </Box>
        <Box sx={{ p: 4, display: "flex", justifyContent: "center", backgroundColor: "#fff", borderTop: "1px solid #e0e0e0", flexShrink: 0 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress variant="determinate" value={progress} size={100} thickness={4} sx={{ color: progress >= 100 ? "#ed8936" : "#3182ce", position: 'absolute', top: -10, left: -10 }} />
            <Button variant="contained" onClick={toggleRecording} sx={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: isRecording ? "#e53e3e" : "#3182ce", '&:hover': { backgroundColor: isRecording ? "#c53030" : "#2b6cb0" } }}>
              <MicIcon sx={{ fontSize: 40 }} />
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// --- 最終的な App コンポーネント ---
export default function App() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // タブを開いている間だけ有効な認証チェック
    if (sessionStorage.getItem("app_is_authorized") === "true") {
      setAuthorized(true);
    }
  }, []);

  return authorized ? <AppContent /> : <AuthGate onAuthSuccess={() => setAuthorized(true)} />;
}