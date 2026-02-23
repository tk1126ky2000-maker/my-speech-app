// worker.js
import { pipeline } from '@huggingface/transformers';

let transcriber = null;

// モデルのロード
const loadModel = async () => {
    if (!transcriber) {
        // Whisperモデルをロード (WebGPU対応)
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { 
            device: 'webgpu' 
        });
    }
};

self.onmessage = async (e) => {
    const { audioBlob } = e.data;
    await loadModel();

    // ここで音声データを解析
    // 本来はここでpyannoteを組み合わせて話者を特定します
    const output = await transcriber(audioBlob);
    
    self.postMessage({ status: 'complete', output });
};