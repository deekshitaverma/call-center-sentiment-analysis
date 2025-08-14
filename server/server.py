import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
from transformers import pipeline

app = Flask(__name__)
# Allow cross-origin requests from the React app
CORS(app)

# Load models once when the server starts
transcription_model = None
sentiment_pipeline = None
server_ready = False

try:
    print("Loading Whisper transcription model...")
    # Using the base Whisper model. Can be changed to "medium" or "large"
    # for better accuracy but will be slower.
    transcription_model = whisper.load_model("base")
    print("Whisper model loaded successfully.")

    print("Loading Hugging Face sentiment analysis model...")
    sentiment_pipeline = pipeline("sentiment-analysis")
    print("Sentiment analysis model loaded successfully.")
    server_ready = True
except Exception as e:
    print(f"Error loading models: {e}")
    # Models failed to load, server will not be able to perform analysis
    server_ready = False

def transcribe_audio(audio_path):
    """
    Transcribes an audio file to text using the Whisper model.
    """
    try:
        result = transcription_model.transcribe(audio_path)
        return result["text"]
    except Exception as e:
        print(f"Error during transcription: {e}")
        return None

def analyze_sentiment(text):
    """
    Analyzes the sentiment of a given text using a pre-trained model.
    """
    if not text:
        return {"label": "NEUTRAL", "score": 0.0}
    
    try:
        result = sentiment_pipeline(text)
        return result[0]
    except Exception as e:
        print(f"Error during sentiment analysis: {e}")
        return {"label": "ERROR", "score": 0.0}

@app.route('/analyze', methods=['POST'])
def analyze_audio_endpoint():
    """
    Endpoint to receive an audio file, analyze it, and return the result.
    """
    print("Received a request to /analyze")
    
    # Check if models were loaded successfully
    if not server_ready:
        return jsonify({"error": "Analysis models failed to load on server startup. Check server logs."}), 500

    # Check if a file was sent
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file part in the request"}), 400
    
    audio_file = request.files['audio']
    
    # Check if the file is empty
    if audio_file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    temp_file_path = None
    try:
        # Use a temporary file to save the uploaded audio
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio_file:
            audio_file.save(temp_audio_file.name)
            temp_file_path = temp_audio_file.name

        print(f"Saved temporary file at: {temp_file_path}")
        
        # Step 1: Transcribe the audio
        transcribed_text = transcribe_audio(temp_file_path)
        
        # Step 2: Analyze the sentiment
        sentiment_result = analyze_sentiment(transcribed_text)
        
        if transcribed_text and sentiment_result:
            return jsonify({
                "transcribed_text": transcribed_text,
                "sentiment": sentiment_result
            }), 200
        else:
            return jsonify({"error": "Analysis failed"}), 500
            
    except Exception as e:
        print(f"Server-side error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Ensure the temporary file is removed even if an error occurs
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            print(f"Removed temporary file at: {temp_file_path}")

if __name__ == '__main__':
    # Run the server on localhost port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
