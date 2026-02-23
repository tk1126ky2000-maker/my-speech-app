import { useState, useEffect, useRef } from "react";
import {
  Box, Button, Typography, Paper, Stack, IconButton, CircularProgress
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";

const SPLIT_TIME_MS = 5 * 60 * 1000;
const SPLIT_TIME_TEXT = "5分";

function App() {
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
  const processedIndexRef = useRef(-1);
  const isRestartingRef = useRef(false);
  const textEndRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const currentTextRef = useRef(currentText);
  useEffect(() => { currentTextRef.current = currentText; }, [currentText]);

  const lastSplitTimeRef = useRef(lastSplitTime);
  useEffect(() => { lastSplitTimeRef.current = lastSplitTime; }, [lastSplitTime]);

  const isRecordingRef = useRef(isRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => {
    localStorage.setItem("minutes_history_v12", JSON.stringify(history));
    if (history.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [history]);

  useEffect(() => {
    if (isRecording) {
      textEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentText, interimText, isRecording]);

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

    recognition.onstart = () => {
      isRestartingRef.current = false;
      processedIndexRef.current = -1;
    };

    recognition.onresult = (event) => {
      if (isRestartingRef.current || !isRecordingRef.current) return;

      let newFinalText = "";
      let currentInterim = "";
      let latestPhrase = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          if (i <= processedIndexRef.current) continue;
          
          const transcript = event.results[i][0].transcript;
          newFinalText += transcript;
          latestPhrase += transcript;
          processedIndexRef.current = i;
        } else {
          const transcript = event.results[i][0].transcript;
          currentInterim += transcript;
          latestPhrase += transcript;
        }
      }

      if (newFinalText) setCurrentText(prev => prev + newFinalText);
      setInterimText(currentInterim);

      const now = Date.now();
      const isOverTimeLimit = now - lastSplitTimeRef.current >= SPLIT_TIME_MS;

      if (isOverTimeLimit) {
        const pattern = /[。！？]|です|ます|でした|ました|思う|思った|思いました/;
        if (pattern.test(latestPhrase)) {
          const fullContent = (currentTextRef.current + newFinalText + currentInterim).trim();
          moveToHistory(fullContent);
          isRestartingRef.current = true;
          recognition.stop(); 
          return;
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("音声認識エラー:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        isRecordingRef.current = false;
      }
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.error("再起動エラー:", e);
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    };
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }

      const leftoverText = (currentText + interimText).trim();
      if (leftoverText) moveToHistory(leftoverText);
      
      isRecordingRef.current = false; 
      recognitionRef.current?.stop();
    } else {
      setLastSplitTime(Date.now());
      setCurrentText("");
      setInterimText("");
      isRestartingRef.current = false;
      processedIndexRef.current = -1;
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const url = URL.createObjectURL(audioBlob);
          const a = document.createElement('a');
          a.href = url;
          const now = new Date();
          const filename = `audio_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.webm`;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        };

        mediaRecorder.start();
      } catch (err) {
        console.error("マイクエラー:", err);
        alert("マイクのアクセスが許可されていません。");
        return;
      }

      isRecordingRef.current = true;
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  const handleDownloadTxt = () => {
    if (history.length === 0) {
      alert("保存するログがありません。");
      return;
    }
    const textData = history.map(h => `[${h.time}] ${h.text}`).join('\n\n');
    const blob = new Blob([textData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const filename = `minutes_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}.txt`;
    
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    // スマホ(xs)の時は縦並び(column-reverseでメインを上に)、PC(md)の時は横並び(row)
    <Box sx={{ width: "100vw", height: "100vh", display: "flex", flexDirection: { xs: "column-reverse", md: "row" }, backgroundColor: "#f0f2f5", overflow: "hidden" }}>
      
      {/* --- 左メニュー（スマホの時は下部に表示） --- */}
      <Box sx={{ 
        width: { xs: "100%", md: "350px" }, 
        height: { xs: "40%", md: "100%" }, // スマホ時は画面の下40%だけ使う
        backgroundColor: "#fff", 
        borderRight: { md: "1px solid #e0e0e0" }, 
        borderTop: { xs: "1px solid #e0e0e0", md: "none" },
        display: "flex", flexDirection: "column" 
      }}>
        <Box sx={{ p: { xs: 1, md: 2 }, borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle1" fontWeight="800" sx={{ fontSize: { xs: "0.9rem", md: "1rem" } }}>ログ一覧</Typography>
          <Box>
            <IconButton size="small" onClick={handleDownloadTxt}><DownloadIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={() => {
              const text = history.map(h => `[${h.time}] ${h.text}`).join('\n\n');
              navigator.clipboard.writeText(text);
            }}><ContentCopyIcon fontSize="small" /></IconButton>
            <IconButton size="small" color="error" onClick={() => window.confirm("履歴を全消去しますか？") && setHistory([])}><DeleteOutlineIcon fontSize="small" /></IconButton>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1, md: 2 } }}>
          <Stack spacing={1}>
            {history.map((msg, index) => (
              <Paper key={index} elevation={0} sx={{ p: 1.5, borderRadius: "8px", border: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">{msg.time}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6, whiteSpace: "pre-wrap", fontSize: { xs: "0.85rem", md: "0.875rem" } }}>{msg.text}</Typography>
              </Paper>
            ))}
            <div ref={historyEndRef} />
          </Stack>
        </Box>
      </Box>

      {/* --- メイン画面（スマホの時は上部に表示） --- */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2, md: 4 }, overflow: "hidden" }}>
          <Paper elevation={0} sx={{ 
            width: "100%", maxWidth: "700px", maxHeight: "100%", p: { xs: 2, md: 4 }, borderRadius: "24px", border: "2px solid",
            borderColor: progress >= 100 ? "#ed8936" : "#fff", backgroundColor: "#fff",
            display: "flex", flexDirection: "column"
          }}>
            <Box sx={{ mb: { xs: 1, md: 2 } }}>
              <Typography variant="overline" color={progress >= 100 ? "#ed8936" : "textSecondary"} sx={{ fontWeight: "bold", fontSize: { xs: "0.65rem", md: "0.75rem" }, lineHeight: 1.2 }}>
                {isRecording ? (progress >= 100 ? "● 保存準備OK（語尾を待っています）" : `○ ${SPLIT_TIME_TEXT}間蓄積中... (${Math.floor(progress)}%)`) : "停止中"}
              </Typography>
            </Box>
            
            <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
              {/* スマホの時は文字を少し小さくする(1.1rem) */}
              <Typography sx={{ fontSize: { xs: "1.1rem", md: "1.5rem" }, lineHeight: 1.8, color: "#1a202c" }}>
                {currentText}<span style={{ color: "#a0aec0" }}>{interimText}</span>
              </Typography>
              <div ref={textEndRef} />
            </Box>
          </Paper>
        </Box>

        <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", justifyContent: "center", backgroundColor: "#fff", borderTop: "1px solid #e0e0e0", flexShrink: 0 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress variant="determinate" value={progress} size={80} thickness={4} sx={{ color: progress >= 100 ? "#ed8936" : "#3182ce", position: 'absolute', top: -5, left: -5 }} />
            <Button variant="contained" onClick={toggleRecording} sx={{ width: 70, height: 70, borderRadius: "50%", backgroundColor: isRecording ? "#e53e3e" : "#3182ce" }}>
              <MicIcon sx={{ fontSize: 35 }} />
            </Button>
          </Box>
        </Box>
      </Box>

    </Box>
  );
}

export default App;