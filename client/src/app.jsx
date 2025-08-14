import React, { useState, useRef, useEffect } from 'react';

// Main App component
export default function App() {
  // State variables for file upload and display
  const [file, setFile] = useState(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [sentiment, setSentiment] = useState(null);
  
  // State variables for real-time recording
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  
  // General UI and data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Firestore & Auth state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRecordingSupported, setIsRecordingSupported] = useState(true);

  // Ref to access the file input element
  const fileInputRef = useRef(null);

  // --- Firebase Initialization and Authentication ---
  useEffect(() => {
    // Check if Firebase config and global functions are available
    if (typeof __firebase_config !== 'undefined' && typeof __app_id !== 'undefined' && window.firebase) {
      const { initializeApp } = window.firebase.app;
      const { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = window.firebase.auth;
      const { getFirestore, collection, addDoc, onSnapshot, query } = window.firebase.firestore;

      const firebaseConfig = JSON.parse(__firebase_config);
      const app = initializeApp(firebaseConfig);
      const dbInstance = getFirestore(app);
      const authInstance = getAuth(app);
      
      setDb(dbInstance);
      setAuth(authInstance);

      // Listen for auth state changes to get the user ID
      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          setUserId(crypto.randomUUID()); // Use a random ID for anonymous users
        }
        setIsAuthReady(true);
      });

      // Try to sign in with the custom token if available
      const signIn = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(authInstance, __initial_auth_token);
          } catch (e) {
            console.error("Failed to sign in with custom token, signing in anonymously.", e);
            await signInAnonymously(authInstance);
          }
        } else {
          await signInAnonymously(authInstance);
        }
      };
      
      signIn();

      // Clean up the auth listener
      return () => unsubscribe();
    } else {
      console.error("Firebase configuration or global libraries are not available.");
    }
  }, []);

  // --- Firestore Data Listener ---
  useEffect(() => {
    if (isAuthReady && db && userId) {
      // Get the necessary Firestore functions from the global scope
      const { collection, onSnapshot, query } = window.firebase.firestore;
      
      // Use the public data path for a collaborative app
      const analysisCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/analysis`);
      
      // onSnapshot listens for real-time updates
      const q = query(analysisCollectionRef);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort history by timestamp in descending order in memory
        history.sort((a, b) => b.timestamp - a.timestamp);
        setAnalysisHistory(history);
      }, (err) => {
        console.error("Failed to fetch analysis history:", err);
      });

      return () => unsubscribe();
    }
  }, [isAuthReady, db, userId]);

  // Handle file selection from file input
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setTranscribedText('');
      setSentiment(null);
      setError('');
    }
  };

  // Handles the analysis process for both file upload and recording
  const analyzeAudio = async (audioFile) => {
    setIsLoading(true);
    setError('');
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(oldProgress => {
        const newProgress = oldProgress + 5;
        return newProgress >= 95 ? 95 : newProgress;
      });
    }, 500);

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await fetch('http://127.0.0.1:5000/analyze', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setTranscribedText(result.transcribed_text);
      setSentiment(result.sentiment);

      // Save the analysis result to Firestore
      if (db) {
        const { collection, addDoc } = window.firebase.firestore;
        const analysisCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/analysis`);
        await addDoc(analysisCollectionRef, {
          transcribedText: result.transcribed_text,
          sentiment: result.sentiment,
          timestamp: Date.now(),
          userId: userId,
        });
      }

    } catch (e) {
      clearInterval(progressInterval);
      setProgress(0);
      setError(`Failed to analyze file: ${e.message}`);
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file analysis (from upload)
  const handleAnalyze = () => {
    if (!file) {
      setError('Please select an audio file first.');
      return;
    }
    analyzeAudio(file);
  };
  
  // --- Real-time Recording Functions ---
  const startRecording = async () => {
    setFile(null); // Clear any previously uploaded file
    setTranscribedText('');
    setSentiment(null);
    setError('');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let recorderOptions = {};

      // Try to use a compatible mimeType, preferably audio/wav
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        recorderOptions.mimeType = 'audio/wav';
        console.log('Using audio/wav for recording.');
      } else {
        console.log('audio/wav not supported, using default browser format.');
      }
      
      const recorder = new MediaRecorder(stream, recorderOptions);
      setMediaRecorder(recorder);
      setAudioChunks([]);
      
      recorder.ondataavailable = (event) => {
        setAudioChunks((currentChunks) => [...currentChunks, event.data]);
      };
      
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: recorder.mimeType || 'audio/webm' });
        const fileExtension = audioBlob.type.split('/')[1];
        const audioFile = new File([audioBlob], `live_recording.${fileExtension}`, { type: audioBlob.type });
        analyzeAudio(audioFile);
        stream.getTracks().forEach(track => track.stop()); // Stop the microphone stream
      };
      
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('Could not access microphone. Please check your browser permissions.');
      console.error('Microphone access error:', err);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };
  
  // Helper function to render a sentiment badge with dynamic styling
  const renderSentimentBadge = (label) => {
    let colorClass = '';
    let bgColorClass = '';
    let emoji = '';
    switch (label) {
      case 'POSITIVE':
        colorClass = 'text-green-800';
        bgColorClass = 'bg-green-100';
        emoji = '😊';
        break;
      case 'NEGATIVE':
        colorClass = 'text-red-800';
        bgColorClass = 'bg-red-100';
        emoji = '😠';
        break;
      case 'NEUTRAL':
        colorClass = 'text-blue-800';
        bgColorClass = 'bg-blue-100';
        emoji = '😐';
        break;
      default:
        colorClass = 'text-gray-800';
        bgColorClass = 'bg-gray-100';
        emoji = '🤔';
        break;
    }
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colorClass} ${bgColorClass}`}>
        {emoji} {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen text-gray-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl rounded-2xl p-[2px] animate-border-gradient">
        <div className="bg-gray-900/80 p-8 rounded-[15px] w-full backdrop-blur-md">
          <h1 className="text-4xl font-extrabold text-center mb-6 text-white">
            Sentiment Analysis
          </h1>
          <p className="text-center text-gray-200 mb-8">
            Upload an audio file or record your voice to analyze its sentiment.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-4">
            {/* Select Audio File Button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isRecording || isLoading}
              className="w-full sm:w-auto px-6 py-3 border-2 border-cyan-500 rounded-full text-lg font-medium text-cyan-500 hover:bg-cyan-500 hover:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span className="flex items-center space-x-2">
                {file ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>{file.name}</span>
                  </>
                ) : (
                  'Select Audio File'
                )}
              </span>
            </button>

            {/* New Record Audio Button */}
            <div className="flex flex-col items-center">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`relative p-4 rounded-full text-white shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${isRecording ? 'bg-red-600' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {isRecording && (
                  <span className="absolute top-0 left-0 h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                )}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 relative z-10">
                  <path d="M12 2A4 4 0 0116 6v7a4 4 0 01-8 0V6a4 4 0 014-4zm0 2c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2s2-.9 2-2V6c0-1.1-.9-2-2-2zM5 13a7 7 0 0014 0h-2a5 5 0 01-10 0H5zm7 7a1 1 0 01-1-1v-4a1 1 0 012 0v4a1 1 0 01-1 1z"/>
                </svg>
              </button>
              <span className="mt-2 text-sm font-medium text-gray-400">
                {isRecording ? 'Stop Recording' : 'Record Audio'}
              </span>
            </div>
          </div>

          {/* Analyze Button - Moved to a new line */}
          <div className="flex justify-center mb-8">
            <button
              onClick={handleAnalyze}
              disabled={!file || isLoading || isRecording}
              className="w-full max-w-sm px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-full text-lg font-semibold shadow-lg hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isLoading ? (
                <span className="flex items-center justify-center space-x-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Analyzing...</span>
                </span>
              ) : (
                'Analyze Audio'
              )}
            </button>
          </div>

          {isLoading && (
            <div className="w-full bg-gray-700 rounded-full h-2.5 mb-6">
              <div
                className="bg-cyan-500 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}

          {error && (
            <div className="bg-red-900 border-l-4 border-red-500 text-red-100 p-4 rounded-lg mb-6" role="alert">
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          )}

          {transcribedText && (
            <div className="space-y-6 mb-8">
              <div>
                <h2 className="text-xl font-bold mb-2 text-white">Transcribed Text</h2>
                <div className="bg-gray-700/50 text-gray-200 p-4 rounded-lg shadow-inner backdrop-blur-md">
                  <p className="font-mono whitespace-pre-wrap">{transcribedText}</p>
                </div>
              </div>
              {sentiment && (
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Sentiment</h2>
                  <div className="flex items-center space-x-4">
                    {renderSentimentBadge(sentiment.label)}
                    <span className="text-lg font-semibold text-gray-200">Score: {sentiment.score.toFixed(4)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Analysis History Section */}
          <div className="mt-8 border-t border-gray-700 pt-6">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="w-full flex justify-between items-center text-lg font-bold text-white hover:text-cyan-400 transition-colors duration-200"
            >
              <span>Analysis History</span>
              <svg className={`w-5 h-5 transform transition-transform duration-200 ${isHistoryOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isHistoryOpen && (
              <div className="mt-4 space-y-4">
                {analysisHistory.length > 0 ? (
                  analysisHistory.map((item) => (
                    <div key={item.id} className="bg-gray-800/60 p-4 rounded-lg backdrop-blur-sm">
                      <p className="text-sm text-gray-400 mb-2">
                        {new Date(item.timestamp).toLocaleString()} - User: <span className="font-mono">{item.userId}</span>
                      </p>
                      <p className="text-gray-200 mb-2 truncate">
                        {item.transcribedText}
                      </p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-300">Sentiment:</span>
                        {renderSentimentBadge(item.sentiment.label)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-center">No analysis history found. Start by analyzing a file!</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
