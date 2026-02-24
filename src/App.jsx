import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box, Button, Typography, Paper, Stack, IconButton, CircularProgress,
  TextField, Dialog, DialogContent, DialogTitle, DialogActions, Slide
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
// 録音中の波紋アニメーション用のスタイル
import { keyframes } from "@emotion/react";

// --- 設定項目 ---
const SPLIT_TIME_MS = 5 * 60 * 1000; // ログを区切る時間（5分）
const SPLIT_TIME_TEXT = "5分";
const APP_PASSWORD = "1234"; // ★ここに好きなパスワードを設定してください★
// ----------------

// 波紋アニメーションの定義
const ripple = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(229, 62, 62, 0.4); }
  70% { box-shadow: 0 0 0 20px rgba(229, 62, 62, 0); }
  100% { box-shadow: 0 0 0 0 rgba(229, 62, 62, 0); }
`;

// ダイアログのアニメーション
const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

function App() {
  // --- ログイン状態の管理 ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [loginError, setLoginError] = useState(false);

  const handleLogin = () => {
    if (inputPassword === APP_PASSWORD) {
      setIsLoggedIn(true);
      localStorage.setItem("isLoggedIn_v1", "true"); // ログイン状態を保存
    } else {
      setLoginError(true);
    }
  };

  useEffect(() => {
    // 前回のログイン状態をチェック
    const savedLoginState = localStorage.getItem("isLoggedIn_v1");
    if (savedLoginState === "true") {
      setIsLoggedIn(true);
    }
  }, []);
  // -----------------------

  // --- アプリ本体の状態管理 ---
  const [isRecording, setIsRecording] = useState(false);
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("minutes_history_v12");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentText, setCurrentText] = useState(""); 
  const [interimText, setInterimText] = useState(""); 
  const [lastSplitTime, setLastSplitTime] = useState(Date.now());
  const [progress, setProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState(null); // ダウンロード完了メッセージ用

  const recognitionRef = useRef(null);
  const historyEndRef = useRef(null);
  const processedIndexRef = useRef(-1);
  const isRestartingRef = useRef(false);
  const textEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const wakeLockRef = useRef(null);

  // Stateの最新値をRefに保持（useEffect内での参照用）
  const currentTextRef = useRef(currentText);
  useEffect(() => { currentTextRef.current = currentText; }, [currentText]);
  const lastSplitTimeRef = useRef(lastSplitTime);
  useEffect(() => { lastSplitTimeRef.current = lastSplitTime; }, [lastSplitTime]);
  const isRecordingRef = useRef(isRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // 履歴の保存とスクロール
  useEffect(() => {
    localStorage.setItem("minutes_history_v12", JSON.stringify(history));
    if (history.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [history]);

  // リアルタイムテキストの自動スクロール
  useEffect(() => {
    if (isRecording) {
      textEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentText, interimText, isRecording]);

  // 5分タイマーの進行状況管理
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

  // テキストを履歴に移動させる関数
  const moveToHistory = useCallback((text) => {
    if (!text.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setHistory((prev) => [...prev, { text, time }]);
    setCurrentText(""); 
    setInterimText("");
    setLastSplitTime(Date.now()); 
  }, []);

  // 音声認識のセットアップ
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
          currentInterim += event.results[i][0].transcript;
        }
      }

      if (newFinalText) setCurrentText(prev => prev + newFinalText);
      setInterimText(currentInterim);

      // 一定時間経過後に文の区切りが来たらログに移す
      const now = Date.now();
      if (now - lastSplitTimeRef.current >= SPLIT_TIME_MS) {
        const pattern = /[。！？]|です|ます|でした|ました|思う|思った|思いました/;
        if (pattern.test(latestPhrase)) {
          const fullContent = (currentTextRef.current + newFinalText + currentInterim).trim();
          moveToHistory(fullContent);
          isRestartingRef.current = true;
          recognition.stop(); 
        }
      }
    };

    // エラーハンドリング（許可エラー以外は無視して継続）
    recognition.onerror = (event) => {
      console.warn("音声認識エラー:", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        alert("マイクのアクセスが許可されていません。設定を確認してください。");
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    // 停止したら自動再起動（ゾンビ機能）
    recognition.onend = () => {
      if (isRecordingRef.current) {
        setTimeout(() => { try { recognition.start(); } catch (e) { console.error(e); } }, 500);
      }
    };

    recognitionRef.current = recognition;
    return () => { recognition.stop(); };
  }, [moveToHistory]);

  // 画面スリープ防止機能
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("Wake Lock active");
      }
    } catch (err) { console.error(err); }
  };
  const releaseWakeLock = () => {
    wakeLockRef.current?.release().then(() => { wakeLockRef.current = null; });
  };

  // 録音の開始/停止ボタンの処理
  const toggleRecording = async () => {
    if (isRecording) {
      // 停止処理
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      const leftoverText = (currentText + interimText).trim();
      if (leftoverText) moveToHistory(leftoverText);
      
      isRecordingRef.current = false; 
      recognitionRef.current?.stop();
      releaseWakeLock();
    } else {
      // 開始処理
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

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        
        // 録音停止時にファイルをダウンロード
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
          // 親切なメッセージを表示
          setDownloadMessage("音声ファイルをダウンロードしました！");
        };

        mediaRecorder.start();
        await requestWakeLock();
      } catch (err) {
        alert("マイクのアクセスが許可されていません。");
        return;
      }
      isRecordingRef.current = true;
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };

  // テキストログのダウンロード
  const handleDownloadTxt = () => {
    if (history.length === 0) { alert("保存するログがありません。"); return; }
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

  // === メイン描画処理 ===

  // ログインしていない場合はパスワード画面を表示
  if (!isLoggedIn) {
    return (
      <Box sx={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f0f2f5", p: 2 }}>
        <Paper elevation={3} sx={{ p: 4, width: "100%", maxWidth: "400px", textAlign: "center", borderRadius: "16px" }}>
          <Typography variant="h5" fontWeight="bold" gutterBottom>AI議事録アプリ</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>パスワードを入力してください</Typography>
          <TextField
            fullWidth type="password" label="Password" variant="outlined"
            value={inputPassword} onChange={(e) => { setInputPassword(e.target.value); setLoginError(false); }}
            error={loginError} helperText={loginError ? "パスワードが間違っています" : ""} sx={{ mb: 3 }}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <Button fullWidth variant="contained" size="large" onClick={handleLogin} sx={{ borderRadius: "30px", fontWeight: "bold", py: 1.5 }}>
            ログイン
          </Button>
        </Paper>
      </Box>
    );
  }

  // ログイン後はアプリ本編を表示
  return (
    <Box sx={{ width: "100vw", height: "100vh", display: "flex", flexDirection: { xs: "column-reverse", md: "row" }, backgroundColor: "#f0f2f5", overflow: "hidden" }}>
      
      {/* 左メニュー（スマホは下） */}
      <Box sx={{ width: { xs: "100%", md: "350px" }, height: { xs: "40%", md: "100%" }, backgroundColor: "#fff", borderRight: { md: "1px solid #e0e0e0" }, borderTop: { xs: "1px solid #e0e0e0", md: "none" }, display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="subtitle1" fontWeight="800">ログ一覧</Typography>
          <Box>
            <IconButton size="small" onClick={handleDownloadTxt}><DownloadIcon /></IconButton>
            <IconButton size="small" onClick={() => navigator.clipboard.writeText(history.map(h => `[${h.time}] ${h.text}`).join('\n\n'))}><ContentCopyIcon /></IconButton>
            <IconButton size="small" color="error" onClick={() => window.confirm("履歴を全消去しますか？") && setHistory([])}><DeleteOutlineIcon /></IconButton>
          </Box>
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, md: 2 } }}>
          <Stack spacing={1.5}>
            {history.map((msg, i) => (
              <Paper key={i} elevation={0} sx={{ p: 1.5, borderRadius: "12px", border: "1px solid #f0f0f0", backgroundColor: "#fafafa" }}>
                <Typography variant="caption" color="textSecondary" fontWeight="bold">{msg.time}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>{msg.text}</Typography>
              </Paper>
            ))}
            <div ref={historyEndRef} />
          </Stack>
        </Box>
      </Box>

      {/* メイン画面（スマホは上） */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 2, md: 4 }, overflow: "hidden" }}>
          <Paper elevation={0} sx={{ width: "100%", maxWidth: "700px", maxHeight: "100%", p: { xs: 3, md: 4 }, borderRadius: "24px", border: "2px solid", borderColor: progress >= 100 ? "#ed8936" : "#fff", backgroundColor: "#fff", display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
            <Box sx={{ mb: 2, textAlign: "center" }}>
              <Typography variant="overline" color={progress >= 100 ? "#ed8936" : "textSecondary"} sx={{ fontWeight: "bold", letterSpacing: 1 }}>
                {isRecording ? (progress >= 100 ? "● 保存準備OK（語尾を待っています）" : `○ ${SPLIT_TIME_TEXT}間蓄積中... (${Math.floor(progress)}%)`) : "スタンバイ"}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
              <Typography sx={{ fontSize: { xs: "1.2rem", md: "1.5rem" }, lineHeight: 1.8, color: "#1a202c", fontWeight: 500 }}>
                {currentText}<span style={{ color: "#a0aec0" }}>{interimText}</span>
              </Typography>
              <div ref={textEndRef} />
            </Box>
          </Paper>
        </Box>

        <Box sx={{ p: { xs: 2, md: 4 }, display: "flex", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(10px)", borderTop: "1px solid #e0e0e0", flexShrink: 0 }}>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress variant="determinate" value={progress} size={88} thickness={3} sx={{ color: progress >= 100 ? "#ed8936" : "#3182ce", position: 'absolute', top: -4, left: -4, zIndex: 1 }} />
            <Button variant="contained" onClick={toggleRecording} sx={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: isRecording ? "#e53e3e" : "#3182ce", boxShadow: "0 4px 14px rgba(0,0,0,0.2)", animation: isRecording ? `${ripple} 1.5s infinite ease-in-out` : "none", zIndex: 2 }}>
              <MicIcon sx={{ fontSize: 40 }} />
            </Button>
          </Box>
        </Box>

        {/* ダウンロード完了メッセージ */}
        <Dialog open={!!downloadMessage} TransitionComponent={Transition} keepMounted onClose={() => setDownloadMessage(null)}>
          <DialogTitle>ダウンロード完了！</DialogTitle>
          <DialogContent><Typography>{downloadMessage}</Typography></DialogContent>
          <DialogActions><Button onClick={() => setDownloadMessage(null)}>OK</Button></DialogActions>
        </Dialog>

      </Box>
    </Box>
  );
}

export default App;